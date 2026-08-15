import type { ContextItem } from "@/types";
import { CONTINUATION_SYSTEM_PROMPT } from "./prompts";

export interface ContinuationInput {
  workspace: { name: string; goal?: string };
  /** Durable memory items: decision / goal / question / fact. */
  memories: ContextItem[];
  /** Recent captured sources: page / conversation / snippet. */
  recentSources: ContextItem[];
  /** Recent activity timeline entries. */
  recentActivity: { title: string; at: number }[];
}

export interface ContinuationPacket {
  text: string;
  decisionCount: number;
  goalCount: number;
  questionCount: number;
  factCount: number;
  sourceCount: number;
  estimatedTokens: number;
}

/** Rough token estimate (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function byRecency(a: ContextItem, b: ContextItem): number {
  return b.createdAt - a.createdAt;
}

/**
 * Build a compact continuation packet from workspace memory + recent source
 * summaries. Deterministic and reliable — it never resends full page contents,
 * only workspace memory and one-line source summaries (Phase 6 security rule).
 *
 * An optional AI compression step can use CONTINUATION_SYSTEM_PROMPT, but the
 * deterministic assembly is the default for reliability.
 */
export function generateContinuationContext(input: ContinuationInput): ContinuationPacket {
  const lines: string[] = [];

  const decisions = input.memories
    .filter((i) => i.type === "decision")
    .sort(byRecency);
  const goals = input.memories.filter((i) => i.type === "goal").sort(byRecency);
  const questions = input.memories
    .filter((i) => i.type === "question")
    .sort(byRecency);
  const facts = input.memories.filter((i) => i.type === "fact").sort(byRecency);

  // Only top-relevant sources, capped. Recent activity is NOT included — the
  // packet must carry useful memory, not a log (PART D #36).
  const sources = [...input.recentSources]
    .filter((s) => (s.analysis?.relevance ?? 0) >= 0.5)
    .sort((a, b) => (b.analysis?.relevance ?? 0) - (a.analysis?.relevance ?? 0))
    .slice(0, 6);

  lines.push("# GhostTab Workspace Context", "");
  lines.push("WORKSPACE");
  lines.push(input.workspace.name, "");

  if (input.workspace.goal) {
    lines.push("GOAL");
    lines.push(input.workspace.goal, "");
  }

  // Current focus derived from recent meaningful memory, not implementation logs.
  const currentFocus =
    goals[0]?.title || questions[0]?.title || input.workspace.goal || "—";
  lines.push("CURRENT FOCUS");
  lines.push(currentFocus, "");

  const block = (label: string, items: ContextItem[]) => {
    if (!items.length) return;
    lines.push(label);
    for (const it of items.slice(0, 12)) lines.push(`- ${it.title}`);
    lines.push("");
  };

  block("CONFIRMED DECISIONS", decisions);
  block("OPEN QUESTIONS", questions);
  block("IMPORTANT FACTS", facts);

  if (sources.length) {
    lines.push("RELEVANT SOURCES");
    for (const s of sources) {
      const oneLine = (s.analysis?.summary || s.title || "")
        .split("\n")[0]
        .slice(0, 140);
      const plat = s.source?.platform ? `[${s.source.platform}] ` : "";
      lines.push(`- ${plat}${s.title} — ${oneLine}`);
    }
    lines.push("");
  }

  lines.push("CONTINUE");
  lines.push(
    "Continue the work from this context. Do not restart from scratch."
  );

  const text = lines.join("\n");
  return {
    text,
    decisionCount: decisions.length,
    goalCount: goals.length,
    questionCount: questions.length,
    factCount: facts.length,
    sourceCount: sources.length,
    estimatedTokens: estimateTokens(text),
  };
}

export { CONTINUATION_SYSTEM_PROMPT };
