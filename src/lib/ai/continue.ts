import type {
  ApprovedMemory,
  ContextItem,
  ContinuationInputState,
  RelevantSourceSummary,
  SourceAnalysis,
} from "@/types";
import { KiloClient, type KiloClientOptions } from "./client";
import { buildContinuationMessages } from "./prompts";

export interface ContinuationPacket {
  text: string;
  decisionCount: number;
  goalCount: number;
  questionCount: number;
  factCount: number;
  sourceCount: number;
  estimatedTokens: number;
  usedAI: boolean;
}

/** Rough token estimate (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

const MEMORY_TYPES = new Set(["decision", "goal", "question", "fact"]);

/**
 * Build the curated inputs the continuation generator is ALLOWED to consume
 * (Part 15). It reads ONLY:
 *   - workspace.goal + workspace.currentFocus
 *   - approved (durable) memories
 *   - top-5 relevant source *summaries* (never raw source text or activity)
 */
export function buildContinuationState(
  workspace: { name: string; goal?: string; currentFocus?: string },
  memories: ContextItem[],
  sources: ContextItem[]
): ContinuationInputState {
  const approved: ApprovedMemory[] = memories
    .filter((i) => MEMORY_TYPES.has(i.type))
    .map((i) => ({
      type: i.type as ApprovedMemory["type"],
      title: i.title,
      content: i.content,
      confidence: 0.8,
    }));

  // Top-5 relevant sources by relevance, then recency (Parts 16–17).
  const relevantSources: RelevantSourceSummary[] = sources
    .filter((s) => (s.analysis?.relevance ?? 0) >= 0.4)
    .sort(
      (a, b) =>
        (b.analysis?.relevance ?? 0) - (a.analysis?.relevance ?? 0) ||
        b.createdAt - a.createdAt
    )
    .slice(0, 5)
    .map((s) => ({
      title: s.title || s.source?.url || "Source",
      summary: continuationSummary(s.analysis),
      url: s.source?.url,
    }));

  return {
    workspace: {
      name: workspace.name,
      goal: workspace.goal,
      currentFocus: workspace.currentFocus,
    },
    approvedMemories: approved,
    relevantSources,
  };
}

function continuationSummary(a?: SourceAnalysis): string {
  if (!a) return "";
  return (a.summary || a.keyTopics.join(", ") || "").split("\n")[0].slice(0, 220);
}

/**
 * Generate the continuation packet. The deterministic assembly is the default
 * and never includes raw source text, activity, or dev logs (Part 20). When a
 * Kilo key is configured, an AI compressor tightens it using ONLY the curated
 * state (Part 19).
 */
export async function generateContinuationContext(
  state: ContinuationInputState,
  opts?: KiloClientOptions
): Promise<ContinuationPacket> {
  const deterministic = assembleDeterministic(state);

  if (opts?.apiKey) {
    try {
      const client = new KiloClient(opts);
      const messages = buildContinuationMessages(state);
      const aiText = await client.chat(messages, { temperature: 0.1 });
      if (aiText && aiText.trim().length > 40) {
        return finalize(aiText.trim(), state, true);
      }
    } catch (err) {
      console.warn("[GhostTab] continuation AI compress failed, using deterministic:", err);
    }
  }

  return finalize(deterministic, state, false);
}

function assembleDeterministic(state: ContinuationInputState): string {
  const lines: string[] = [];
  const { workspace, approvedMemories, relevantSources } = state;

  const decisions = approvedMemories.filter((m) => m.type === "decision");
  const goals = approvedMemories.filter((m) => m.type === "goal");
  const questions = approvedMemories.filter((m) => m.type === "question");
  const facts = approvedMemories.filter((m) => m.type === "fact");

  lines.push("# Workspace Context", "");
  lines.push("WORKSPACE");
  lines.push(workspace.name, "");

  if (workspace.goal) {
    lines.push("GOAL");
    lines.push(workspace.goal, "");
  }

  lines.push("CURRENT FOCUS");
  lines.push(workspace.currentFocus || workspace.goal || "—", "");

  const block = (label: string, items: ApprovedMemory[]) => {
    if (!items.length) return;
    lines.push(label);
    for (const it of items.slice(0, 12)) lines.push(`- ${it.title}`);
    lines.push("");
  };

  block("CONFIRMED DECISIONS", decisions);
  block("GOALS", goals);
  block("OPEN QUESTIONS", questions);
  block("IMPORTANT FACTS", facts);

  if (relevantSources.length) {
    lines.push("RELEVANT SOURCES");
    for (const s of relevantSources) {
      const oneLine = s.summary.split("\n")[0].slice(0, 160);
      const plat = s.url ? ` (${s.url})` : "";
      lines.push(`- ${s.title}${plat} — ${oneLine}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function finalize(
  text: string,
  state: ContinuationInputState,
  usedAI: boolean
): ContinuationPacket {
  const decisions = state.approvedMemories.filter((m) => m.type === "decision").length;
  const goals = state.approvedMemories.filter((m) => m.type === "goal").length;
  const questions = state.approvedMemories.filter((m) => m.type === "question").length;
  const facts = state.approvedMemories.filter((m) => m.type === "fact").length;
  return {
    text,
    decisionCount: decisions,
    goalCount: goals,
    questionCount: questions,
    factCount: facts,
    sourceCount: state.relevantSources.length,
    estimatedTokens: estimateTokens(text),
    usedAI,
  };
}
