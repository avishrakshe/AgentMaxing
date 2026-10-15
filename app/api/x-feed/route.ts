/**
 * A MOCK PAID X FEED (x402, Base Sepolia)
 *
 * Built exactly like /api/weather: no payment → 402 + price, valid signed payment → data.
 * Returns fixture tweets from data/fixtures/*.json, newest-first, only those newer than `since`.
 *
 *   GET /api/x-feed?ecosystem=Nebula%20Chain&kind=list&value=<listId>&since=<tweetId>
 */
import { verifyPayment } from "@/agent/wallet";
import { fixtures } from "@/data/fixtures";

const PRICE = "0.002";
const ASSET = "USDC";
const PAY_TO = "0x000000000000000000000000000000000000dEaD"; // the feed owner's wallet (demo)

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const payment = await verifyPayment(req.headers.get("X-PAYMENT"));
  if (!payment || payment.to !== PAY_TO || Number(payment.amount) < Number(PRICE) || payment.resource !== "/api/x-feed") {
    return Response.json({ error: "Payment Required", price: PRICE, asset: ASSET, payTo: PAY_TO }, { status: 402 });
  }

  const ecosystem = (params.get("ecosystem") ?? "").trim().toLowerCase();
  const kind = params.get("kind") ?? "list";
  const value = (params.get("value") ?? "").replace(/^@/, "").toLowerCase();
  const since = params.get("since");

  let tweets = fixtures
    .filter((f) => !ecosystem || f.ecosystem.toLowerCase() === ecosystem)
    .flatMap((f) => f.tweets.map((t) => ({ ...t, ecosystem: f.ecosystem })));

  // A handle source only sees that account; list/query sources see the whole ecosystem feed.
  if (kind === "handle" && value) tweets = tweets.filter((t) => t.author.toLowerCase() === value);
  if (since) tweets = tweets.filter((t) => BigInt(t.id) > BigInt(since));
  tweets.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));

  return Response.json({
    tweets: tweets.map((t) => ({ ...t, url: `https://x.com/${t.author}/status/${t.id}` })),
    paidBy: payment.from,
  });
}
