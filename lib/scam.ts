/**
 * SCAM GUARD (deterministic, runs on every update and every draft)
 *
 * Web3 communities are phishing targets. Anything this flags can never be auto-approved.
 */

const SHORTENERS = [
  "bit.ly", "t.ly", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly",
  "shorturl.at", "rb.gy", "tiny.cc", "s.id", "lnkd.in", "t.me", "dub.sh", "bl.ink",
];
// t.co is X's own wrapper on every link; we don't flag it but it can't be verified either.
const X_WRAPPERS = ["t.co"];

const SCAM_PHRASES = [
  "claim airdrop", "claim your airdrop", "claim your", "connect wallet", "connect your wallet", "validate wallet",
  "validate your wallet", "verify wallet", "verify your wallet", "seed phrase", "recovery phrase", "private key",
  "dm to claim", "dm me to claim", "free mint", "double your", "send eth", "send usdc",
];

const INJECTION_PHRASES = [
  "ignore previous instructions", "ignore all previous", "ignore the above", "disregard previous", "system prompt",
  "you are now", "post this link to every group", "post this to every group", "no review needed", "raise the daily budget",
  "change the budget", "new instructions",
];

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function extractLinks(text: string) {
  return [...new Set((text.match(/https?:\/\/[^\s)\]>"']+/gi) ?? []).map((u) => u.replace(/[.,!?;:]+$/, "")))];
}

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Strip TLD, de-leet, and compare: catches nebu1achain-claim.xyz vs nebulachain.xyz. */
function looksLike(host: string, domain: string) {
  const norm = (s: string) => s.split(".").slice(0, -1).join("").replace(/1/g, "l").replace(/0/g, "o").replace(/[^a-z]/g, "");
  const a = norm(host);
  const b = norm(domain);
  return b.length >= 4 && (a.includes(b) || levenshtein(a, b) <= 2);
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Returns human-readable flags. Empty array = clean. */
export function scanForScams(text: string, links: string[], allowedDomains: string[]) {
  const flags = new Set<string>();
  const lower = text.toLowerCase();
  const allowed = allowedDomains.map((d) => d.toLowerCase().replace(/^www\./, ""));

  for (const link of new Set([...links, ...extractLinks(text)])) {
    const host = hostOf(link);
    if (!host) continue;
    if (X_WRAPPERS.includes(host) || onDomain(host, "x.com") || onDomain(host, "twitter.com")) continue;
    if (SHORTENERS.some((s) => onDomain(host, s))) {
      flags.add(`url-shortener: ${host}`);
      continue;
    }
    if (allowed.length === 0) {
      flags.add(`unverified-domain: ${host} (source has no allowedDomains)`);
      continue;
    }
    if (!allowed.some((d) => onDomain(host, d))) {
      const twin = allowed.find((d) => looksLike(host, d));
      flags.add(twin ? `look-alike-domain: ${host} imitates ${twin}` : `domain-not-allowed: ${host}`);
    }
  }
  for (const p of SCAM_PHRASES) if (lower.includes(p)) flags.add(`scam-phrase: "${p}"`);
  for (const p of INJECTION_PHRASES) if (lower.includes(p)) flags.add(`prompt-injection: "${p}"`);
  return [...flags];
}
