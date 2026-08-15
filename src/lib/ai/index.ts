import type {
  AnalyzeContextInput,
  ContextAnalysis,
  ContextItem,
  MemoryCandidate,
  MemoryType,
} from "@/types";
import { uid } from "@/lib/utils/format";
import { KiloClient, type KiloClientOptions } from "./client";
import { buildAnalysisMessages } from "./prompts";
import { normalizeForDedupe, parseContextAnalysis } from "./extract";

export type { AnalyzeContextInput, ContextAnalysis, MemoryCandidate } from "@/types";
export { parseContextAnalysis, extractJson, validateMemoryCandidates } from "./extract";

/** Confidence threshold: below this, an item is an AI observation, not durable memory. */
export const MEMORY_CONFIDENCE_THRESHOLD = 0.75;

export interface AnalyzeOptions extends KiloClientOptions {}

/**
 * Run the Memory Curator analysis against a captured source.
 * Returns both the parsed analysis (null if unparseable) and the RAW model
 * response so the UI can show exactly what the model said.
 */
export async function analyzeContext(
  input: AnalyzeContextInput,
  opts: AnalyzeOptions
): Promise<{ analysis: ContextAnalysis | null; raw: string }> {
  const client = new KiloClient(opts);
  const messages = buildAnalysisMessages(input);
  const raw = await client.chat(messages, { json: true, temperature: 0.2 });
  return { analysis: parseContextAnalysis(raw), raw };
}

/**
 * Convert the durable memories (confidence >= threshold, de-duplicated) into
 * standalone workspace memory items. Lower-confidence candidates remain
 * attached to the source as AI observations and are NOT returned here.
 */
export function convertMemoriesToItems(
  analysis: ContextAnalysis,
  workspaceId: string,
  sourceUrl?: string,
  existing: ContextItem[] = []
): ContextItem[] {
  const items: ContextItem[] = [];
  for (const m of analysis.memories) {
    if (m.confidence < MEMORY_CONFIDENCE_THRESHOLD) continue; // observation only
    items.push(buildMemoryItem(m, workspaceId, sourceUrl));
  }
  return dedupeAgainstExisting(items, existing);
}

function buildMemoryItem(
  m: MemoryCandidate,
  workspaceId: string,
  sourceUrl?: string
): ContextItem {
  return {
    id: uid(),
    workspaceId,
    type: m.type as MemoryType,
    title: m.title,
    content: m.content,
    source: sourceUrl ? { url: sourceUrl } : undefined,
    createdAt: Date.now(),
  } satisfies ContextItem;
}

/** Remove items whose normalized title/content already exists in `existing`. */
export function dedupeAgainstExisting(
  items: ContextItem[],
  existing: ContextItem[]
): ContextItem[] {
  const seen = new Set(
    existing.map((i) => `${i.type}:${normalizeForDedupe(i.title)}`)
  );
  const out: ContextItem[] = [];
  for (const it of items) {
    const key = `${it.type}:${normalizeForDedupe(it.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Dev fallback used only when no Kilo API key is configured. Clearly marked,
 * and intentionally produces NO durable memory (we never invent user data).
 */
export function devFallbackAnalysis(input: AnalyzeContextInput): {
  analysis: ContextAnalysis;
  raw: string;
} {
  console.warn("[GhostTab] dev fallback: no Kilo API key — skipping memory extraction.");
  const firstSentence = (input.source.content || "")
    .split(/(?<=[.!?])\s+/)[0]
    ?.slice(0, 240);
  const analysis: ContextAnalysis = {
    summary: firstSentence || input.source.title,
    relevance: input.workspace.goal ? 0.55 : 0.45,
    memories: [],
  };
  return {
    analysis,
    raw: "[dev fallback] No Kilo API key configured — memory extraction skipped.",
  };
}
