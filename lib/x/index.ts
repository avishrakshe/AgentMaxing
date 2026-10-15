/**
 * PLUGGABLE X DATA SOURCES
 *
 *   mock     (default)  /api/x-feed — our own x402-paid fixture feed on Base Sepolia
 *   fetcher  (Phase 3)  twitter.fetcher.sh x402 on Base mainnet — needs X402_MAINNET=true + funded wallet
 *   official (optional) X API v2 with X_BEARER_TOKEN
 *   oembed   (free)     single tweet by URL, used by fetch_tweet
 */
import { budgetedFetch } from "../budget";
import { extractLinks } from "../scam";
import type { Source } from "../types";

export type RawTweet = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  url: string;
  links: string[];
  media: string[];
  inReplyTo?: string;
};

export type FetchResult = { tweets: RawTweet[]; payment?: unknown };

export interface XSource {
  name: string;
  fetchSince(source: Source, sinceId: string | undefined, ctx: { baseUrl: string }): Promise<FetchResult>;
}

const mock: XSource = {
  name: "mock",
  async fetchSince(source, sinceId, { baseUrl }) {
    const q = new URLSearchParams({ ecosystem: source.ecosystem, kind: source.kind, value: source.value });
    if (sinceId) q.set("since", sinceId);
    const { data, payment } = await budgetedFetch(`${baseUrl}/api/x-feed?${q}`);
    if (!data?.tweets) throw new Error(`x-feed returned no tweets: ${JSON.stringify(data).slice(0, 200)}`);
    return { tweets: data.tweets, payment };
  },
};

const fetcher: XSource = {
  name: "fetcher",
  async fetchSince() {
    if (process.env.X402_MAINNET !== "true") throw new Error("X_SOURCE=fetcher needs X402_MAINNET=true and a funded Base mainnet wallet.");
    // Phase 3: twitter.fetcher.sh speaks the full x402 spec (EIP-3009 USDC transferWithAuthorization),
    // which the starter's demo signer does not implement yet. Re-check their pricing/terms before enabling.
    throw new Error("The fetcher.sh adapter is a Phase 3 item and is not implemented yet. Use X_SOURCE=mock.");
  },
};

const official: XSource = {
  name: "official",
  async fetchSince(source, sinceId) {
    const token = process.env.X_BEARER_TOKEN;
    if (!token) throw new Error("X_SOURCE=official needs X_BEARER_TOKEN.");
    const fields = "tweet.fields=created_at,entities,in_reply_to_user_id&expansions=author_id&user.fields=username&max_results=50";
    const since = sinceId ? `&since_id=${sinceId}` : "";
    const url =
      source.kind === "list"
        ? `https://api.x.com/2/lists/${source.value}/tweets?${fields}`
        : `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(source.kind === "handle" ? `from:${source.value.replace(/^@/, "")}` : source.value)}&${fields}${since}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`X API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const users = new Map<string, string>((body.includes?.users ?? []).map((u: any) => [u.id, u.username]));
    const tweets: RawTweet[] = (body.data ?? [])
      .filter((t: any) => !sinceId || BigInt(t.id) > BigInt(sinceId))
      .map((t: any) => {
        const author = users.get(t.author_id) ?? "unknown";
        return {
          id: t.id,
          author,
          text: t.text,
          createdAt: t.created_at,
          url: `https://x.com/${author}/status/${t.id}`,
          links: (t.entities?.urls ?? []).map((u: any) => u.expanded_url ?? u.url),
          media: [],
          inReplyTo: t.in_reply_to_user_id,
        };
      });
    return { tweets };
  },
};

export function xSource(): XSource {
  const name = process.env.X_SOURCE || "mock";
  return ({ mock, fetcher, official } as Record<string, XSource>)[name] ?? mock;
}

/** Free single-tweet fetch via X's public oEmbed endpoint. */
export async function fetchTweetOembed(tweetUrl: string): Promise<RawTweet> {
  const id = tweetUrl.match(/status(?:es)?\/(\d+)/)?.[1];
  if (!id) throw new Error("That doesn't look like a tweet URL (expected .../status/<id>).");
  const res = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`);
  if (!res.ok) throw new Error(`oEmbed failed (${res.status}). Ask the admin to paste the tweet text instead.`);
  const { html, author_url } = (await res.json()) as { html: string; author_url?: string };

  const paragraph = html.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
  const hrefs = [...paragraph.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/twitter\.com\/hashtag|x\.com\/hashtag/.test(h));
  const text = decodeEntities(paragraph.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).trim();
  const date = html.match(/>([A-Z][a-z]+ \d{1,2}, \d{4})<\/a>\s*<\/blockquote>/)?.[1];
  const author = author_url?.split("/").pop() ?? tweetUrl.match(/(?:x|twitter)\.com\/([^/]+)/)?.[1] ?? "unknown";

  return {
    id,
    author,
    text,
    createdAt: date ? new Date(date).toISOString() : new Date().toISOString(),
    url: tweetUrl,
    links: [...new Set([...hrefs.filter((h) => !/\/status\//.test(h)), ...extractLinks(text)])],
    media: [],
  };
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
