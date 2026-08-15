import type {
  ConversationContext,
  ContextItem,
  PageContext,
  SourceDocument,
  SourceSection,
  SourceType,
} from "@/types";
import { uid } from "@/lib/utils/format";

/** Best-effort detection of the platform a captured URL belongs to. */
export function detectPlatform(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("github.com")) return "GitHub";
    if (host.includes("claude.ai")) return "Claude";
    if (host.includes("chatgpt.com") || host.includes("chat.openai.com"))
      return "ChatGPT";
    if (host.includes("youtube.com")) return "YouTube";
    if (host.includes("stackoverflow.com")) return "StackOverflow";
    if (host.includes("notion.so")) return "Notion";
    if (host.includes("docs.") || host.includes("/docs")) return "Docs";
    return undefined;
  } catch {
    return undefined;
  }
}

/** Map a capture platform to the display badge label. */
export function displayPlatform(p: string): string {
  switch (p) {
    case "chatgpt":
      return "ChatGPT";
    case "claude":
      return "Claude";
    case "github":
      return "GitHub";
    case "youtube":
      return "YouTube";
    default:
      return (p || "WEB").toUpperCase();
  }
}

/** Map a SourceType to a human badge label. */
export function displaySourceType(t: SourceType): string {
  switch (t) {
    case "chatgpt":
      return "ChatGPT";
    case "claude":
      return "Claude";
    case "github":
      return "GitHub";
    case "youtube":
      return "YouTube";
    case "document":
      return "Docs";
    case "webpage":
      return "Page";
    default:
      return (t || "WEB").toUpperCase();
  }
}

/**
 * Build a clean {@link SourceDocument} for a webpage capture (Part 1).
 * Never stores raw DOM — only the semantic representation returned by the
 * deep extractor.
 */
export function buildPageDocument(
  workspaceId: string,
  ctx: PageContext
): SourceDocument {
  const sections: SourceSection[] = ctx.headings.length
    ? [{ heading: ctx.headings[0], content: ctx.readableText }]
    : [{ content: ctx.readableText }];
  return {
    id: uid("sd"),
    workspaceId,
    sourceType: "webpage",
    title: ctx.title || ctx.url || "Current page",
    url: ctx.url,
    domain: ctx.domain,
    description: ctx.description,
    headings: ctx.headings,
    sections,
    text: ctx.readableText,
    selectedText: ctx.selectedText,
    wordCount: ctx.readableText ? ctx.readableText.split(/\s+/).length : 0,
    capturedAt: Date.now(),
    captureStatus: "complete",
  };
}

/**
 * Build a clean {@link SourceDocument} for a captured conversation (Part 1, #10).
 * Preserves the ordered message structure; the raw thread is stored locally and
 * never sent whole to the AI.
 */
export function buildConversationDocument(
  workspaceId: string,
  conv: ConversationContext
): SourceDocument {
  const sourceType: SourceType =
    conv.platform === "chatgpt" || conv.platform === "claude"
      ? conv.platform
      : "webpage";
  return {
    id: uid("sd"),
    workspaceId,
    sourceType,
    title: conv.title,
    url: conv.url,
    domain: safeDomain(conv.url),
    headings: [],
    sections: [],
    text: conv.fullText,
    conversation: conv.messages.map((m) => ({ role: m.role, text: m.text })),
    selectedText: conv.selectedText,
    wordCount: conv.wordCount,
    messageCount: conv.messageCount,
    capturedAt: Date.now(),
    captureStatus: conv.captureStatus ?? "complete",
  };
}

/** Build a stored ContextItem for a normal webpage. */
export function buildPageItem(
  workspaceId: string,
  ctx: PageContext,
  doc: SourceDocument
): ContextItem {
  const platform = detectPlatform(ctx.url);
  return {
    id: uid("c"),
    workspaceId,
    type: "page",
    title: doc.title,
    content: formatPageContent(ctx),
    source: { url: ctx.url, platform },
    document: doc,
    createdAt: Date.now(),
  };
}

/** Build a stored ContextItem for a captured conversation. */
export function buildConversationItem(
  workspaceId: string,
  conv: ConversationContext,
  doc: SourceDocument
): ContextItem {
  const messages = conv.messages;
  const platform = displayPlatform(conv.platform);
  const words = conv.wordCount ?? 0;
  const summary =
    conv.messageCount > 0
      ? `${conv.messageCount} messages · ~${words.toLocaleString()} words`
      : "Conversation captured";

  return {
    id: uid("c"),
    workspaceId,
    type: conv.isConversation ? "conversation" : "page",
    title: doc.title,
    content: summary,
    source: { url: conv.url, platform },
    document: doc,
    messages,
    fullText: conv.fullText,
    messageCount: conv.messageCount,
    createdAt: Date.now(),
  };
}

function formatPageContent(ctx: PageContext): string {
  const parts: string[] = [];
  if (ctx.headings.length) {
    parts.push(`Headings: ${ctx.headings.slice(0, 6).join(" · ")}`);
  }
  const text = ctx.readableText.trim();
  if (text) {
    const preview = text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
    parts.push(preview);
  }
  return parts.join("\n\n");
}

/** Compress a conversation for the AI analysis input (Part 25: bounded subset). */
export function analysisTextForConversation(conv: ConversationContext): string {
  const cap = 4_000;
  if (conv.fullText.length <= cap) return conv.fullText;
  return (
    conv.fullText.slice(0, cap) +
    `\n…[truncated ${conv.messageCount} messages]`
  );
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
