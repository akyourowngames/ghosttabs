import type { ContextAnalysis, MemoryCandidate } from "@/types";

/** Pull a JSON object out of a model response, tolerating fences / prose. */
export function extractJson(text: string): unknown {
  if (!text) return null;

  // 1. Direct parse.
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  // 2. Strip ```json fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  // 3. Extract the first {...} object from surrounding prose.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // fall through
    }
  }

  return null;
}

/** Limit text sent to the model (spec targets ~8k–12k useful chars). */
export function truncateForAnalysis(text: string, max = 10_000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…[truncated]";
}

/** Normalize for duplicate detection (no semantic similarity yet). */
export function normalizeForDedupe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Second quality filter. A small, purposeful blacklist applied AFTER the
 * model returns candidates. The primary defense remains the system prompt;
 * this is a deterministic safety net for obvious noise patterns.
 */
const MEMORY_BLACKLIST: RegExp[] = [
  /\bphase\s*[1-9]\b/i,
  /build succeeded/i,
  /typescript error/i,
  /npm run build/i,
  /chrome extension loaded/i,
  /account user/i,
  /good to see you/i,
  /development status/i,
];

/** Allowed durable memory types. */
export const MEMORY_TYPES = new Set(["decision", "goal", "question", "fact"]);

/**
 * Validate + filter raw model output into clean memory candidates.
 * Rejects malformed items and obvious noise (blacklist). Lower confidence
 * items are kept here (they become AI observations, not durable memory).
 */
export function validateMemoryCandidates(raw: unknown): MemoryCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryCandidate[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const type = o.type;
    if (typeof type !== "string" || !MEMORY_TYPES.has(type)) continue;

    const title = String(o.title ?? "").trim();
    if (!title || title.length > 240) continue;

    let content = String(o.content ?? "").trim();
    if (!content) content = title;
    if (content.length > 1200) content = content.slice(0, 1200);
    if (!content) continue;

    let confidence = Number(o.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));

    const hay = (title + " " + content).toLowerCase();
    if (MEMORY_BLACKLIST.some((re) => re.test(hay))) continue;

    out.push({
      type: type as MemoryCandidate["type"],
      title,
      content,
      confidence,
    });
  }
  return out;
}

/**
 * Parse the model response into a structured ContextAnalysis. Returns null
 * only when the JSON is malformed beyond recovery. Memory candidates are
 * validated/filtered here.
 */
export function parseContextAnalysis(raw: string): ContextAnalysis | null {
  const data = extractJson(raw) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;

  let relevance = Number(data.relevance);
  if (!Number.isFinite(relevance)) relevance = 0.5;
  relevance = Math.max(0, Math.min(1, relevance));

  const summary = String(data.summary ?? "").trim();
  const memories = validateMemoryCandidates(
    (data as { memories?: unknown }).memories
  );

  return { summary, relevance, memories };
}
