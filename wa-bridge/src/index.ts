/**
 * CRIER WA-BRIDGE — always-on Node service holding the WhatsApp Web socket.
 *
 *   POST /send    {groupJid, caption, imageUrl, jitterMs?}   Bearer BRIDGE_SECRET   → 202, sends after jitter
 *   GET  /groups  groups + community announcement groups this number is in         Bearer BRIDGE_SECRET
 *   GET  /health
 *   cron (CRON, default every 30 min): POST APP_URL/api/cycle?publish=1, then DM new drafts to ADMIN_NUMBERS.
 *   Admin DM replies (quoting the draft): "1" approve · "2" reject · "edit: <new caption>" · "confirm" (flagged).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import cron from "node-cron";
import { BaileysSender, type WhatsAppSender } from "./sender.js";

const env = (k: string, d = "") => process.env[k] ?? d;
const PORT = Number(env("PORT", "8787"));
const SECRET = env("BRIDGE_SECRET");
const APP_URL = env("APP_URL").replace(/\/$/, "");
const CYCLE_SECRET = env("CYCLE_SECRET");
const AUTH_DIR = path.resolve(env("AUTH_DIR", "auth"));
const MAX_PER_DAY = Number(env("MAX_PER_DAY", "6"));
const MIN_GAP_MS = 20 * 60 * 1000;
const ADMINS = env("ADMIN_NUMBERS").split(",").map((n) => n.replace(/\D/g, "")).filter(Boolean).map((n) => `${n}@s.whatsapp.net`);

if (!SECRET) throw new Error("Set BRIDGE_SECRET");

// ─── small persisted state (lives next to the auth files, on the mounted volume) ───
type BridgeState = { sends: { jid: string; at: number }[]; notified: Record<string, string>; pendingConfirm: Record<string, string> };
const STATE_FILE = path.join(AUTH_DIR, "bridge-state.json");
fs.mkdirSync(AUTH_DIR, { recursive: true });
const state: BridgeState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { sends: [], notified: {}, pendingConfirm: {} };
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const wa: WhatsAppSender & { start(): Promise<void> } = new BaileysSender(AUTH_DIR, env("WA_PAIRING_NUMBER") || undefined);

// ─── safety: only groups where we're admin (or that allow posting), per-group rate limit ───
async function checkSend(jid: string) {
  const group = (await wa.listGroups()).find((g) => g.jid === jid);
  if (!group) return "This number is not in that group.";
  if (!group.isAdmin) return "The linked number must be an admin of the group.";
  const dayAgo = Date.now() - 86_400_000;
  const recent = state.sends.filter((s) => s.jid === jid && s.at > dayAgo);
  if (recent.length >= MAX_PER_DAY) return `Rate limit: ${MAX_PER_DAY} posts/day for this group.`;
  const last = Math.max(0, ...recent.map((s) => s.at));
  if (Date.now() - last < MIN_GAP_MS) return "Rate limit: min 20 minutes between posts to the same group.";
  return null;
}

async function fetchImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`poster fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── HTTP API ───
function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}
async function readBody(req: http.IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/health") return json(res, 200, { ok: true, connected: wa.ready() });
      if (req.headers.authorization !== `Bearer ${SECRET}`) return json(res, 401, { error: "Unauthorized" });
      if (!wa.ready()) return json(res, 503, { error: "WhatsApp not connected yet" });

      if (req.method === "GET" && req.url === "/groups") return json(res, 200, { groups: await wa.listGroups() });

      if (req.method === "POST" && req.url === "/send") {
        const { groupJid, caption, imageUrl, jitterMs } = await readBody(req);
        if (!groupJid?.endsWith("@g.us") || !caption || !imageUrl) return json(res, 400, { error: "groupJid (…@g.us), caption and imageUrl are required" });
        const refusal = await checkSend(groupJid);
        if (refusal) return json(res, 429, { error: refusal });
        const image = await fetchImage(imageUrl); // fail fast, before we accept
        const delay = Math.min(Math.max(Number(jitterMs) || 30_000 + Math.random() * 90_000, 30_000), 120_000);
        state.sends.push({ jid: groupJid, at: Date.now() + delay });
        save();
        setTimeout(() => wa.sendImage(groupJid, image, caption).catch((e) => console.error("[bridge] send failed", e)), delay);
        return json(res, 202, { queued: true, sendInSeconds: Math.round(delay / 1000) });
      }
      json(res, 404, { error: "Not found" });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  })
  .listen(PORT, () => console.log(`[bridge] listening on :${PORT}`));

// ─── Admin approval over WhatsApp DM ───
async function app(pathname: string, init?: RequestInit) {
  const res = await fetch(`${APP_URL}${pathname}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return res.json();
}

async function notifyAdmins() {
  if (!ADMINS.length || !APP_URL) return;
  const { drafts } = await app("/api/state");
  for (const d of drafts as { id: string; status: string; groupName: string; caption: string; flags: string[] }[]) {
    if (!["pending", "flagged"].includes(d.status) || Object.values(state.notified).includes(d.id)) continue;
    const header = `*Crier draft* for _${d.groupName}_${d.flags.length ? `\n⚠ FLAGGED: ${d.flags.join("; ")}` : ""}\nReply to this message: 1 approve · 2 reject · edit: <new caption>`;
    for (const admin of ADMINS) {
      const image = await fetchImage(`${APP_URL}/api/poster/${d.id}`);
      const id = await wa.sendImage(admin, image, `${header}\n\n${d.caption}`);
      if (id) state.notified[id] = d.id;
    }
  }
  save();
}

wa.onText(async ({ from, text, quotedId }) => {
  if (!ADMINS.includes(from)) return; // never talk to anyone but configured admins
  const t = text.trim();
  const draftId = (quotedId && state.notified[quotedId]) || (t.toLowerCase() === "confirm" ? state.pendingConfirm[from] : undefined);
  if (!draftId) return void wa.sendText(from, "Reply *to a draft message* with 1, 2 or edit: <caption>.");

  let result: { ok?: boolean; message?: string; needsConfirmation?: boolean; status?: string; error?: string };
  if (t === "1" || t.toLowerCase() === "confirm") {
    result = await app(`/api/drafts/${draftId}/approve`, { method: "POST", body: JSON.stringify({ confirmFlagged: t.toLowerCase() === "confirm" }) });
    if (result.needsConfirmation) {
      state.pendingConfirm[from] = draftId;
      save();
      return void wa.sendText(from, `${result.message}\n\nReply *confirm* to approve anyway.`);
    }
  } else if (t === "2") {
    result = await app(`/api/drafts/${draftId}/reject`, { method: "POST" });
  } else if (/^edit:/i.test(t)) {
    result = await app(`/api/drafts/${draftId}/edit`, { method: "POST", body: JSON.stringify({ caption: t.replace(/^edit:\s*/i, "") }) });
  } else {
    return void wa.sendText(from, "Unknown reply. Use 1 (approve), 2 (reject) or edit: <caption>.");
  }
  delete state.pendingConfirm[from];
  save();
  await wa.sendText(from, result.ok === false ? `Not done: ${result.message ?? result.error}` : `Done: draft is now *${result.status}*.`);
});

// ─── Scheduler ───
cron.schedule(env("CRON", "*/30 * * * *"), async () => {
  if (!APP_URL || !CYCLE_SECRET || !wa.ready()) return;
  try {
    const r = await fetch(`${APP_URL}/api/cycle?publish=1`, { method: "POST", headers: { Authorization: `Bearer ${CYCLE_SECRET}` } });
    console.log("[bridge] cycle", r.status, (await r.text()).slice(0, 300));
    await notifyAdmins();
  } catch (err) {
    console.error("[bridge] cycle failed", err);
  }
});

wa.start();
