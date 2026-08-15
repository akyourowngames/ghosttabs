// Generic / fallback conversation extractor + shared utilities.
// Pure, page-context functions only (no module-scope side effects) so they can
// be bundled into an injected content script. Do NOT reference chrome.* here.

import type {
  ConversationContext,
  ConversationExtractor,
  ConversationMessage,
  ConversationRole,
} from "@/types";

/** Safety limits for long-conversation walking (PART A #5, #39). */
export const SAFEGUARDS = {
  maxMessages: 500,
  maxChars: 80_000,
  maxScrollAttempts: 100,
  noNewThreshold: 6,
  scrollDelayMs: 180,
};

/** Strip UI chrome, reactions, copy/retry/share controls, navigation, etc. */
export function cleanText(el: Element | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      [
        "button",
        "[role='button']",
        "svg",
        "nav",
        "header",
        "aside",
        "form",
        "[data-testid*='copy']",
        "[data-testid*='retry']",
        "[data-testid*='regenerate']",
        "[data-testid*='share']",
        "[data-testid*='vote']",
        "[data-testid*='feedback']",
        "[class*='sidebar']",
        "[class*='nav']",
        "[class*='toolbar']",
        ".copy-button",
        ".actions",
      ].join(",")
    )
    .forEach((n) => n.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

/** Stable identity for de-duplication (PART A #38). Falls back to role+text. */
export function normalizeKey(role: string, text: string): string {
  return `${role}:${(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140)}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function detectPlatformName(
  url: string
): "chatgpt" | "claude" | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("chatgpt.com") || host.includes("chat.openai.com"))
      return "chatgpt";
    if (host.includes("claude.ai")) return "claude";
  } catch {
    /* ignore */
  }
  return null;
}

export async function extractGeneric(): Promise<ConversationContext> {
  const title = (document.title || "").trim();
  const url = location.href;
  const selection = window.getSelection();
  const selectedText =
    selection && !selection.isCollapsed
      ? selection.toString().trim() || undefined
      : undefined;

  let readable = "";
  const selectors = [
    "article",
    "main",
    "[role='main']",
    ".markdown-body",
    ".md",
    ".content",
    "#content",
    ".post",
    "body",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && (el.textContent || "").trim().length > 120) {
      readable = cleanText(el);
      break;
    }
  }
  if (!readable) readable = cleanText(document.body);

  return {
    platform: "generic",
    title,
    url,
    messages: [],
    fullText: readable,
    messageCount: 0,
    selectedText,
  };
}

/** Shared shape so chatgpt/claude extractors can be registered uniformly. */
export function genericExtractor(): ConversationExtractor {
  return { canHandle: () => false, extract: extractGeneric };
}

export type { ConversationMessage, ConversationRole };
