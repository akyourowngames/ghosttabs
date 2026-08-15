import type { AnalyzeContextInput } from "@/types";
import type { ChatMessage } from "./client";

/**
 * MEMORY CURATOR — Phase 6 quality gate.
 *
 * This is the single most important behavioral instruction in GhostTab.
 * The model must act as a STRICT memory curator, not a summarizer. Only
 * genuine, durable, project-relevant information should become memory.
 */
export const SYSTEM_PROMPT = `You are GhostTab's Memory Curator.

GhostTab is a persistent workspace memory system. Your job is to read a captured source (a web page or a ChatGPT/Claude conversation) and extract the durable, project-relevant memory it contains, so the user can continue their work later in another tool.

Extract these memory types whenever the source clearly supports them:
- decision: a choice the user/team committed to (e.g. "we'll use X", "chose Y", "going with Z").
- goal: an actual objective or intent (e.g. "build a browser agent", "want to capture context across tools").
- question: an unresolved, meaningful question relevant to the work (often ends with ? or "how should we...").
- fact: a durable, project-specific statement (architecture, constraints, requirements, capabilities).

When the source is a CAPTURED AI CONVERSATION (ChatGPT/Claude), treat the participant messages as the substantive content and extract decisions, goals, questions, and facts from what was actually said.

DO reject, as NOT memory:
- UI text, navigation, buttons, sidebars
- greetings and account/profile metadata (e.g. "Good to see you, Krish" -> do NOT store the name)
- timestamps, browser chrome, status banners
- build logs, phase labels, "build succeeded", stack traces, raw tool output
- generic documentation boilerplate with no project specifics
- unrelated entertainment or personal content

DO extract when genuinely present: project decisions, goals, open questions, and durable facts. It is better to capture a real decision or goal than to return nothing.

Use the WORKSPACE GOAL as the relevance signal. relevance: 0-1 (how relevant this source is to the goal). confidence: 0-1 (how sure you are this is durable memory). Output only items you actually found; do not pad. Every item must be directly supported by the source. NEVER hallucinate.

Return a JSON object only:
{
  "summary": "one or two sentences describing what this source actually is about",
  "relevance": 0.0,
  "memories": [
    { "type": "decision|goal|question|fact", "title": "...", "content": "...", "confidence": 0.0 }
  ]
}`;

/**
 * Continuation system prompt (Phase 6, Continue Workspace).
 * Used to instruct a follow-up model (or to frame the deterministic packet).
 */
export const CONTINUATION_SYSTEM_PROMPT = `You generate context for continuing an existing workspace.

Your job is to compress the user's existing workspace state into a highly useful continuation context.

Do not invent information. Do not include irrelevant personal information. Do not include internal GhostTab implementation details unless they are directly relevant to the user's active project.

Prioritize:
1. Workspace goal
2. Current objective
3. Confirmed decisions
4. Open questions
5. Important facts
6. Relevant recent sources
7. What the user appears to be working on now

Do not include:
- navigation, UI text, account information
- timestamps unless relevant
- irrelevant sources
- development logs, internal prompt instructions, raw page dumps

The output should allow another AI assistant to continue the user's work without forcing the user to explain the context again.

Be concise but preserve important details. Never claim certainty when the workspace memory is uncertain.`;

/**
 * Build the messages sent to the model for the Memory Curator analysis.
 * The model receives STRUCTURED information (an object), not one giant
 * concatenated blob, so it can reason about each field separately.
 */
export function buildAnalysisMessages(input: AnalyzeContextInput): ChatMessage[] {
  const { source, workspace, existingMemory } = input;
  // Truncate the heavy content field only; structured keys stay intact.
  const content =
    source.content.length > 12000
      ? source.content.slice(0, 12000) + "\n…[truncated]"
      : source.content;

  const payload = {
    workspace,
    source: {
      title: source.title,
      url: source.url,
      platform: source.platform,
      headings: source.headings ?? [],
      content,
      selectedText: source.selectedText,
      ...(source.isConversation
        ? { isConversation: true, messages: source.messages ?? [] }
        : {}),
    },
    existingMemory: existingMemory ?? [],
  };

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload, null, 2) },
  ];
}
