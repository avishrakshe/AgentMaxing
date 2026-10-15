/** Crier's data model. See BUILD_PROMPT.md §6 (deviations noted in NOTES.md). */

export type Language = "en" | "hinglish" | "hi";
export type Category = "launch" | "event" | "hackathon" | "grant" | "deadline" | "partnership" | "noise";
export type PosterTemplate = "announcement" | "event" | "hackathon" | "digest";

export type Source = {
  id: string;
  ecosystem: string;
  kind: "handle" | "list" | "query";
  value: string;
  allowedDomains: string[];
  enabled: boolean;
};

export type Group = {
  id: string;
  name: string;
  jid?: string;
  ecosystems: string[];
  language: Language;
  mode: "review" | "auto";
  maxPerDay: number;
  theme?: { accentFrom: string; accentTo: string };
};

export type Triage = {
  category: Category;
  relevance: number;
  urgency: "now" | "digest" | "skip";
  dedupKey: string;
  scamFlags: string[];
  summary: string;
};

export type Update = {
  tweetId: string;
  sourceId: string;
  ecosystem: string;
  author: string;
  text: string;
  url: string;
  createdAt: string;
  links: string[];
  media: string[];
  inReplyTo?: string;
  /** Pipeline state (addition to the spec). */
  status: "new" | "triaged" | "skipped" | "drafted" | "error";
  triage?: Triage;
  /** For merged duplicates: the tweetId this one was merged into. */
  mergedInto?: string;
};

export type PosterSpec = {
  template: PosterTemplate;
  title: string;
  subtitle: string;
  facts: string[];
  dateIST?: string;
  /** YYYY-MM-DD, for the hackathon "deadline in N days" chip. */
  deadlineISO?: string;
  cta: string;
  sourceHandle: string;
  ecosystem?: string;
  /** Hackathon prize line, digest items. */
  prize?: string;
  items?: string[];
};

export type DraftStatus = "pending" | "flagged" | "approved" | "rejected" | "sent" | "ready-manual" | "error";

export type Draft = {
  id: string;
  tweetIds: string[];
  groupId: string;
  ecosystem: string;
  category: Category | "digest";
  relevance: number;
  urgency: "now" | "digest";
  caption: string;
  posterSpec: PosterSpec;
  status: DraftStatus;
  flags: string[];
  createdAt: string;
  sentAt?: string;
};

export type SpendLog = {
  id: string;
  at: string;
  endpoint: string;
  amountUsd: number;
  payer?: string;
  txHash?: string;
  /** Demo x402: payments are signed, not broadcast. Signature prefix for audit. */
  signature?: string;
};

export type Cursor = { sourceId: string; lastSeenTweetId: string };
