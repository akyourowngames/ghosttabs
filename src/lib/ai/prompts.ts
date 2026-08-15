import type {
  AnalyzeContextInput,
  ApprovedMemory,
  ContinuationInputState,
  SourceAnalysis,
} from "@/types";
import type { ChatMessage } from "./client";
import { sanitizeText } from "./extract";

/**
 * MEMORY CURATOR — strict quality gate (Parts 13–14).
 *
 * The model receives ONE CLEAN SOURCE DOCUMENT and the active workspace, and
 * must return only durable, decision-relevant memory. It is explicitly
 * forbidden from summarizing the source, copying text, or reporting dev/UI
 * noise. The `reason` field is internal/debug only and never shown in the UI.
 */
export const SYSTEM_PROMPT = `You are GhostTab's persistent-memory curator.

You are given ONE CLEAN SOURCE DOCUMENT and the user's ACTIVE WORKSPACE.

Your task is to identify ONLY durable workspace knowledge.

DO NOT summarize the entire source.
DO NOT copy source text.
DO NOT report development status.
DO NOT report implementation progress.
DO NOT report what the AI assistant was instructed to do.
DO NOT report browser UI.
DO NOT report account metadata.
DO NOT report names or greetings.
DO NOT report temporary actions.
DO NOT report phase numbers.
DO NOT report build/test results.
DO NOT report internal engineering logs.
DO NOT convert instructions into decisions.
DO NOT convert suggestions into decisions.
DO NOT convert documentation statements into user decisions.
DO NOT infer personal information.

A DECISION requires evidence that the user/team actually selected or committed to an option.
A GOAL requires evidence that it is an actual objective of the workspace.
A QUESTION must represent a meaningful unresolved issue.
A FACT must be durable and useful for future work.

The user's WORKSPACE GOAL is the strongest relevance signal.

Ask: "If the user returns to this workspace tomorrow, will this information help them continue the work?"
If not, reject it.
When uncertain, reject it.
False positives are worse than missing a memory.

Return ONLY JSON:
{
  "summary": "one or two sentences describing what this source actually is about",
  "keyTopics": ["short topic labels"],
  "importantPoints": ["concise points worth surfacing"],
  "relevance": 0.0,
  "sourceQuality": "high" | "medium" | "low",
  "approvedMemories": [
    {
      "type": "decision" | "goal" | "question" | "fact",
      "title": "...",
      "content": "...",
      "confidence": 0.0,
      "reason": "why this is durable memory (internal/debug only)"
    }
  ]
}`;

/**
 * CONTINUATION COMPRESSOR (Parts 19–20).
 * Receives ONLY curated workspace memory + selected relevant source summaries.
 */
export const CONTINUATION_SYSTEM_PROMPT = `You are GhostTab's context compressor.

Your job is to create a concise, trustworthy continuation context for another AI assistant.

You receive ONLY curated workspace memory and selected relevant source summaries.

Never request or infer information outside the provided data.

Do not include:
- development logs
- phase history
- build/test information
- browser UI
- personal profile data
- greetings
- account metadata
- raw conversation dumps
- irrelevant sources
- internal GhostTab implementation details unless they are directly relevant to the workspace goal

Prioritize:
1. Active workspace goal
2. Current focus
3. Confirmed decisions
4. Open questions
5. Durable facts
6. Most relevant sources

Never invent missing information.
Do not say something was decided unless the memory explicitly identifies it as a decision.
Do not turn a fact into a decision.
Do not turn an observation into a goal.

The resulting context should allow a new AI assistant to continue the user's work immediately.
Keep it compact.

Return ONLY the continuation text in this format:

# Workspace Context

WORKSPACE
...

GOAL
...

CURRENT FOCUS
...

CONFIRMED DECISIONS
- ...

OPEN QUESTIONS
- ...

IMPORTANT FACTS
- ...

RELEVANT SOURCES
- ...`;

/** Build the Memory Curator analysis messages (Part 18: only curated inputs). */
export function buildAnalysisMessages(input: AnalyzeContextInput): ChatMessage[] {
  const { source, workspace, existingMemory } = input;

  // Send the clean document when available; otherwise fall back to bounded text.
  const payload: Record<string, unknown> = {
    workspace: {
      name: workspace.name,
      goal: workspace.goal ?? null,
      currentFocus: workspace.currentFocus ?? null,
    },
    existingMemory: existingMemory ?? [],
  };

  if (source.document) {
    const d = source.document;
    payload.source = {
      sourceType: d.sourceType,
      title: d.title,
      url: d.url,
      description: d.description ?? null,
      headings: d.headings,
      sections: (d.sections ?? []).map((s) => ({
        heading: s.heading ?? null,
        content: s.content.slice(0, 4000),
      })),
      links: (d.links ?? []).slice(0, 20),
      codeBlocks: (d.codeBlocks ?? []).map((c) => ({
        language: c.language ?? null,
        code: c.code.slice(0, 1500),
      })),
      conversation: d.conversation
        ? d.conversation.slice(-60).map((m) => ({
            role: m.role,
            text: m.text.slice(0, 2000),
          }))
        : undefined,
      text: d.text.slice(0, 12000),
    };
  } else {
    const rawContent =
      source.content.length > 12000
        ? source.content.slice(0, 12000) + "\n…[truncated]"
        : source.content;
    const messages = (source.messages ?? [])
      .slice(-40)
      .map((m) => ({ role: m.role, text: sanitizeText(m.text).slice(0, 2000) }));
    payload.source = {
      title: source.title,
      url: source.url,
      platform: source.platform,
      headings: source.headings ?? [],
      content: sanitizeText(rawContent),
      selectedText: source.selectedText,
      ...(source.isConversation ? { isConversation: true, messages } : {}),
    };
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload, null, 2) },
  ];
}

/** Build the continuation messages (Part 18: only curated state). */
export function buildContinuationMessages(
  state: ContinuationInputState
): ChatMessage[] {
  const payload = {
    workspace: {
      name: state.workspace.name,
      goal: state.workspace.goal ?? null,
      currentFocus: state.workspace.currentFocus ?? null,
    },
    approvedMemories: state.approvedMemories.map((m) => ({
      type: m.type,
      title: m.title,
      content: m.content,
    })),
    relevantSources: state.relevantSources.map((s) => ({
      title: s.title,
      summary: s.summary,
      url: s.url ?? null,
    })),
  };
  return [
    { role: "system", content: CONTINUATION_SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload, null, 2) },
  ];
}

// Re-export for callers that import the analysis shape.
export type { SourceAnalysis, ApprovedMemory };
