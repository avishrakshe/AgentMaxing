/**
 * ONE CYCLE: watch → triage → draft for every enabled ecosystem (and optionally publish approved
 * drafts through the bridge). Called by the run_cycle tool, the dashboard and POST /api/cycle.
 */
import { draftPosts } from "./draft";
import { publishDraft } from "./publish";
import { sameEco, store } from "./store";
import { triageUpdates } from "./triage";
import { fetchUpdates } from "./updates";

export async function runCycle(ctx: { baseUrl: string }, opts: { publishApproved?: boolean } = {}) {
  const db = store();
  const sources = (await db.list("sources")).filter((s) => s.enabled);
  const ecosystems = [...new Map(sources.map((s) => [s.ecosystem.toLowerCase(), s.ecosystem])).values()];
  const groups = await db.list("groups");
  const report: Record<string, unknown>[] = [];

  for (const eco of ecosystems) {
    const fetched = await fetchUpdates(eco, ctx);
    const entry: Record<string, unknown> = { ecosystem: eco, fetched: fetched.newCount ?? 0 };
    if ("refused" in fetched && fetched.refused) {
      entry.budget = fetched.message;
      report.push(entry);
      break; // Budget exhausted: stop paying for anything else this cycle.
    }
    const triage = await triageUpdates(eco);
    entry.kept = "kept" in triage ? triage.kept?.length : 0;
    entry.merged = "merged" in triage ? triage.merged?.length : 0;
    entry.skipped = "skipped" in triage ? triage.skipped?.length : 0;
    entry.drafts = [];
    for (const g of groups.filter((g) => g.ecosystems.some((e) => sameEco(e, eco)))) {
      const r = await draftPosts({ groupId: g.id });
      (entry.drafts as unknown[]).push({ group: g.name, created: "created" in r ? r.created : 0 });
    }
    report.push(entry);
  }

  const published: unknown[] = [];
  if (opts.publishApproved && process.env.WA_BRIDGE_URL) {
    for (const d of (await db.list("drafts")).filter((d) => d.status === "approved")) {
      published.push({ draftId: d.id, ...(await publishDraft(d.id, ctx)) });
    }
  }

  return { ecosystems: ecosystems.length, report, published };
}
