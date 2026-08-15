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
  /** Curated current focus (Part 16). Changed only on strong evidence. */
  currentFocus?: string;
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
  /** Clean semantic source document captured locally (Part 1). */
  document?: SourceDocument;
  /** AI analysis attached after a source is captured (Part 12). */
  analysis?: SourceAnalysis;
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
  /** True only when this is a real, multi-turn conversation (Part 5). */
  isConversation: boolean;
  title: string;
  url: string;
  messages: ConversationMessage[];
  fullText: string;
  messageCount: number;
  /** Word count of the captured conversation. */
  wordCount?: number;
  /** "complete" when the whole thread was walked, "partial" otherwise. */
  captureStatus?: "complete" | "partial";
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
  workspace: { name: string; goal?: string; currentFocus?: string };
  source: {
    title: string;
    url?: string;
    platform?: string;
    /** Clean semantic document (Part 1) — preferred over raw content. */
    document?: SourceDocument;
    headings?: string[];
    content: string;
    selectedText?: string;
    isConversation?: boolean;
    messages?: { role: ConversationRole; text: string }[];
  };
  /** Existing memory items, so the model avoids duplicates. */
  existingMemory?: string[];
}

/** Durable, curated memory produced by the Memory Curator (Part 14). */
export interface ApprovedMemory {
  type: MemoryType;
  title: string;
  content: string;
  /** 0–1 confidence this is genuinely durable workspace memory. */
  confidence: number;
  /** Internal/debug only — must NOT appear in the user UI (Part 14). */
  reason?: string;
}

/** Structured analysis attached to a captured source (Part 12). */
export interface SourceAnalysis {
  summary: string;
  /** Short topic labels derived from the source. */
  keyTopics: string[];
  /** Important points worth surfacing in the detail view. */
  importantPoints: string[];
  /** Analysis facets — these are ANALYSIS, not automatically memory (Part 12). */
  goals: string[];
  decisions: string[];
  questions: string[];
  facts: string[];
  /** 0–1 relevance of this source to the active workspace goal. */
  relevance: number;
  sourceQuality: "high" | "medium" | "low";
  /** Backwards-compatible: candidate memories (durable + observations). */
  memories: MemoryCandidate[];
}

/**
 * Legacy alias kept for backward compatibility with stored records and the
 * rest of the app. Use {@link SourceAnalysis} for new code.
 */
export type ContextAnalysis = SourceAnalysis;

// --- Clean source document model (Part 1) -----------------------------------

/** Where the captured content came from. */
export type SourceType =
  | "webpage"
  | "chatgpt"
  | "claude"
  | "github"
  | "youtube"
  | "document"
  | "unknown";

/** A single semantic section of a page. */
export interface SourceSection {
  heading?: string;
  content: string;
}

/** A meaningful link extracted from a page. */
export interface SourceLink {
  text: string;
  url: string;
}

/** A code block extracted from a technical page. */
export interface SourceCodeBlock {
  language?: string;
  code: string;
}

/**
 * Clean, semantic representation of a captured source. Never stores raw DOM
 * (Part 1). This is the canonical artifact the rest of the pipeline consumes.
 */
export interface SourceDocument {
  id: string;
  workspaceId: string;
  sourceType: SourceType;
  title: string;
  url: string;
  domain?: string;
  capturedAt: number;
  description?: string;
  headings: string[];
  sections?: SourceSection[];
  text: string;
  links?: SourceLink[];
  codeBlocks?: SourceCodeBlock[];
  conversation?: { role: ConversationRole; text: string }[];
  selectedText?: string;
  wordCount?: number;
  messageCount?: number;
  captureStatus: "complete" | "partial";
  analysis?: SourceAnalysis;
}

// --- Memory (durable) -------------------------------------------------------

/** A single piece of durable workspace memory stored as a ContextItem. */
export interface MemoryRecord {
  type: MemoryType;
  title: string;
  content: string;
  /** 0–1 confidence this is genuinely durable workspace memory. */
  confidence: number;
}

// --- Continuation (Part 18) -------------------------------------------------

/** A selected relevant source summary for the continuation packet. */
export interface RelevantSourceSummary {
  title: string;
  summary: string;
  url?: string;
}

/** Curated inputs the continuation generator is allowed to consume (Part 15). */
export interface ContinuationInputState {
  workspace: { name: string; goal?: string; currentFocus?: string };
  approvedMemories: ApprovedMemory[];
  relevantSources: RelevantSourceSummary[];
}

export interface PageContext {
  title: string;
  url: string;
  domain?: string;
  description?: string;
  headings: string[];
  readableText: string;
  sections?: SourceSection[];
  text?: string;
  links?: SourceLink[];
  codeBlocks?: SourceCodeBlock[];
  selectedText?: string;
}

// Re-exported chrome message sender helper type for convenience.
export type MessageSender = chrome.runtime.MessageSender;
