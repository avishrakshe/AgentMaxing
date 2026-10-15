/**
 * Poster assets: Google Fonts (loaded once per instance, cached) and the optional AI background.
 */
import { gemini } from "../gemini";
import type { PosterSpec } from "../types";

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: "normal" };

async function googleFont(family: string, weight: number): Promise<ArrayBuffer> {
  // With no browser User-Agent, Google Fonts serves TTF, which Satori can read (woff2 it can't).
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`)).text();
  const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error(`No TTF for ${family} ${weight}`);
  return (await fetch(url)).arrayBuffer();
}

let fonts: Promise<Font[]> | null = null;
export function loadFonts(): Promise<Font[]> {
  fonts ??= Promise.all([
    googleFont("Space Grotesk", 700).then((data) => ({ name: "Display", data, weight: 700 as const, style: "normal" as const })),
    googleFont("Space Grotesk", 500).then((data) => ({ name: "Display", data, weight: 500 as const, style: "normal" as const })),
    googleFont("JetBrains Mono", 500).then((data) => ({ name: "Mono", data, weight: 500 as const, style: "normal" as const })),
  ]).catch((err) => {
    console.warn("[poster] font load failed, using default font:", err);
    fonts = null; // retry on the next request
    return [];
  });
  return fonts;
}

/** POSTER_AI_BACKGROUND=true: abstract, text-free background. Any failure → null (gradient fallback). */
const bgCache = new Map<string, string | null>();
export async function aiBackground(key: string, spec: PosterSpec): Promise<string | null> {
  if (process.env.POSTER_AI_BACKGROUND !== "true" || !process.env.GEMINI_API_KEY) return null;
  if (bgCache.has(key)) return bgCache.get(key)!;
  try {
    const res = await Promise.race([
      gemini().models.generateContent({
        model: process.env.POSTER_IMAGE_MODEL || "gemini-nano-banana-2.1",
        contents: `Abstract dark editorial background for a ${spec.template} poster about "${spec.title}". Near-black, soft neon cyan, electric violet and pink light, subtle grain, depth. Absolutely no text, letters, numbers, logos or people. Portrait 4:5.`,
        config: { responseModalities: ["IMAGE"] },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 25_000)),
    ]);
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const url = part?.inlineData ? `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}` : null;
    bgCache.set(key, url);
    return url;
  } catch {
    bgCache.set(key, null);
    return null;
  }
}
