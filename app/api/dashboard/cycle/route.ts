import { runCycle } from "@/lib/cycle";

// POST /api/dashboard/cycle -> "Run cycle now" button. Same reach as the chat's run_cycle tool:
// it can only spend within DAILY_BUDGET_USD and never publishes. (External schedulers use /api/cycle.)
export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: "Add GEMINI_API_KEY first." }, { status: 500 });
  try {
    return Response.json(await runCycle({ baseUrl: new URL(req.url).origin }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
