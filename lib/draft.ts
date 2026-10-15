/**
 * CREATE: turn triaged updates into a Draft (WhatsApp caption + poster spec) for a group.
 */
import { z } from "zod";
import { generateJson, StructuredOutputError } from "./gemini";
import { CAPTION_SYSTEM, captionPrompt } from "./prompts/caption";
import { extractLinks, scanForScams } from "./scam";
import { newId, sameEco, store } from "./store";
import type { Draft, Group, PosterSpec, Update } from "./types";

const DraftOutput = z.object({
  caption: z.string().min(20),
  posterSpec: z.object({
    template: z.enum(["announcement", "event", "hackathon", "digest"]),
    title: z.string().min(1),
    subtitle: z.string(),
    facts: z.array(z.string()),
    dateIST: z.string().optional(),
    deadlineISO: z.string().optional(),
    cta: z.string(),
    prize: z.string().optional(),
    items: z.array(z.string()).optional(),
  }),
});

const EMOJI = /\p{Extended_Pictographic}/gu;

/** Hard limits so the poster never overflows, whatever the model returned. */
export function clampSpec(spec: Partial<PosterSpec> & { title: string }, base: Pick<PosterSpec, "sourceHandle" | "ecosystem">): PosterSpec {
  const words = (s: string | undefined, n: number) => (s ?? "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");
  const chars = (s: string | undefined, n: number) => {
    const t = (s ?? "").trim();
    return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
  };
  return {
    template: spec.template ?? "announcement",
    title: chars(words(spec.title, 8), 64),
    subtitle: chars(words(spec.subtitle, 14), 100),
    facts: (spec.facts ?? []).slice(0, 3).map((f) => chars(f, 42)),
    dateIST: spec.dateIST ? chars(spec.dateIST, 36) : undefined,
    deadlineISO: spec.deadlineISO && /^\d{4}-\d{2}-\d{2}/.test(spec.deadlineISO) ? spec.deadlineISO.slice(0, 10) : undefined,
    cta: chars(words(spec.cta, 4), 22),
    prize: spec.prize ? chars(spec.prize, 24) : undefined,
    items: spec.items?.slice(0, 6).map((i) => chars(i, 46)),
    sourceHandle: base.sourceHandle,
    ecosystem: base.ecosystem,
  };
}

