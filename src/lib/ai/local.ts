import type { AnalyzeContextInput, ContextAnalysis, MemoryCandidate } from "@/types";

/**
 * Local, dependency-free curator used when no Kilo key is configured or the AI
 * call fails. It performs lightweight heuristic extraction so the workspace
 * always gains some memory instead of nothing. Clearly labeled as local so it
 * is never mistaken for a model response.
 */

const DECISION_RE =
  /(decided|chose|choosing|going with|will use|let'?s use|we'?ll use|settled on|adopt(?:ed)?|picked|selected|switched to|use \w+ (?:for|as))/i;
const QUESTION_RE =
  /\?$|how (?:should|do|can|could|to)|should we|what (?:should|is|are|would)|why (?:do|does|is|are)|which (?:one|tool|approach|model|service|framework)|can (?:we|i) (?:use|build|do)/i;
const FACT_RE =
  /(?:is|are|uses|stores|runs|built with|implemented|based on|requires|supports|provides|handles|manages|means that)\b/i;

export function localCurate(input: AnalyzeContextInput): ContextAnalysis {
  const { source, workspace } = input;

  const parts: string[] = [];
  if (source.content) parts.push(source.content);
  if (source.messages?.length) {
    parts.push(
      source.messages.map((m) => `${m.role}: ${m.text}`).join("\n")
    );
  }
  const text = parts.join("\n");

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 400);

  const out: MemoryCandidate[] = [];

  if (workspace.goal) {
    out.push({
      type: "goal",
      title: workspace.goal.slice(0, 140),
      content: workspace.goal,
      confidence: 0.85,
    });
  }

  const seen = new Set<string>();
  for (const s of sentences) {
    const key = s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 60);
    if (seen.has(key)) continue;

    if (DECISION_RE.test(s)) {
      out.push({ type: "decision", title: s.slice(0, 140), content: s, confidence: 0.72 });
      seen.add(key);
    } else if (QUESTION_RE.test(s)) {
      out.push({ type: "question", title: s.slice(0, 140), content: s, confidence: 0.7 });
      seen.add(key);
    } else if (FACT_RE.test(s)) {
      out.push({ type: "fact", title: s.slice(0, 140), content: s, confidence: 0.62 });
      seen.add(key);
    }
  }

  const deduped = out.slice(0, 14);
  const relevance = workspace.goal
    ? 0.72
    : deduped.length > 0
      ? 0.6
      : 0.45;

  return {
    summary: `Local extraction from ${
      source.title || source.url || "captured source"
    } — ${deduped.length} memory candidate(s).`,
    keyTopics: [],
    importantPoints: [],
    goals: deduped.filter((m) => m.type === "goal").map((m) => m.title),
    decisions: deduped.filter((m) => m.type === "decision").map((m) => m.title),
    questions: deduped.filter((m) => m.type === "question").map((m) => m.title),
    facts: deduped.filter((m) => m.type === "fact").map((m) => m.title),
    relevance,
    sourceQuality: "medium",
    memories: deduped,
  };
}
