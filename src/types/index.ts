// ---------------------------------------------------------------------------
// GhostTab — Shared domain + messaging types
// ---------------------------------------------------------------------------

export type ContextType =
  | "conversation"
  | "decision"
  | "page"
  | "snippet"
  | "goal"
  | "question"
  | "fact";

export interface Workspace {
  id: string;
  name: string;
  goal?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContextSource {
  url?: string;
  platform?: string;
}

export interface ContextItem {
  id: string;
  workspaceId: string;
  type: ContextType;
  title: string;
  content: string;
  source?: ContextSource;
  createdAt: number;
  /** AI analysis attached after a page is captured (Phase 5). */
  analysis?: ContextAnalysis;
  /** Raw model response for this source, so the UI can show exactly what the AI said. */
  analysisRaw?: string;
  /** Conversation capture (Phase 7): ordered messages, when type === "conversation". */
  messages?: ConversationMessage[];
  /** Full captured conversation text (stored locally, never sent whole to AI). */
  fullText?: string;
  /** Number of messages in the captured conversation. */
  messageCount?: number;
}

// --- Deep conversation capture (Phase 7) ------------------------------------

export type ConversationRole = "user" | "assistant" | "unknown";

export interface ConversationMessage {
  role: ConversationRole;
  text: string;
  index: number;
}

export interface ConversationContext {
  platform: "chatgpt" | "claude" | "generic";
  title: string;
  url: string;
  messages: ConversationMessage[];
  fullText: string;
  messageCount: number;
  selectedText?: string;
}

export interface ConversationExtractor {
  canHandle(url: string): boolean;
  extract(): Promise<ConversationContext>;
}

export interface WorkspaceState {
  workspaceId: string;
  activeTabIds: string[];
}

// --- Messaging between extension surfaces ----------------------------------

export type ExtensionMessage =
  | { type: "GHOSTTAB_OPEN_SIDE_PANEL"; windowId?: number }
  | { type: "GHOSTTAB_GET_TAB_CONTEXT" }
  | { type: "GHOSTTAB_TAB_CONTEXT"; payload: unknown };

// --- AI context analysis (Phase 6, Memory Quality Gate) ----------------------

/** Memory types that can become durable workspace memory. */
export type MemoryType = "decision" | "goal" | "question" | "fact";

/** A single candidate memory produced by the AI curator. */
export interface MemoryCandidate {
  type: MemoryType;
  title: string;
  content: string;
  /** 0–1 confidence that this is genuinely durable workspace memory. */
  confidence: number;
}

/** Structured input for the Memory Curator analysis. */
export interface AnalyzeContextInput {
  workspace: { name: string; goal?: string };
  source: {
    title: string;
    url?: string;
    platform?: string;
    headings?: string[];
    content: string;
    selectedText?: string;
    isConversation?: boolean;
    messages?: { role: ConversationRole; text: string }[];
  };
  /** Existing memory items, so the model avoids duplicates. */
  existingMemory?: string[];
}

/** Structured analysis attached to a captured source. */
export interface ContextAnalysis {
  summary: string;
  /** 0–1 relevance of this source to the active workspace goal. */
  relevance: number;
  /** Candidate memories (durable + observations). */
  memories: MemoryCandidate[];
}

export interface PageContext {
  title: string;
  url: string;
  headings: string[];
  readableText: string;
  selectedText?: string;
}

// Re-exported chrome message sender helper type for convenience.
export type MessageSender = chrome.runtime.MessageSender;
