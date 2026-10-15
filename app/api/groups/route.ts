import { addGroup } from "@/lib/admin";
import { store } from "@/lib/store";

// POST /api/groups { name, ecosystems[], language?, mode?, maxPerDay?, jid? } -> create or update by name
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name || !Array.isArray(body.ecosystems) || !body.ecosystems.length) {
    return Response.json({ error: "name and at least one ecosystem are required" }, { status: 400 });
  }
  return Response.json(await addGroup(body));
}

// DELETE /api/groups?id=...
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await store().del("groups", id);
  return Response.json({ ok: true });
}
