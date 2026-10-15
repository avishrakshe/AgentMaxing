import { runCycle } from "@/lib/cycle";

// POST /api/cycle (Authorization: Bearer CYCLE_SECRET) -> one watch→triage→draft cycle.
// ?publish=1 also sends approved drafts through the WhatsApp bridge (Phase 2 scheduler).
export async function POST(req: Request) {
  const secret = process.env.CYCLE_SECRET;
  if (!secret) return Response.json({ error: "Set CYCLE_SECRET to enable /api/cycle." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  try {
    return Response.json(await runCycle({ baseUrl: url.origin }, { publishApproved: url.searchParams.get("publish") === "1" }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
