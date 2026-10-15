/**
 * REVIEW + PUBLISH
 *
 * Nothing goes to WhatsApp unless the draft is `approved`.
 * Flagged drafts need an explicit admin confirmation to approve and are never auto-approved.
 * Rate limit per group: maxPerDay posts, min 20 min gap, 30-120 s random jitter (applied by the bridge).
 */
import { istDay } from "./budget";
import { store } from "./store";
import type { Draft } from "./types";

const MIN_GAP_MS = 20 * 60 * 1000;

export const posterUrl = (baseUrl: string, draftId: string) => `${baseUrl}/api/poster/${draftId}`;

export async function reviewDraft(opts: {
  draftId: string;
  action: "approve" | "reject" | "edit";
  edits?: { caption?: string; title?: string; subtitle?: string; cta?: string };
  confirmFlagged?: boolean;
}) {
  const db = store();
  const draft = await db.get("drafts", opts.draftId);
  if (!draft) throw new Error(`No draft ${opts.draftId}`);
  if (draft.status === "sent") throw new Error("This draft was already sent.");

  let next: Draft = draft;
  if (opts.action === "reject") next = { ...draft, status: "rejected" };
  if (opts.action === "approve") {
    if (draft.status === "error") throw new Error("This draft failed to generate. Regenerate it first.");
    if (draft.flags.length && !opts.confirmFlagged) {
      return {
        ok: false,
        needsConfirmation: true,
        message: `Draft is FLAGGED: ${draft.flags.join("; ")}. Show these flags to the admin. Only approve if the admin explicitly confirms, by calling again with confirmFlagged=true.`,
      };
    }
    next = { ...draft, status: "approved" };
  }
  if (opts.action === "edit") {
    const e = opts.edits ?? {};
    next = {
      ...draft,
      caption: e.caption ?? draft.caption,
      posterSpec: { ...draft.posterSpec, ...(e.title && { title: e.title }), ...(e.subtitle && { subtitle: e.subtitle }), ...(e.cta && { cta: e.cta }) },
      // An edit sends it back to review; flags stay.
      status: draft.flags.length ? "flagged" : "pending",
    };
  }
  await db.put("drafts", next.id, next);
  return { ok: true, draftId: next.id, status: next.status };
}

export async function publishDraft(draftId: string, ctx: { baseUrl: string }) {
  const db = store();
  const draft = await db.get("drafts", draftId);
  if (!draft) throw new Error(`No draft ${draftId}`);
  if (draft.status !== "approved") {
    return { ok: false, message: `Draft ${draftId} is "${draft.status}". Only approved drafts can be published. Ask the admin to approve it first.` };
  }
  const group = await db.get("groups", draft.groupId);
  if (!group) throw new Error("The draft's group no longer exists.");

  const sentToday = (await db.list("drafts"))
    .filter((d) => d.groupId === group.id && d.sentAt && istDay(d.sentAt) === istDay())
    .sort((a, b) => b.sentAt!.localeCompare(a.sentAt!));
  if (sentToday.length >= group.maxPerDay) {
    return { ok: false, rateLimited: true, message: `${group.name} already had ${sentToday.length}/${group.maxPerDay} posts today (IST). Try tomorrow or raise maxPerDay.` };
  }

  const imageUrl = posterUrl(ctx.baseUrl, draft.id);
  const bridge = process.env.WA_BRIDGE_URL;

  if (bridge) {
    if (!group.jid) return { ok: false, message: `Group ${group.name} has no WhatsApp jid. Set it from the bridge's GET /groups list.` };
    const last = sentToday[0]?.sentAt;
    if (last && Date.now() - new Date(last).getTime() < MIN_GAP_MS) {
      const wait = Math.ceil((MIN_GAP_MS - (Date.now() - new Date(last).getTime())) / 60000);
      return { ok: false, rateLimited: true, message: `Min 20-minute gap per group: wait ~${wait} more minutes.` };
    }
    const jitterMs = Math.round(30_000 + Math.random() * 90_000);
    const res = await fetch(`${bridge.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.BRIDGE_SECRET ?? ""}` },
      body: JSON.stringify({ groupJid: group.jid, caption: draft.caption, imageUrl, jitterMs }),
    });
    if (!res.ok) return { ok: false, message: `Bridge refused (${res.status}): ${(await res.text()).slice(0, 200)}` };
    const sent: Draft = { ...draft, status: "sent", sentAt: new Date().toISOString() };
    await db.put("drafts", sent.id, sent);
    return { ok: true, status: "sent", group: group.name, jitterSeconds: Math.round(jitterMs / 1000) };
  }

  // No bridge: hand the admin a share package to post by hand.
  const ready: Draft = { ...draft, status: "ready-manual", sentAt: new Date().toISOString() };
  await db.put("drafts", ready.id, ready);
  return {
    ok: true,
    status: "ready-manual",
    group: group.name,
    caption: draft.caption,
    posterUrl: imageUrl,
    whatsappLink: `https://wa.me/?text=${encodeURIComponent(draft.caption)}`,
    note: "No WhatsApp bridge configured: download the poster, open the link, pick the group and attach the poster.",
  };
}

export async function markSent(draftId: string) {
  const db = store();
  const draft = await db.get("drafts", draftId);
  if (!draft) throw new Error(`No draft ${draftId}`);
  if (draft.status !== "ready-manual" && draft.status !== "approved") throw new Error(`Draft is "${draft.status}"; only approved/ready-manual drafts can be marked sent.`);
  const sent: Draft = { ...draft, status: "sent", sentAt: draft.sentAt ?? new Date().toISOString() };
  await db.put("drafts", sent.id, sent);
  return { ok: true, status: "sent" };
}
