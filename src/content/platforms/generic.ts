// Generic / fallback conversation extractor + shared utilities.
// Pure, page-context functions only (no module-scope side effects) so they can
// be bundled into an injected content script. Do NOT reference chrome.* here.

import type {
  ConversationContext,
  ConversationExtractor,
  ConversationMessage,
  ConversationRole,
  SourceLink,
  SourceCodeBlock,
  SourceSection,
  SourceType,
} from "@/types";

/** Safety limits for long-conversation walking (Part 7). */
export const SAFEGUARDS = {
  maxMessages: 500,
  maxChars: 100_000,
  maxScrollAttempts: 120,
  noNewThreshold: 6,
  scrollDelayMs: 180,
};

/** Selectors for UI chrome that should NEVER enter a captured document (Part 4). */
const JUNK_SELECTOR = [
  "script",
  "style",
  "noscript",
  "button",
  "[role='button']",
  "svg",
  "nav",
  "header",
  "aside",
  "footer",
  "form",
  "input",
  "[data-testid*='copy']",
  "[data-testid*='retry']",
  "[data-testid*='regenerate']",
  "[data-testid*='share']",
  "[data-testid*='vote']",
  "[data-testid*='feedback']",
  "[data-testid*='sidebar']",
  "[data-testid*='nav']",
  "[data-testid*='toolbar']",
  "[data-testid*='cookie']",
  "[data-testid*='subscribe']",
  "[data-testid*='newsletter']",
  "[class*='sidebar']",
  "[class*='cookie']",
  "[class*='newsletter']",
  "[class*='ad-']",
  "[class*='ads']",
  "[class*='banner']",
  "[class*='footer']",
  "[class*='toolbar']",
  "[class*='recommend']",
  "[class*='social']",
  ".copy-button",
  ".actions",
].join(",");

/** Strip UI chrome, reactions, copy/retry/share controls, navigation, etc. */
export function cleanText(el: Element | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(JUNK_SELECTOR).forEach((n) => n.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

/** Is this HTML element clearly non-content (Part 3 negative signals)? */
export function isJunkContainer(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (["nav", "footer", "aside", "header", "form"].includes(tag)) return true;
  const cls = (el.className || "").toString().toLowerCase();
  const id = (el.id || "").toLowerCase();
  const role = (el.getAttribute("role") || "").toLowerCase();
  const hay = `${cls} ${id} ${role}`;
  return (
    /nav|menu|sidebar|footer|cookie|banner|ad-|ads|advert|newsletter|subscribe|signup|login|social|share|recommend|comment|widget|toolbar|breadcrumb|pagination/i.test(
      hay
    ) || role === "navigation" || role === "banner" || role === "contentinfo"
  );
}

/** Positive readability signals for a candidate content block (Part 3). */
export function contentScore(el: Element): number {
  let score = 0;
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  const words = text ? text.split(/\s+/).length : 0;
  if (tag === "article" || tag === "main") score += 6;
  if (el.getAttribute("role") === "main") score += 6;
  if (tag === "section") score += 2;
  if (words >= 40) score += 4;
  if (words >= 120) score += 4;
  if (el.querySelector("p, li, blockquote, pre, table")) score += 3;
  if (el.querySelector("h1, h2, h3")) score += 2;
  if (el.querySelector("pre, code")) score += 2;
  if (isJunkContainer(el)) score -= 12;
  return score;
}

/** Extract meaningful content links, ignoring navigation / footer / social (Part 2). */
export function extractLinks(root: Element): SourceLink[] {
  const out: SourceLink[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    if (isJunkContainer(a)) continue;
    const text = (a.textContent || "").replace(/\s+/g, " ").trim();
    const href = (a.getAttribute("href") || "").trim();
    if (text.length < 3 || !href || href.startsWith("#")) continue;
    if (/^(javascript:|mailto:|tel:)/i.test(href)) continue;
    if (/\b(sign up|sign in|log in|subscribe|cookie|privacy policy|terms of service|accept)\b/i.test(text)) continue;
    const key = `${text.toLowerCase()}|${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: text.slice(0, 160), url: href });
    if (out.length >= 30) break;
  }
  return out;
}

/** Extract code blocks with a best-effort language guess (Part 2). */
export function extractCodeBlocks(root: Element): SourceCodeBlock[] {
  const out: SourceCodeBlock[] = [];
  const blocks = root.querySelectorAll(
    "pre, code, [class*='highlight'], [class*='code-block']"
  );
  for (const b of Array.from(blocks)) {
    const code = (b.textContent || "").replace(/\s+/g, " ").trim();
    if (code.length < 12) continue;
    let language: string | undefined;
    const m = (b.className || "")
      .toString()
      .match(/language-([a-z0-9+#]+)/i);
    if (m) language = m[1].toLowerCase();
    out.push({ language, code: code.slice(0, 4000) });
    if (out.length >= 40) break;
  }
  return out;
}

/** Walk a content root into ordered semantic sections (Part 2). */
export function extractSections(root: Element): SourceSection[] {
  const sections: SourceSection[] = [];
  const blocks = Array.from(
    root.querySelectorAll("h1, h2, h3, h4, p, ul, ol, blockquote, pre, table")
  );
  let current: SourceSection | null = null;
  for (const b of blocks) {
    if (isJunkContainer(b)) continue;
    const tag = b.tagName.toLowerCase();
    if (/^h[1-4]$/.test(tag)) {
      if (current && current.content.trim()) sections.push(current);
      current = { heading: (b.textContent || "").trim().slice(0, 200), content: "" };
    } else {
      const txt = cleanText(b);
      if (!txt) continue;
      if (!current) current = { content: "" };
      current.content += (current.content ? "\n\n" : "") + txt;
    }
  }
  if (current && current.content.trim()) sections.push(current);
  const filtered = sections
    .map((s) => ({ heading: s.heading, content: s.content.trim().slice(0, 6000) }))
    .filter((s) => s.content.length > 0);
  return filtered.length ? filtered : [{ content: cleanText(root).slice(0, 6000) }];
}

/** Resolve the platform/source type from a URL (Part 1). */
export function detectSourceType(url: string): SourceType {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("chatgpt.com") || host.includes("chat.openai.com"))
      return "chatgpt";
    if (host.includes("claude.ai")) return "claude";
    if (host.includes("github.com")) return "github";
    if (host.includes("youtube.com") || host.includes("youtu.be"))
      return "youtube";
    if (host.includes("docs.") || /\/docs\b/.test(host)) return "document";
    return "webpage";
  } catch {
    return "unknown";
  }
}

/** True when a page is a real, meaningful conversation (Part 5). */
export function looksLikeConversation(url: string): boolean {
  return detectSourceType(url) === "chatgpt" || detectSourceType(url) === "claude";
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

  // A real conversation page on a chat host becomes a webpage source, NOT a
  // fake conversation (Part 5). Homepages / empty threads are treated as pages.
  const isChat = looksLikeConversation(url);
  const readable =
    extractSections(document.body).map((s) => s.content).join("\n\n") ||
    cleanText(document.body);

  return {
    platform: isChat ? (detectSourceType(url) as "chatgpt" | "claude") : "generic",
    isConversation: false,
    title,
    url,
    messages: [],
    fullText: readable,
    messageCount: 0,
    wordCount: readable ? readable.split(/\s+/).length : 0,
    captureStatus: "complete",
    selectedText,
  };
}

/** Shared shape so chatgpt/claude extractors can be registered uniformly. */
export function genericExtractor(): ConversationExtractor {
  return { canHandle: () => false, extract: extractGeneric };
}

export type { ConversationMessage, ConversationRole };
