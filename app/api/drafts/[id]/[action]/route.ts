import { regenerateDraft } from "@/lib/draft";
import { markSent, publishDraft, reviewDraft } from "@/lib/publish";

// POST /api/drafts/<id>/<approve|reject|edit|regenerate|publish|mark-sent>
//   approve: { confirmFlagged? }   edit: { caption?, title?, subtitle?, cta? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    switch (action) {
      case "approve":
        return Response.json(await reviewDraft({ draftId: id, action: "approve", confirmFlagged: body.confirmFlagged === true }));
      case "reject":
        return Response.json(await reviewDraft({ draftId: id, action: "reject" }));
      case "edit":
        return Response.json(await reviewDraft({ draftId: id, action: "edit", edits: body }));
      case "regenerate": {
        const d = await regenerateDraft(id);
        return Response.json({ ok: true, status: d.status });
      }
      case "publish":
        return Response.json(await publishDraft(id, { baseUrl: new URL(req.url).origin }));
      case "mark-sent":
        return Response.json(await markSent(id));
      default:
        return Response.json({ error: `Unknown action ${action}` }, { status: 404 });
    }
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
