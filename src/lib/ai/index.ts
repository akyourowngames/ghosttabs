import type {
  AnalyzeContextInput,
  ApprovedMemory,
  ContextItem,
  MemoryType,
  SourceAnalysis,
} from "@/types";
import { uid } from "@/lib/utils/format";
import { KiloClient, type KiloClientOptions } from "./client";
import { buildAnalysisMessages } from "./prompts";
import { normalizeForDedupe, parseSourceAnalysis } from "./extract";

export type { AnalyzeContextInput, ContextAnalysis, MemoryCandidate } from "@/types";
export { localCurate } from "./local";
export {
  parseSourceAnalysis,
  extractJson,
  validateApprovedMemories,
  validateMemoryCandidates,
} from "./extract";

/** Confidence threshold: below this, an item is an AI observation, not memory. */
export const MEMORY_CONFIDENCE_THRESHOLD = 0.75;

export interface AnalyzeOptions extends KiloClientOptions {}

/**
 * Run the Memory Curator analysis against a captured source.
 * Returns both the parsed {@link SourceAnalysis} (null if unparseable) and the
 * RAW model response so the UI can show exactly what the model returned.
 */
export async function analyzeContext(
  input: AnalyzeContextInput,
  opts: AnalyzeOptions
): Promise<{ analysis: SourceAnalysis | null; raw: string; approved: ApprovedMemory[] }> {
  const client = new KiloClient(opts);
  const messages = buildAnalysisMessages(input);
  const raw = await client.chat(messages, { json: true, temperature: 0.2 });
  const analysis = parseSourceAnalysis(raw);
  return {
    analysis,
    raw,
    approved: analysis ? filterApproved(analysis, input) : [],
  };
}

/** Extract approved (durable) memories from a parsed analysis. */
function filterApproved(
  analysis: SourceAnalysis,
  input: AnalyzeContextInput
): ApprovedMemory[] {
  // Prefer explicit approvedMemories; fall back to validated legacy memories.
  const fromApproved = (analysis as unknown as { approvedMemories?: ApprovedMemory[] })
    .approvedMemories;
  const pool: ApprovedMemory[] = Array.isArray(fromApproved)
    ? fromApproved
    : analysis.memories.map((m) => ({
        type: m.type,
        title: m.title,
        content: m.content,
        confidence: m.confidence,
      }));

  return pool
    .filter(
      (m) =>
        m.confidence >= MEMORY_CONFIDENCE_THRESHOLD &&
        !isDuplicateOfExisting(m, input.existingMemory)
    )
    .slice(0, 24);
}

function isDuplicateOfExisting(
  m: ApprovedMemory,
  existing?: string[]
): boolean {
  if (!existing || !existing.length) return false;
  const key = normalizeForDedupe(m.title);
  return existing.some((e) => normalizeForDedupe(e).includes(key));
}

/**
 * Convert approved durable memories into standalone workspace memory items
 * (Part 21: MEMORY is its own stage). Lower-confidence items stay attached to
 * the source as AI observations and are NOT returned here.
 */
export function convertMemoriesToItems(
  approved: ApprovedMemory[],
  workspaceId: string,
  sourceUrl?: string,
  existing: ContextItem[] = []
): ContextItem[] {
  const items: ContextItem[] = [];
  for (const m of approved) {
    items.push(buildMemoryItem(m, workspaceId, sourceUrl));
  }
  return dedupeAgainstExisting(items, existing);
}

function buildMemoryItem(
  m: ApprovedMemory,
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
  analysis: SourceAnalysis;
  raw: string;
  approved: ApprovedMemory[];
} {
  console.warn("[GhostTab] dev fallback: no Kilo API key — skipping memory extraction.");
  const firstSentence = (input.source.content || "")
    .split(/(?<=[.!?])\s+/)[0]
    ?.slice(0, 240);
  const analysis: SourceAnalysis = {
    summary: firstSentence || input.source.title,
    keyTopics: [],
    importantPoints: [],
    goals: [],
    decisions: [],
    questions: [],
    facts: [],
    relevance: input.workspace.goal ? 0.55 : 0.45,
    sourceQuality: "low",
    memories: [],
  };
  return {
    analysis,
    raw: "[dev fallback] No Kilo API key configured — memory extraction skipped.",
    approved: [],
  };
}
