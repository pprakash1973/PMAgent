/**
 * Extracts the LAST valid JSON object from a model response string.
 * "Last" beats "first" because models emit preamble prose before the payload
 * far more often than trailing prose follows it (AC-7.4).
 * Shared by ai.ts and all upload/parse routes to guarantee consistent behaviour.
 */
export function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) return JSON.parse(fenced[1]);

  let depth = 0, lastStart = -1, lastEnd = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (depth++ === 0) lastStart = i; }
    else if (text[i] === "}") { if (--depth === 0 && lastStart !== -1) lastEnd = i; }
  }
  if (lastStart !== -1 && lastEnd !== -1) return JSON.parse(text.slice(lastStart, lastEnd + 1));
  throw new Error("AI did not return valid JSON");
}
