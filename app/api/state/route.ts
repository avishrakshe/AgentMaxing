import { spendReport } from "@/lib/budget";
import { store, storeKind } from "@/lib/store";

// GET /api/state -> everything the dashboard shows
export async function GET() {
  const db = store();
  const [sources, groups, drafts, updates, spend] = await Promise.all([
    db.list("sources"),
    db.list("groups"),
    db.list("drafts"),
    db.list("updates"),
    spendReport(),
  ]);
  const tweets = new Map(updates.map((u) => [u.tweetId, { author: u.author, url: u.url }]));
  return Response.json({
    sources: sources.sort((a, b) => a.ecosystem.localeCompare(b.ecosystem)),
    groups: groups.sort((a, b) => a.name.localeCompare(b.name)),
    drafts: drafts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => ({ ...d, groupName: groups.find((g) => g.id === d.groupId)?.name ?? "?", sources: d.tweetIds.map((id) => tweets.get(id)).filter(Boolean) })),
    counts: {
      updates: updates.length,
      new: updates.filter((u) => u.status === "new").length,
    },
    spend,
    config: {
      store: storeKind(),
      xSource: process.env.X_SOURCE || "mock",
      bridge: Boolean(process.env.WA_BRIDGE_URL),
      relevanceThreshold: Number(process.env.RELEVANCE_THRESHOLD || 60),
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    },
  });
}
