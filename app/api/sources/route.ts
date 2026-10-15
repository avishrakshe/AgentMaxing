import { addSource } from "@/lib/admin";
import { store } from "@/lib/store";

const fail = (message: string, status = 400) => Response.json({ error: message }, { status });

// POST /api/sources { ecosystem, kind, value?, allowedDomains? } -> add (or merge) a source
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.ecosystem || !["handle", "list", "query"].includes(body.kind)) return fail("ecosystem and kind (handle|list|query) are required");
  return Response.json(await addSource(body));
}

// PATCH /api/sources { id, enabled } -> toggle
export async function PATCH(req: Request) {
  const { id, enabled } = await req.json();
  const source = await store().get("sources", id);
  if (!source) return fail("not found", 404);
  const next = { ...source, enabled: Boolean(enabled) };
  await store().put("sources", id, next);
  return Response.json(next);
}

// DELETE /api/sources?id=...
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("id required");
  await store().del("sources", id);
  await store().del("cursors", id);
  return Response.json({ ok: true });
}
