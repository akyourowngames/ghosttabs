import type {
  ApprovedMemory,
  MemoryCandidate,
  SourceAnalysis,
} from "@/types";

/** Pull a JSON object out of a model response, tolerating fences / prose. */
export function extractJson(text: string): unknown {
  if (!text) return null;
  const tryParse = (s: string): unknown | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const f = tryParse(fenced[1]);
    if (f) return f;
  }

  const start = text.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const obj = tryParse(text.slice(start, i + 1));
          if (obj) return obj;
          break;
        }
      }
    }
  }

  return null;
}

/** Remove control characters that can break JSON / models. */
export function sanitizeText(s: string): string {
  return (s || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Limit text sent to the model. */
export function truncateForAnalysis(text: string, max = 10_000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…[truncated]";
}

/** Normalize for duplicate detection. */
export function normalizeForDedupe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Deterministic safety net applied AFTER the model returns candidates. The
 * primary defense is the strict system prompt; this blacklist catches obvious
 * noise (phase labels, build logs, greetings, account metadata).
 */
const JUNK_BLACKLIST: RegExp[] = [
  /\bphase\s*[1-9]\b/i,
  /build succeeded/i,
  /typescript error/i,
  /npm run build/i,
  /chrome extension loaded/i,
  /account user/i,
  /good to see you/i,
  /development status/i,
  /\bchrome:\/\//i,
  /you said/i,
  /phase \d+ (complete|done)/i,
];

/** Allowed durable memory types. */
export const MEMORY_TYPES = new Set(["decision", "goal", "question", "fact"]);

/** Confidence threshold: below this, an item is an AI observation, not memory. */
export const MEMORY_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Validate + filter raw model output into approved durable memories (Part 14).
 * Rejects malformed items, wrong types, and obvious noise. The `reason` field
 * is retained for debugging but must NOT be shown in the user UI.
 */
export function validateApprovedMemories(raw: unknown): ApprovedMemory[] {
  if (!Array.isArray(raw)) return [];
  const out: ApprovedMemory[] = [];
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

    const reason = o.reason ? String(o.reason).slice(0, 400) : undefined;

    const hay = (title + " " + content).toLowerCase();
    if (JUNK_BLACKLIST.some((re) => re.test(hay))) continue;

    out.push({
      type: type as ApprovedMemory["type"],
      title,
      content,
      confidence,
      reason,
    });
  }
  return out;
}

/**
 * Backwards-compatible candidate memory filter. Used only when a model returns
 * the legacy `memories` array. Kept for existing stored analyses.
 */
export function validateMemoryCandidates(raw: unknown): MemoryCandidate[] {
  return validateApprovedMemories(raw).map((m) => ({
    type: m.type,
    title: m.title,
    content: m.content,
    confidence: m.confidence,
  }));
}

/**
 * Parse the model response into a structured {@link SourceAnalysis}. Returns
 * null only when the JSON is malformed beyond recovery. Approved memories are
 * validated/filtered here.
 */
export function parseSourceAnalysis(raw: string): SourceAnalysis | null {
  const data = extractJson(raw) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;

  let relevance = Number(data.relevance);
  if (!Number.isFinite(relevance)) relevance = 0.5;
  relevance = Math.max(0, Math.min(1, relevance));

  const qualityRaw = String(data.sourceQuality ?? "medium").toLowerCase();
  const sourceQuality: SourceAnalysis["sourceQuality"] =
    qualityRaw === "high" || qualityRaw === "low" ? qualityRaw : "medium";

  const summary = String(data.summary ?? "").trim();
  const keyTopics = asStringArray(data.keyTopics);
  const importantPoints = asStringArray(data.importantPoints);
  const goals = asStringArray(data.goals);
  const decisions = asStringArray(data.decisions);
  const questions = asStringArray(data.questions);
  const facts = asStringArray(data.facts);

  const approved = validateApprovedMemories(
    (data as { approvedMemories?: unknown }).approvedMemories
  );
  const memories = validateMemoryCandidates(
    (data as { memories?: unknown }).memories
  );

  return {
    summary,
    keyTopics,
    importantPoints,
    goals,
    decisions,
    questions,
    facts,
    relevance,
    sourceQuality,
    memories: approved.length ? memoriesFromApproved(approved).concat(memories) : memories,
  };
}

/** Convert approved memories into the legacy candidate shape for storage. */
function memoriesFromApproved(approved: ApprovedMemory[]): MemoryCandidate[] {
  return approved.map((m) => ({
    type: m.type,
    title: m.title,
    content: m.content,
    confidence: m.confidence,
  }));
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0 && x.length <= 600)
    .slice(0, 24);
}
