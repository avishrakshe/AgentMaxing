import { ImageResponse } from "next/og";
import { aiBackground, loadFonts } from "@/lib/poster/assets";
import { H, Poster, W } from "@/lib/poster/Poster";
import { sampleSpec } from "@/lib/poster/samples";
import { store } from "@/lib/store";
import type { PosterTemplate } from "@/lib/types";

const TEMPLATES: PosterTemplate[] = ["announcement", "event", "hackathon", "digest"];

// GET /api/poster/<draftId>             -> the draft's poster PNG
// GET /api/poster/sample-<template>     -> template preview (?stress=1 for overflow testing)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stress = new URL(req.url).searchParams.get("stress") === "1";

  let spec, theme;
  const sample = id.match(/^sample-(\w+)$/)?.[1] as PosterTemplate | undefined;
  if (sample) {
    if (!TEMPLATES.includes(sample)) return new Response(`Unknown template. Use one of: ${TEMPLATES.join(", ")}`, { status: 404 });
    spec = sampleSpec(sample, stress);
  } else {
    const draft = await store().get("drafts", id);
    if (!draft) return new Response("Draft not found", { status: 404 });
    spec = draft.posterSpec;
    theme = (await store().get("groups", draft.groupId))?.theme;
  }

  const [fonts, background] = await Promise.all([loadFonts(), aiBackground(id, spec)]);
  return new ImageResponse(<Poster spec={spec} theme={theme} background={background} />, {
    width: W,
    height: H,
    // An empty array would mean "no fonts at all"; undefined falls back to the built-in font.
    fonts: fonts.length ? fonts : undefined,
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
