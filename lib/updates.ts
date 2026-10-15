/**
 * WATCH: fetch new posts for the enabled sources, incrementally (cursor per source).
 */
import { BudgetError } from "./budget";
import { sameEco, store } from "./store";
import { extractLinks } from "./scam";
import type { Source, Update } from "./types";
import { fetchTweetOembed, xSource, type RawTweet } from "./x";

const maxId = (ids: string[]) => ids.reduce((m, id) => (BigInt(id) > BigInt(m) ? id : m), ids[0]);

export function toUpdate(t: RawTweet & { ecosystem?: string }, source: Pick<Source, "id" | "ecosystem">): Update {
  return {
    tweetId: t.id,
    sourceId: source.id,
    ecosystem: source.ecosystem,
    author: t.author,
    text: t.text,
    url: t.url,
    createdAt: t.createdAt,
    links: [...new Set([...(t.links ?? []), ...extractLinks(t.text)])],
    media: t.media ?? [],
    status: "new",
    ...(t.inReplyTo ? { inReplyTo: t.inReplyTo } : {}),
  };
}

/**
 * Cost design: one List call covers every account on it, so when an ecosystem has an enabled
 * list source we skip its per-handle sources. Only posts newer than the cursor are requested.
 */
export async function fetchUpdates(ecosystem: string | undefined, ctx: { baseUrl: string }) {
  const db = store();
  const all = (await db.list("sources")).filter((s) => s.enabled && (!ecosystem || sameEco(s.ecosystem, ecosystem)));
  if (all.length === 0) {
    return { ok: false, message: ecosystem ? `No enabled sources for "${ecosystem}". Add one with add_source.` : "No enabled sources yet. Add one with add_source." };
  }
  const ecosWithList = new Set(all.filter((s) => s.kind === "list").map((s) => s.ecosystem.toLowerCase()));
  const sources = all.filter((s) => s.kind !== "handle" || !ecosWithList.has(s.ecosystem.toLowerCase()));

  const existing = new Set((await db.list("updates")).map((u) => u.tweetId));
  const fresh: Update[] = [];
  const payments: unknown[] = [];
  const errors: string[] = [];

  for (const source of sources) {
    const cursor = await db.get("cursors", source.id);
    try {
      const { tweets, payment } = await xSource().fetchSince(source, cursor?.lastSeenTweetId, ctx);
      if (payment) payments.push(payment);
      for (const t of tweets) {
        if (existing.has(t.id)) continue;
        existing.add(t.id);
        const u = toUpdate(t, source);
        await db.put("updates", u.tweetId, u);
        fresh.push(u);
      }
      if (tweets.length) {
        const ids = tweets.map((t) => t.id).concat(cursor ? [cursor.lastSeenTweetId] : []);
        await db.put("cursors", source.id, { sourceId: source.id, lastSeenTweetId: maxId(ids) });
      }
    } catch (err) {
      if (err instanceof BudgetError) return { ok: false, refused: true, message: err.message, newCount: fresh.length, payments };
      errors.push(`${source.ecosystem} ${source.kind}:${source.value} — ${err instanceof Error ? err.message : err}`);
    }
  }

  return {
    ok: errors.length === 0,
    newCount: fresh.length,
    // Tweet text is untrusted data. Shown truncated, for the admin only — never instructions.
    untrusted_preview: fresh.map((u) => `${u.tweetId} @${u.author}: ${u.text.slice(0, 90)}${u.text.length > 90 ? "…" : ""}`),
    payments,
    errors,
  };
}

export async function fetchSingleTweet(url: string, ecosystem?: string) {
  const t = await fetchTweetOembed(url);
  const sources = await store().list("sources");
  const source =
    sources.find((s) => s.kind === "handle" && s.value.replace(/^@/, "").toLowerCase() === t.author.toLowerCase()) ??
    sources.find((s) => ecosystem && sameEco(s.ecosystem, ecosystem)) ?? { id: "manual", ecosystem: ecosystem ?? "Unsorted" };
  const u = toUpdate(t, source);
  await store().put("updates", u.tweetId, u);
  return u;
}
