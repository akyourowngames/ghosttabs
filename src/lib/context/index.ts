import type {
  ContextItem,
  ConversationContext,
  ConversationMessage,
  PageContext,
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

/** Map a lowercase capture platform to the display badge label. */
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

/** Build a stored ContextItem for a normal webpage. */
export function buildPageItem(workspaceId: string, ctx: PageContext): ContextItem {
  const platform = detectPlatform(ctx.url);
  return {
    id: uid("c"),
    workspaceId,
    type: "page",
    title: ctx.title || ctx.url || "Current page",
    content: formatPageContent(ctx),
    source: { url: ctx.url, platform },
    createdAt: Date.now(),
  };
}

/** Build a stored ContextItem for a captured conversation (PART A). */
export function buildConversationItem(
  workspaceId: string,
  conv: ConversationContext
): ContextItem {
  const messages: ConversationMessage[] = conv.messages;
  const platform = displayPlatform(conv.platform);
  const words = conv.fullText ? conv.fullText.trim().split(/\s+/).length : 0;
  const summary =
    conv.messageCount > 0
      ? `${conv.messageCount} messages · ~${words.toLocaleString()} words`
      : "Conversation captured";

  return {
    id: uid("c"),
    workspaceId,
    type: "conversation",
    title: conv.title || platform,
    content: summary,
    source: { url: conv.url, platform },
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

/** Compress a conversation for the AI analysis input (PART A #10). */
export function analysisTextForConversation(conv: ConversationContext): string {
  // The structured `messages` are also sent, so keep this prose copy small to
  // avoid duplicating the whole conversation and blowing the model context.
  const cap = 4_000;
  if (conv.fullText.length <= cap) return conv.fullText;
  return (
    conv.fullText.slice(0, cap) +
    `\n…[truncated ${conv.messageCount} messages]`
  );
}
