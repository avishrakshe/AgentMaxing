"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, Play, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Code, Label, Nav, SectionTitle } from "@/components/bits";
import type { Draft, DraftStatus, Group, Source, SpendLog } from "@/lib/types";
import { cn } from "@/lib/utils";

type DraftRow = Draft & { groupName: string; sources: { author: string; url: string }[] };
type State = {
  sources: Source[];
  groups: Group[];
  drafts: DraftRow[];
  counts: { updates: number; new: number };
  spend: { day: string; spentTodayUsd: number; dailyBudgetUsd: number; remainingUsd: number; maxPricePerCallUsd: number; callsToday: number; last10: SpendLog[] };
  config: { store: string; xSource: string; bridge: boolean; relevanceThreshold: number; hasApiKey: boolean };
};

const FILTERS: ("open" | DraftStatus | "all")[] = ["open", "pending", "flagged", "approved", "ready-manual", "sent", "rejected", "error", "all"];
const OPEN: DraftStatus[] = ["pending", "flagged", "approved", "ready-manual", "error"];

const selectClass = "h-9 border border-input bg-background px-2 font-mono text-sm focus:border-primary focus:outline-none";

export default function Dashboard() {
  const [state, setState] = useState<State | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [cycle, setCycle] = useState<{ running: boolean; result?: unknown }>({ running: false });
  const [bust, setBust] = useState(0);

  const load = useCallback(async () => {
    const s = await fetch("/api/state", { cache: "no-store" }).then((r) => r.json());
    setState(s);
    setBust(Date.now());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runCycle() {
    setCycle({ running: true });
    const result = await fetch("/api/dashboard/cycle", { method: "POST" }).then((r) => r.json());
    setCycle({ running: false, result });
    load();
  }

  const drafts = (state?.drafts ?? []).filter((d) => (filter === "all" ? true : filter === "open" ? OPEN.includes(d.status) : d.status === filter));

  return (
    <main className="mx-auto flex min-h-screen max-w-[1520px] flex-col gap-10 px-4 py-8 md:px-12 md:py-12">
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>
            <img src="/risein-logo.svg" alt="Rise In" className="mr-3 h-5 w-auto" />
            <span className="text-foreground">/ Agentmaxxing</span>&nbsp;Â· Crier
          </Label>
          <div className="flex items-center gap-4">
            {state && (
              <Label>
                Store: {state.config.store} Â· X: {state.config.xSource} Â· Bridge: {state.config.bridge ? "on" : "off"}
              </Label>
            )}
            <Nav active="dashboard" />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl leading-[0.9] font-bold tracking-[-0.045em] uppercase md:text-7xl">
              Review <span className="text-primary">queue.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">Nothing reaches WhatsApp until you approve it. Flagged drafts need a second confirmation.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button onClick={runCycle} disabled={cycle.running || !state?.config.hasApiKey} className="font-mono tracking-wider uppercase">
              {cycle.running ? <Loader2 className="animate-spin" /> : <Play />} {cycle.running ? "Running cycle..." : "Run cycle now"}
            </Button>
            {state && !state.config.hasApiKey && <p className="font-mono text-xs text-destructive uppercase">Add GEMINI_API_KEY to run cycles</p>}
          </div>
        </div>
        {cycle.result !== undefined && (
          <pre className="max-h-48 overflow-auto border bg-card p-3 font-mono text-xs text-muted-foreground">{JSON.stringify(cycle.result, null, 2)}</pre>
        )}
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[400px_1fr]">
        <aside className="flex flex-col gap-6">
          {state && <SpendCard spend={state.spend} />}
          {state && <SourcesCard sources={state.sources} onChange={load} />}
          {state && <GroupsCard groups={state.groups} ecosystems={[...new Set(state.sources.map((s) => s.ecosystem))]} onChange={load} />}
        </aside>

        <Card>
          <CardHeader className="border-b">
            <SectionTitle num="04" title={`Drafts (${drafts.length})`} />
            <CardAction>
              <Button variant="ghost" size="sm" className="font-mono uppercase" onClick={load}>
                <RefreshCw /> Refresh
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn("border px-2.5 py-1 font-mono text-xs uppercase", filter === f ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {f}
                </button>
              ))}
            </div>
            {!state && <p className="text-muted-foreground">Loadingâ€¦</p>}
            {state && drafts.length === 0 && (
              <p className="py-12 text-center text-muted-foreground">
                No drafts here. Add a source and a group, then <span className="text-foreground">Run cycle now</span> or ask the chat agent to fetch and draft.
              </p>
            )}
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} bust={bust} onChange={load} />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SpendCard({ spend }: { spend: State["spend"] }) {
  const pct = Math.min(100, (spend.spentTodayUsd / spend.dailyBudgetUsd) * 100 || 0);
  return (
    <Card>
      <CardHeader>
        <SectionTitle num="01" title="Spend today (IST)" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <p className="text-4xl font-bold tracking-tight">${spend.spentTodayUsd.toFixed(3)}</p>
          <p className="font-mono text-xs text-muted-foreground uppercase">of ${spend.dailyBudgetUsd.toFixed(2)} budget</p>
        </div>
        <div className="h-2 w-full bg-muted">
          <div className={cn("h-2", pct > 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <p className="font-mono text-xs text-muted-foreground uppercase">
          {spend.callsToday} paid calls Â· max ${spend.maxPricePerCallUsd}/call Â· ${spend.remainingUsd.toFixed(3)} left
        </p>
        <div className="flex flex-col border-t pt-3">
          <p className="mb-2 font-mono text-xs text-muted-foreground uppercase">Last payments (Base Sepolia, x402)</p>
          {spend.last10.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
          {spend.last10.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 py-1 font-mono text-xs">
              <span className="text-muted-foreground">{new Date(s.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="truncate">{s.endpoint}</span>
              <span className="text-primary">${s.amountUsd}</span>
              {s.txHash || s.payer ? (
                <a
                  className="hover:text-primary"
                  href={s.txHash ? `https://sepolia.basescan.org/tx/${s.txHash}` : `https://sepolia.basescan.org/address/${s.payer}`}
                  target="_blank"
                  rel="noreferrer"
                  title={s.signature ? `signed ${s.signature}` : undefined}
                >
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SourcesCard({ sources, onChange }: { sources: Source[]; onChange: () => void }) {
  const [form, setForm] = useState({ ecosystem: "", kind: "list", value: "", domains: "" });
  async function add() {
    if (!form.ecosystem.trim()) return;
    await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ecosystem: form.ecosystem, kind: form.kind, value: form.value, allowedDomains: form.domains.split(/[,\s]+/).filter(Boolean) }),
    });
    setForm({ ecosystem: "", kind: "list", value: "", domains: "" });
    onChange();
  }
  async function toggle(s: Source) {
    await fetch("/api/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, enabled: !s.enabled }) });
    onChange();
  }
  async function remove(s: Source) {
    await fetch(`/api/sources?id=${s.id}`, { method: "DELETE" });
    onChange();
  }
  return (
    <Card>
      <CardHeader>
        <SectionTitle num="02" title="Sources (X)" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sources.length === 0 && <p className="text-sm text-muted-foreground">No sources yet.</p>}
        {sources.map((s) => (
          <div key={s.id} className={cn("flex items-start justify-between gap-2 border p-2.5", !s.enabled && "opacity-50")}>
            <div className="min-w-0">
              <p className="font-bold">{s.ecosystem}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {s.kind}: {s.kind === "handle" ? "@" : ""}
                {s.value}
              </p>
              <p className="font-mono text-xs text-muted-foreground">domains: {s.allowedDomains.join(", ") || <span className="text-destructive">none (all links flagged)</span>}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="outline" size="xs" className="font-mono uppercase" onClick={() => toggle(s)}>
                {s.enabled ? "On" : "Off"}
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => remove(s)} aria-label="Remove source">
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2 border-t pt-3">
          <Input placeholder="Ecosystem, e.g. Nebula Chain" value={form.ecosystem} onChange={(e) => setForm({ ...form, ecosystem: e.target.value })} />
          <div className="flex gap-2">
            <select className={selectClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="list">list</option>
              <option value="handle">handle</option>
              <option value="query">query</option>
            </select>
            <Input placeholder="List id / handle / query" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
          <Input placeholder="Allowed domains, e.g. nebulachain.xyz" value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} />
          <Button variant="outline" onClick={add} className="font-mono uppercase">
            <Plus /> Add source
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupsCard({ groups, ecosystems, onChange }: { groups: Group[]; ecosystems: string[]; onChange: () => void }) {
  const [form, setForm] = useState({ name: "", ecosystems: "", language: "en", mode: "review", jid: "" });
  async function save() {
    if (!form.name.trim()) return;
    await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, jid: form.jid || undefined, ecosystems: form.ecosystems.split(",").map((s) => s.trim()).filter(Boolean) }),
    });
    setForm({ name: "", ecosystems: "", language: "en", mode: "review", jid: "" });
    onChange();
  }
  async function remove(g: Group) {
    await fetch(`/api/groups?id=${g.id}`, { method: "DELETE" });
    onChange();
  }
  return (
    <Card>
      <CardHeader>
        <SectionTitle num="03" title="WhatsApp groups" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No groups yet.</p>}
        {groups.map((g) => (
          <div key={g.id} className="flex items-start justify-between gap-2 border p-2.5">
            <div className="min-w-0">
              <p className="font-bold">{g.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {g.ecosystems.join(", ")} â†’ {g.language} Â· {g.mode} Â· max {g.maxPerDay}/day
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">jid: {g.jid ?? "not linked (manual share)"}</p>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={() => remove(g)} aria-label="Remove group">
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex flex-col gap-2 border-t pt-3">
          <Input placeholder="Group name, e.g. Nebula India" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            placeholder={`Ecosystems (comma separated)${ecosystems.length ? `: ${ecosystems.join(", ")}` : ""}`}
            value={form.ecosystems}
            onChange={(e) => setForm({ ...form, ecosystems: e.target.value })}
          />
          <div className="flex gap-2">
            <select className={cn(selectClass, "flex-1")} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="en">English</option>
              <option value="hinglish">Hinglish</option>
              <option value="hi">Hindi</option>
            </select>
            <select className={cn(selectClass, "flex-1")} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="review">review</option>
              <option value="auto">auto</option>
            </select>
          </div>
          <Input placeholder="WhatsApp jid (optional, from bridge /groups)" value={form.jid} onChange={(e) => setForm({ ...form, jid: e.target.value })} />
          <Button variant="outline" onClick={save} className="font-mono uppercase">
            <Plus /> Save group
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_STYLE: Record<DraftStatus, string> = {
  pending: "bg-muted text-foreground",
  flagged: "bg-destructive text-background",
  approved: "bg-primary text-primary-foreground",
  rejected: "bg-muted text-muted-foreground",
  sent: "bg-blue text-foreground",
  "ready-manual": "bg-blue-soft text-background",
  error: "bg-destructive text-background",
};

function DraftCard({ draft, bust, onChange }: { draft: DraftRow; bust: number; onChange: () => void }) {
  const [caption, setCaption] = useState(draft.caption);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setCaption(draft.caption), [draft.caption]);

  const poster = `/api/poster/${draft.id}?v=${bust}`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(caption)}`;
  const dirty = caption !== draft.caption;
  const done = draft.status === "sent" || draft.status === "rejected";

  async function act(action: string, body: object = {}) {
    setBusy(action);
    setMessage(null);
    const res = await fetch(`/api/drafts/${draft.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    setBusy(null);
    if (res.ok === false) setMessage(res.message ?? res.error);
    else if (res.status === "ready-manual") setMessage("Share package ready: download the poster and use Open in WhatsApp.");
    onChange();
    return res;
  }

  async function approve() {
    if (dirty) await act("edit", { caption });
    if (draft.flags.length && !confirming) return setConfirming(true);
    await act("approve", { confirmFlagged: confirming });
    setConfirming(false);
  }

  return (
    <div className={cn("grid gap-4 border p-4 md:grid-cols-[220px_1fr]", draft.status === "flagged" && "border-destructive/60")}>
      <a href={poster} target="_blank" rel="noreferrer" className="block self-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt={draft.posterSpec.title} className="aspect-[4/5] w-full border bg-muted object-cover" loading="lazy" />
      </a>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("font-mono uppercase", STATUS_STYLE[draft.status])}>{draft.status}</Badge>
          <span className="font-bold">{draft.groupName}</span>
          <span className="font-mono text-xs text-muted-foreground uppercase">
            {draft.ecosystem} Â· {draft.category} Â· rel {draft.relevance} Â· {draft.urgency} Â· {draft.posterSpec.template}
          </span>
        </div>
        {draft.flags.length > 0 && (
          <ul className="flex flex-col gap-1 border border-destructive/50 bg-destructive/10 p-2 font-mono text-xs text-destructive">
            {draft.flags.map((f) => (
              <li key={f}>âš  {f}</li>
            ))}
          </ul>
        )}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={done}
          rows={Math.min(14, Math.max(6, caption.split("\n").length + 1))}
          className="w-full resize-y border border-input bg-background p-3 font-mono text-sm leading-relaxed focus:border-primary focus:outline-none"
        />
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>
            {caption.length}/600 chars
            {dirty && <span className="ml-2 text-primary">edited (unsaved)</span>}
          </span>
          <span className="truncate">
            src:{" "}
            {draft.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="mr-2 hover:text-primary">
                @{s.author}
              </a>
            ))}
          </span>
        </div>
        {message && <p className="border bg-muted p-2 text-sm">{message}</p>}
        <div className="flex flex-wrap gap-2">
          {!done && draft.status !== "ready-manual" && draft.status !== "approved" && (
            <Button size="sm" onClick={approve} disabled={!!busy || draft.status === "error"} className={cn("font-mono uppercase", confirming && "bg-destructive text-background")}>
              <Check /> {confirming ? "Approve flagged anyway?" : "Approve"}
            </Button>
          )}
          {confirming && (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} className="font-mono uppercase">
              Cancel
            </Button>
          )}
          {draft.status === "approved" && (
            <Button size="sm" onClick={() => act("publish")} disabled={!!busy} className="font-mono uppercase">
              <Send /> Publish
            </Button>
          )}
          {draft.status === "ready-manual" && (
            <Button size="sm" onClick={() => act("mark-sent")} disabled={!!busy} className="font-mono uppercase">
              <Check /> Mark sent
            </Button>
          )}
          {!done && dirty && (
            <Button size="sm" variant="outline" onClick={() => act("edit", { caption })} disabled={!!busy} className="font-mono uppercase">
              Save edit
            </Button>
          )}
          {!done && (
            <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={!!busy} className="font-mono uppercase">
              <X /> Reject
            </Button>
          )}
          {!done && (
            <Button size="sm" variant="outline" onClick={() => act("regenerate")} disabled={!!busy} className="font-mono uppercase">
              {busy === "regenerate" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(caption);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="font-mono uppercase"
          >
            {copied ? <Check /> : <Copy />} Copy caption
          </Button>
          <Button size="sm" variant="ghost" className="font-mono uppercase" nativeButton={false} render={<a href={poster} download={`crier-${draft.id}.png`} />}>
            <Download /> Poster
          </Button>
          <Button size="sm" variant="ghost" className="font-mono uppercase" nativeButton={false} render={<a href={waLink} target="_blank" rel="noreferrer" />}>
            <ExternalLink /> Open in WhatsApp
          </Button>
        </div>
        {draft.status === "approved" && !draft.flags.length && (
          <p className="font-mono text-xs text-muted-foreground">
            Publish posts via the bridge if configured, otherwise returns a share package. <Code>publish_draft</Code> does the same from chat.
          </p>
        )}
      </div>
    </div>
  );
}
