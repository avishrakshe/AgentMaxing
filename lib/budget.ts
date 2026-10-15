/**
 * BUDGET GUARD
 *
 * Wraps payAndFetch: reads the price from the 402 challenge BEFORE signing and refuses if it is
 * over MAX_PRICE_PER_CALL_USD or would push today's total over DAILY_BUDGET_USD.
 * Every payment lands in the SpendLog.
 */
import { payAndFetch } from "@/agent/wallet";
import { newId, store } from "./store";
import type { SpendLog } from "./types";

export const dailyBudget = () => Number(process.env.DAILY_BUDGET_USD || 0.5);
export const maxPerCall = () => Number(process.env.MAX_PRICE_PER_CALL_USD || 0.01);

/** Calendar day in IST, e.g. "2026-10-15". The budget resets at IST midnight. */
export const istDay = (d: Date | string = new Date()) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export class BudgetError extends Error {}

export async function spendReport() {
  const all = (await store().list("spend")).sort((a, b) => b.at.localeCompare(a.at));
  const today = istDay();
  const todays = all.filter((s) => istDay(s.at) === today);
  const spentToday = round(todays.reduce((sum, s) => sum + s.amountUsd, 0));
  return {
    day: today,
    spentTodayUsd: spentToday,
    dailyBudgetUsd: dailyBudget(),
    remainingUsd: round(Math.max(0, dailyBudget() - spentToday)),
    maxPricePerCallUsd: maxPerCall(),
    callsToday: todays.length,
    last10: all.slice(0, 10),
  };
}

/** payAndFetch, but under the budget. Throws BudgetError (nothing signed) when it would overspend. */
export async function budgetedFetch(url: string) {
  let price = 0;
  const result = await payAndFetch(url, {
    beforePay: async (challenge) => {
      price = Number(challenge.price);
      if (!Number.isFinite(price) || price < 0) throw new BudgetError(`Refused: unreadable price "${challenge.price}" in 402 challenge.`);
      if (price > maxPerCall()) {
        throw new BudgetError(`Refused: ${url} asks ${price} ${challenge.asset} per call, over the per-call cap of $${maxPerCall()} (MAX_PRICE_PER_CALL_USD).`);
      }
      const { spentTodayUsd } = await spendReport();
      if (spentTodayUsd + price > dailyBudget()) {
        throw new BudgetError(
          `Refused: paying $${price} would bring today's spend to $${round(spentTodayUsd + price)}, over the daily budget of $${dailyBudget()} (DAILY_BUDGET_USD). Spent so far today: $${spentTodayUsd}.`
        );
      }
    },
  });

  if (result.payment && result.payment.status === 200) {
    const entry: SpendLog = {
      id: newId("pay"),
      at: new Date().toISOString(),
      endpoint: new URL(url).pathname,
      amountUsd: price,
      payer: result.payment.from,
      signature: result.payment.signature,
    };
    await store().put("spend", entry.id, entry);
  }
  return result;
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