export function lintCaption(caption: string) {
  const issues: string[] = [];
  if (caption.length > 600) issues.push(`caption is ${caption.length} characters, max 600`);
  const emojis = caption.match(EMOJI)?.length ?? 0;
  if (emojis > 3) issues.push(`caption has ${emojis} emojis, max 3`);
  if (/(^|\s)#[\p{L}\d_]+/u.test(caption)) issues.push("caption contains hashtags");
  if (/^\s*#{1,6}\s/m.test(caption)) issues.push("caption contains markdown headers");
  if (/\*\*/.test(caption)) issues.push("caption uses **double asterisks**; WhatsApp bold is *single*");
  return issues;
}

function hardFix(caption: string) {
  return caption
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/(^|\s)#([\p{L}\d_]+)/gu, "$1$2")
    .trim();
}

export async function resolveGroup(idOrName: string): Promise<Group | null> {
  const groups = await store().list("groups");
  const q = idOrName.trim().toLowerCase();
  return groups.find((g) => g.id === idOrName) ?? groups.find((g) => g.name.toLowerCase() === q) ?? groups.find((g) => g.name.toLowerCase().includes(q)) ?? null;
}

async function writeCaption(group: Group, primaries: Update[], variant: "single" | "digest") {
  const db = store();
  const all = await db.list("updates");
  // Merged duplicates contribute their facts and links too.
  const members = primaries.flatMap((p) => [p, ...all.filter((u) => u.mergedInto === p.tweetId)]);
  const primaryLink = primaries[0].links.find((l) => !/(^|\.)(x|twitter)\.com\//.test(l)) ?? primaries[0].url;
  const prompt = captionPrompt({
    language: group.language,
    ecosystem: primaries[0].ecosystem,
    groupName: group.name,
    variant,
    todayIST: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" }),
    sources: members.map((u) => ({ author: u.author, text: u.text, links: u.links, url: u.url, summary: u.triage?.summary, category: u.triage?.category })),
    primaryLink,
  });

  let out = await generateJson({ system: CAPTION_SYSTEM, prompt, schema: DraftOutput, temperature: 0.4 });
  const issues = lintCaption(out.caption);
  if (issues.length) {
    out = await generateJson({ system: CAPTION_SYSTEM, prompt: `${prompt}\n\nRewrite. Your last caption broke these rules: ${issues.join("; ")}.`, schema: DraftOutput, temperature: 0.3 });
  }
  return { out, members };
}

async function buildDraft(group: Group, primaries: Update[], existingId?: string): Promise<Draft> {
  const variant = primaries.length > 1 ? "digest" : "single";
  const handles = [...new Set(primaries.map((p) => p.author))];
  const base = { sourceHandle: handles.map((h) => `@${h}`).join(" · ").slice(0, 40), ecosystem: primaries[0].ecosystem };
  const now = new Date().toISOString();
  const id = existingId ?? newId("d");

  try {
    const { out, members } = await writeCaption(group, primaries, variant);
    const caption = hardFix(out.caption);
    const spec = clampSpec(variant === "digest" ? { ...out.posterSpec, template: "digest" } : out.posterSpec, base);

    const sources = new Map((await store().list("sources")).map((s) => [s.id, s]));
    const allowed = [...new Set(members.flatMap((m) => sources.get(m.sourceId)?.allowedDomains ?? []))];
    const sourceLinks = new Set(members.flatMap((m) => [...m.links, m.url]));
    const flags = new Set<string>([
      ...members.flatMap((m) => m.triage?.scamFlags ?? []),
      ...scanForScams(caption, [], allowed),
      ...extractLinks(caption).filter((l) => !sourceLinks.has(l)).map((l) => `link-not-in-source: ${l}`),
      ...lintCaption(caption).map((i) => `style: ${i}`),
    ]);

    const draft: Draft = {
      id,
      tweetIds: members.map((m) => m.tweetId),
      groupId: group.id,
      ecosystem: primaries[0].ecosystem,
      category: variant === "digest" ? "digest" : primaries[0].triage?.category ?? "launch",
      relevance: Math.max(...primaries.map((p) => p.triage?.relevance ?? 0)),
      urgency: variant === "digest" || primaries[0].triage?.urgency === "digest" ? "digest" : "now",
      caption,
      posterSpec: spec,
      status: flags.size ? "flagged" : group.mode === "auto" ? "approved" : "pending",
      flags: [...flags],
      createdAt: now,
    };
    await store().put("drafts", id, draft);
    for (const p of primaries) await store().put("updates", p.tweetId, { ...p, status: "drafted" });
    return draft;
  } catch (err) {
    if (!(err instanceof StructuredOutputError)) throw err;
    const draft: Draft = {
      id,
      tweetIds: primaries.map((p) => p.tweetId),
      groupId: group.id,
      ecosystem: primaries[0].ecosystem,
      category: primaries[0].triage?.category ?? "launch",
      relevance: 0,
      urgency: "now",
      caption: "",
      posterSpec: clampSpec({ title: primaries[0].triage?.summary ?? "Update" }, base),
      status: "error",
      flags: [err.message],
      createdAt: now,
    };
    await store().put("drafts", id, draft);
    return draft;
  }
}

/**
 * Draft posts for a group. With updateIds: one draft (a digest if they are several different news items).
 * Without: every triaged, not-yet-drafted update in the group's ecosystems — "now" items one by one,
 * "digest" items rolled into one digest when there are 2+.
 */
export async function draftPosts(opts: { groupId: string; updateIds?: string[] }) {
  const db = store();
  const group = await resolveGroup(opts.groupId);
  if (!group) return { ok: false, message: `No group "${opts.groupId}". Create it with add_group first.` };

  const all = await db.list("updates");
  const drafts = await db.list("drafts");
  const draftedForGroup = new Set(drafts.filter((d) => d.groupId === group.id).flatMap((d) => d.tweetIds));

  let batches: Update[][];
  if (opts.updateIds?.length) {
    const picked = opts.updateIds
      .map((id) => all.find((u) => u.tweetId === id))
      .filter((u): u is Update => Boolean(u))
      .map((u) => (u.mergedInto ? all.find((p) => p.tweetId === u.mergedInto) ?? u : u));
    const unique = [...new Map(picked.map((u) => [u.tweetId, u])).values()];
    if (!unique.length) return { ok: false, message: "None of those updateIds exist. Use the updateId values returned by triage_updates." };
    batches = [unique];
  } else {
    const eligible = all
      .filter((u) => (u.status === "triaged" || u.status === "drafted") && !u.mergedInto && !draftedForGroup.has(u.tweetId))
      .filter((u) => group.ecosystems.some((e) => sameEco(e, u.ecosystem)))
      .sort((a, b) => (b.triage?.relevance ?? 0) - (a.triage?.relevance ?? 0));
    if (!eligible.length) return { ok: true, created: 0, message: `Nothing new to draft for ${group.name}. Fetch and triage first.` };
    // Flagged items are always drafted on their own so a clean digest never carries a red flag.
    const digestable = eligible.filter((u) => u.triage?.urgency === "digest" && !u.triage.scamFlags.length);
    const solo = eligible.filter((u) => !digestable.includes(u));
    batches = [...solo.map((u) => [u]), ...(digestable.length >= 2 ? [digestable.slice(0, 6)] : digestable.map((u) => [u]))];
  }

  const created: Draft[] = [];
  for (let i = 0; i < batches.length; i += 3) {
    created.push(...(await Promise.all(batches.slice(i, i + 3).map((b) => buildDraft(group, b)))));
  }

  return {
    ok: true,
    group: group.name,
    language: group.language,
    created: created.length,
    drafts: created.map((d) => ({ draftId: d.id, status: d.status, template: d.posterSpec.template, title: d.posterSpec.title, flags: d.flags, tweetIds: d.tweetIds })),
  };
}

export async function regenerateDraft(draftId: string) {
  const db = store();
  const draft = await db.get("drafts", draftId);
  if (!draft) throw new Error(`No draft ${draftId}`);
  if (draft.status === "sent") throw new Error("Already sent; can't regenerate.");
  const group = await db.get("groups", draft.groupId);
  if (!group) throw new Error("The draft's group no longer exists.");
  const all = await db.list("updates");
  const primaries = draft.tweetIds.map((id) => all.find((u) => u.tweetId === id)).filter((u): u is Update => Boolean(u) && !u!.mergedInto);
  if (!primaries.length) throw new Error("Source updates for this draft are gone.");
  return buildDraft(group, primaries, draft.id);
}
