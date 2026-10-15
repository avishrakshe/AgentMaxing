/**
 * Structured Gemini calls: JSON mode + response schema, validated with zod.
 * On a parse/validation failure we retry once (with the error), then throw.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export class StructuredOutputError extends Error {}

let client: GoogleGenAI | null = null;
export const gemini = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

function jsonSchemaFor(schema: z.ZodType) {
  const { $schema, ...rest } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  void $schema;
  return rest;
}

export async function generateJson<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T; temperature?: number }): Promise<z.infer<T>> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? opts.prompt : `${opts.prompt}\n\nYour previous answer was invalid: ${lastError}\nReturn ONLY JSON that matches the schema.`;
    const res = await gemini().models.generateContent({
      model: MODEL,
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
