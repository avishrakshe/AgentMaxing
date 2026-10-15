/**
 * Structured Gemini calls: JSON mode + response schema, validated with zod.
 * On a parse/validation failure we retry once (with the error), then throw.
 */
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";

export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";

export class StructuredOutputError extends Error {}

let client: GoogleGenAI | null = null;
export const gemini = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const CALL_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 45_000);
const transient = (err: unknown) =>
  /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|abort|timed? ?out/i.test(String((err as Error)?.message ?? err));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * generateContent with retries: Gemini regularly answers 503 "high demand".
 * Each call is cut off after GEMINI_TIMEOUT_MS (a "hung" model counts as transient).
 * 2 tries on the main model with backoff, then 2 on the fallback model.
 */
export async function generate(params: Omit<GenerateContentParameters, "model">): Promise<GenerateContentResponse> {
  const plan = [MODEL, MODEL, ...(FALLBACK_MODEL && FALLBACK_MODEL !== MODEL ? [FALLBACK_MODEL, FALLBACK_MODEL] : [MODEL])];
  let lastErr: unknown;
  for (let i = 0; i < plan.length; i++) {
    try {
      return await gemini().models.generateContent({
        ...params,
        model: plan[i],
        config: { ...params.config, abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
      });
    } catch (err) {
      lastErr = err;
      if (!transient(err)) throw err;
      console.warn(`[gemini] ${plan[i]} failed (${String((err as Error)?.message ?? err).slice(0, 120)}), retrying`);
      await sleep(800 * 2 ** (i % 2) + Math.random() * 400);
    }
  }
  throw lastErr;
}

function jsonSchemaFor(schema: z.ZodType) {
  const { $schema, ...rest } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  void $schema;
  return rest;
}

export async function generateJson<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T; temperature?: number }): Promise<z.infer<T>> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? opts.prompt : `${opts.prompt}\n\nYour previous answer was invalid: ${lastError}\nReturn ONLY JSON that matches the schema.`;
    const res = await generate({
      contents: prompt,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaFor(opts.schema),
        temperature: opts.temperature ?? 0.2,
      },
    });
    try {
      const parsed = opts.schema.safeParse(JSON.parse(res.text ?? ""));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500);
    } catch (err) {
      lastError = `not valid JSON (${err instanceof Error ? err.message : err})`;
    }
  }
  throw new StructuredOutputError(`Gemini returned invalid structured output twice: ${lastError}`);
}
