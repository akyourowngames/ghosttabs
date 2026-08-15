import type {
  AnalyzeContextInput,
  ContextAnalysis,
  ContextItem,
  MemoryCandidate,
  MemoryType,
} from "@/types";
import { uid } from "@/lib/utils/format";
import { KiloClient, FALLBACK_MODEL, type KiloClientOptions } from "./client";
import { buildAnalysisMessages } from "./prompts";
import { normalizeForDedupe, parseContextAnalysis } from "./extract";
import { localCurate } from "./local";

export { localCurate } from "./local";
export type { AnalyzeContextInput, ContextAnalysis, MemoryCandidate } from "@/types";
export { parseContextAnalysis, extractJson, validateMemoryCandidates } from "./extract";

/** Confidence threshold: below this, an item is an AI observation, not durable memory. */
export const MEMORY_CONFIDENCE_THRESHOLD = 0.6;

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
  try {
    const raw = await client.chat(messages, { json: true, temperature: 0.2 });
    return { analysis: parseContextAnalysis(raw), raw };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Auto-recover: if the chosen model needs a signed-in (paid) account,
    // retry transparently with the free fallback model so capture still works.
    if (
      opts.model &&
      opts.model !== FALLBACK_MODEL &&
      /PAID_MODEL_AUTH_REQUIRED|sign in to use this model/i.test(msg)
    ) {
      const fb = new KiloClient({ ...opts, model: FALLBACK_MODEL });
      const raw = await fb.chat(messages, { json: true, temperature: 0.2 });
      return {
        analysis: parseContextAnalysis(raw),
        raw: `[auto-fallback to ${FALLBACK_MODEL}]\n` + raw,
      };
    }
    throw e;
  }
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
 * Local curator fallback used when no Kilo key is configured or the AI call
 * fails. Guarantees the workspace gains at least some memory instead of
 * nothing, and is clearly labeled as local (never a model response).
 */
export function devFallbackAnalysis(input: AnalyzeContextInput): {
  analysis: ContextAnalysis;
  raw: string;
} {
  const analysis = localCurate(input);
  return {
    analysis,
    raw: "[local extraction — no API call]\n" + JSON.stringify(analysis, null, 2),
  };
}
