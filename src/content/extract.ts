import type {
  ConversationContext,
  PageContext,
  SourceDocument,
  SourceType,
  SourceSection,
  SourceLink,
  SourceCodeBlock,
} from "@/types";

/**
 * Collect structured, useful context from the current page without
 * dumping the entire DOM. Must stay fully self-contained (no references
 * to module-scope values) so it can be injected on demand via
 * chrome.scripting.executeScript.
 */
export function extractPageContext(): PageContext {
  const READABLE_MAX = 4000;
  const HEADING_MAX = 12;

  const safeDomain = (u: string): string | undefined => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return undefined;
    }
  };
  const metaContent = (name: string): string | undefined => {
    const el = document.querySelector(
      `meta[name='${name}'], meta[property='og:${name}'], meta[name='twitter:${name}']`
    );
    const c = el?.getAttribute("content");
    return c && c.trim() ? c.trim().slice(0, 500) : undefined;
  };

  const title = (document.title || "").trim();
  const url = location.href;
  const domain = safeDomain(url);

  const headings: string[] = [];
  document.querySelectorAll("h1, h2, h3").forEach((h) => {
    const t = (h.textContent || "").trim();
    if (t) headings.push(t);
  });
  if (headings.length > HEADING_MAX) headings.length = HEADING_MAX;

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
      readable = (el.textContent || "").replace(/\s+/g, " ").trim();
      break;
    }
  }
  if (!readable) {
    readable = (document.body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const readableText = selectedText
    ? selectedText.slice(0, READABLE_MAX)
    : readable.slice(0, READABLE_MAX);

  const description = metaContent("description");

  return { title, url, domain, description, headings, readableText, selectedText };
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function metaContent(name: string): string | undefined {
  const el = document.querySelector(
    `meta[name='${name}'], meta[property='og:${name}'], meta[name='twitter:${name}']`
  );
  const c = el?.getAttribute("content");
  return c && c.trim() ? c.trim().slice(0, 500) : undefined;
}

/**
 * Deep, clean webpage extraction (Parts 2–4). Produces a {@link SourceDocument}
 * with metadata, semantic sections, links, and code blocks — never raw DOM.
 * Best-effort and resilient: if nothing meaningful is found it returns an empty
 * document rather than throwing.
 */
export function extractPageDocument(
  workspaceId: string,
  sourceType: SourceType = "webpage"
): SourceDocument {
  const title = (document.title || "").trim();
  const url = location.href;
  const domain = safeDomain(url);
  const description = metaContent("description");

  const headings: string[] = [];
  document.querySelectorAll("h1, h2, h3").forEach((h) => {
    const t = (h.textContent || "").trim();
    if (t) headings.push(t);
  });

  const selection = window.getSelection();
  const selectedText =
    selection && !selection.isCollapsed
      ? selection.toString().trim() || undefined
      : undefined;

  // Prefer the highest-scoring semantic container, then walk it into sections.
  const candidates = Array.from(
    document.querySelectorAll("article, main, [role='main'], .markdown-body, .md, .content, #content, .post, body")
  ).filter((el) => (el.textContent || "").replace(/\s+/g, " ").trim().length > 120);

  let best: Element = document.body;
  let bestScore = -Infinity;
  for (const el of candidates) {
    const s = ctScore(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }

  const sections: SourceSection[] = ctSections(best);
  const text = sections.map((s) => (s.heading ? `${s.heading}\n\n${s.content}` : s.content)).join("\n\n");
  const links: SourceLink[] = ctLinks(best);
  const codeBlocks: SourceCodeBlock[] = ctCode(best);

  return {
    id: `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    workspaceId,
    sourceType,
    title: title || domain || "Page",
    url,
    domain,
    description,
    headings: headings.slice(0, 24),
    sections,
    text: text.slice(0, 60_000),
    links,
    codeBlocks,
    selectedText,
    wordCount: text ? text.split(/\s+/).length : 0,
    capturedAt: Date.now(),
    captureStatus: "complete",
  };
}

/**
 * Deep conversation capture for ChatGPT / Claude / generic pages (PART A).
 *
 * Injected on demand via chrome.scripting.executeScript, which serializes ONLY
 * this function body — module-scope imports are NOT available at injection
 * time. Therefore ALL platform logic is nested inside this function so it
 * stays self-contained. The canonical, modular version lives in
 * src/content/platforms/* (used by the content-script message path).
 */
export async function extractConversationContext(): Promise<ConversationContext> {
  const SAFEGUARDS = {
    maxMessages: 500,
    maxChars: 80_000,
    maxScrollAttempts: 100,
    noNewThreshold: 6,
    scrollDelayMs: 180,
  };

  const cleanText = (el: Element | null): string => {
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
    // Drop control characters that can corrupt the payload / model input.
    return (clone.textContent || "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // A turn with no readable text but an image (e.g. a generated image) is
  // still meaningful — represent it so the turn isn't dropped.
  const imageAwareText = (turn: Element): string => {
    const t = cleanText(turn);
    if (t.length >= 2) return t;
    if (turn.querySelector("img")) return "[image]";
    return t;
  };

  const normalizeKey = (role: string, text: string): string =>
    `${role}:${(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140)}`;

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const detectPlatform = (u: string): "chatgpt" | "claude" | null => {
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (host.includes("chatgpt.com") || host.includes("chat.openai.com"))
        return "chatgpt";
      if (host.includes("claude.ai")) return "claude";
    } catch {
      /* ignore */
    }
    return null;
  };

  const collectChatGPTTurns = (): {
    role: "user" | "assistant" | "unknown";
    text: string;
  }[] => {
    const out: { role: "user" | "assistant" | "unknown"; text: string }[] = [];
    const roleOf = (turn: Element): "user" | "assistant" | "unknown" => {
      const attr =
        turn.getAttribute("data-message-author-role") ||
        turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
      if (attr === "user" || attr === "assistant") return attr;
      const html = turn.innerHTML.toLowerCase();
      if (html.includes("you said")) return "user";
      const heading = turn.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading && /you/i.test(heading.textContent || "")) return "user";
      const label = Array.from(
        turn.querySelectorAll("[class*='label'], [data-testid*='author'], [aria-label]")
      )
        .map((n) => (n.getAttribute("aria-label") || n.textContent || "").toLowerCase())
        .join(" ");
      if (/\bchatgpt\b|\bgpt-4\b|\bo4\b/.test(label)) return "assistant";
      if (/\byou\b/.test(label)) return "user";
      return "unknown";
    };
    const main = document.querySelector("main");
    const roots = main ? [main] : [document];
    for (const root of roots) {
      for (const a of Array.from(root.querySelectorAll("article"))) {
        const text = imageAwareText(a);
        if (text.length < 2) continue;
        out.push({ role: roleOf(a), text });
      }
    }
    if (out.length === 0) {
      for (const n of Array.from(document.querySelectorAll("[data-message-author-role]"))) {
        const text = imageAwareText(n);
        if (text.length < 2) continue;
        const r = n.getAttribute("data-message-author-role");
        out.push({ role: r === "user" || r === "assistant" ? r : "unknown", text });
      }
    }
    return out;
  };

  const collectClaudeTurns = (): {
    role: "user" | "assistant" | "unknown";
    text: string;
  }[] => {
    const out: { role: "user" | "assistant" | "unknown"; text: string }[] = [];
    const roleOf = (turn: Element): "user" | "assistant" | "unknown" => {
      const cls = (turn.className || "").toLowerCase();
      if (cls.includes("user-message") || cls.includes("font-user")) return "user";
      if (cls.includes("claude-message") || cls.includes("font-claude")) return "assistant";
      const attr =
        turn.getAttribute("data-testid") ||
        turn.querySelector("[data-testid]")?.getAttribute("data-testid") ||
        "";
      if (/user/i.test(attr)) return "user";
      if (/assistant|claude/i.test(attr)) return "assistant";
      const html = turn.innerHTML.toLowerCase();
      if (html.includes("you said")) return "user";
      const label = Array.from(turn.querySelectorAll("[aria-label], [data-testid*='author']"))
        .map((n) => (n.getAttribute("aria-label") || n.getAttribute("data-testid") || "").toLowerCase())
        .join(" ");
      if (/claude/.test(label)) return "assistant";
      if (/\byou\b/.test(label)) return "user";
      return "unknown";
    };
    for (const t of Array.from(document.querySelectorAll("[data-testid='conversation-turn']"))) {
      const text = imageAwareText(t);
      if (text.length < 2) continue;
      out.push({ role: roleOf(t), text });
    }
    if (out.length > 0) return out;
    for (const b of Array.from(
      document.querySelectorAll(
        ".font-user-message, .font-claude-message, [data-testid='user-message'], [data-testid='assistant-message']"
      )
    )) {
      const text = imageAwareText(b);
      if (text.length < 2) continue;
      out.push({ role: roleOf(b), text });
    }
    if (out.length > 0) return out;
    const main = document.querySelector("main");
    if (main) {
      for (const a of Array.from(main.querySelectorAll("article"))) {
        const text = imageAwareText(a);
        if (text.length < 2) continue;
        out.push({ role: roleOf(a), text });
      }
    }
    return out;
  };

  const walk = async (
    collect: () => { role: "user" | "assistant" | "unknown"; text: string }[]
  ): Promise<{ role: "user" | "assistant" | "unknown"; text: string; index: number }[]> => {
    const scrollEl =
      (document.querySelector("main") as HTMLElement | null) ??
      (document.scrollingElement as HTMLElement | null) ??
      document.body;
    const savedTop = scrollEl.scrollTop;
    const seen = new Map<
      string,
      { role: "user" | "assistant" | "unknown"; text: string; chunkRank: number; domPos: number }
    >();
    let chunkRank = 0;

    const collectAll = () => {
      const turns = collect(); // DOM order: oldest -> newest within viewport
      turns.forEach((t, domPos) => {
        const key = normalizeKey(t.role, t.text);
        if (!key || seen.has(key)) return;
        seen.set(key, { role: t.role, text: t.text, chunkRank, domPos });
      });
      chunkRank++;
    };

    // Start at the current position (usually the bottom / latest messages),
    // then scroll UP so the chat client lazily loads older turns (ChatGPT and
    // Claude load history when you scroll toward the top).
    collectAll();
    await delay(SAFEGUARDS.scrollDelayMs);

    let stuckStreak = 0;
    for (let attempt = 0; attempt < SAFEGUARDS.maxScrollAttempts; attempt++) {
      const before = scrollEl.scrollTop;
      scrollEl.scrollTop = Math.max(
        0,
        scrollEl.scrollTop - Math.max(400, scrollEl.clientHeight * 0.8)
      );
      await delay(SAFEGUARDS.scrollDelayMs);
      collectAll();

      if (seen.size >= SAFEGUARDS.maxMessages) break;
      let total = 0;
      for (const m of seen.values()) total += m.text.length;
      if (total >= SAFEGUARDS.maxChars) break;

      const after = scrollEl.scrollTop;
      if (Math.abs(after - before) < 2) {
        // Reached the top (or can't scroll further) — give it one more pass
        // for any final load, then stop.
        stuckStreak += 1;
        if (stuckStreak >= 2) break;
      } else {
        stuckStreak = 0;
      }
    }
    scrollEl.scrollTop = savedTop;

    // Oldest -> newest: older chunks were collected later (higher chunkRank)
    // and should come first; within a chunk, preserve DOM order (domPos).
    return [...seen.values()]
      .sort((a, b) => b.chunkRank - a.chunkRank || a.domPos - b.domPos)
      .map((m, index) => ({ role: m.role, text: m.text, index }));
  };

  const url = location.href;
  const platform = detectPlatform(url);

  // If per-turn role detection failed entirely, infer by alternation
  // (conversations start with the user).
  const inferRolesIfNeeded = (
    msgs: { role: "user" | "assistant" | "unknown"; text: string; index: number }[]
  ) => {
    if (msgs.length && msgs.every((m) => m.role === "unknown")) {
      msgs.forEach((m, i) => (m.role = i % 2 === 0 ? "user" : "assistant"));
    }
    return msgs;
  };

  if (platform === "chatgpt") {
    const messages = inferRolesIfNeeded(await walk(collectChatGPTTurns));
    let title = (document.title || "").trim();
    if (!title || /chatgpt/i.test(title)) {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) title = firstUser.text.slice(0, 90);
    }
    const fullText = messages.map((m) => `${m.role.toUpperCase()}\n${m.text}`).join("\n\n");
    const wc = fullText ? fullText.split(/\s+/).length : 0;
    return { platform: "chatgpt", isConversation: messages.length >= 2, title, url, messages, fullText, messageCount: messages.length, wordCount: wc, captureStatus: messages.length >= 2 ? "partial" : "complete" };
  }

  if (platform === "claude") {
    const messages = inferRolesIfNeeded(await walk(collectClaudeTurns));
    let title = (document.title || "").trim();
    if (!title || /claude/i.test(title)) {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) title = firstUser.text.slice(0, 90);
    }
    const fullText = messages.map((m) => `${m.role.toUpperCase()}\n${m.text}`).join("\n\n");
    const wc = fullText ? fullText.split(/\s+/).length : 0;
    return { platform: "claude", isConversation: messages.length >= 2, title, url, messages, fullText, messageCount: messages.length, wordCount: wc, captureStatus: messages.length >= 2 ? "partial" : "complete" };
  }

  // Generic page.
  const selection = window.getSelection();
  const selectedText =
    selection && !selection.isCollapsed ? selection.toString().trim() || undefined : undefined;
  let readable = "";
  for (const sel of ["article", "main", "[role='main']", ".content", "#content", "body"]) {
    const el = document.querySelector(sel);
    if (el && (el.textContent || "").trim().length > 120) {
      readable = cleanText(el);
      break;
    }
  }
  if (!readable) readable = cleanText(document.body);
  return {
    platform: "generic",
    isConversation: false,
    title: (document.title || "").trim(),
    url,
    messages: [],
    fullText: readable,
    messageCount: 0,
    wordCount: readable ? readable.split(/\s+/).length : 0,
    captureStatus: "complete",
    selectedText,
  };
}

// ---------------------------------------------------------------------------
// Self-contained readability helpers for extractPageDocument().
// These mirror src/content/platforms/generic.ts but are inlined here because
// extractPageDocument() is injected via chrome.scripting.executeScript and
// cannot use module-scope imports at injection time.
// ---------------------------------------------------------------------------

function ctScore(el: Element): number {
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
  const hay = `${el.className || ""} ${el.id || ""} ${(el.getAttribute("role") || "")}`.toLowerCase();
  if (/nav|menu|sidebar|footer|cookie|banner|ad-|ads|advert|newsletter|subscribe|signup|login|social|share|recommend|comment|widget|toolbar|breadcrumb|pagination/i.test(hay)) score -= 12;
  return score;
}

function ctClean(el: Element | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      "script,style,noscript,button,[role='button'],svg,nav,header,aside,footer,form,input,[data-testid*='copy'],[data-testid*='retry'],[data-testid*='share'],[class*='sidebar'],[class*='cookie'],[class*='banner'],[class*='ads']"
    )
    .forEach((n) => n.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function ctIsJunk(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (["nav", "footer", "aside", "header", "form"].includes(tag)) return true;
  const hay = `${el.className || ""} ${el.id || ""} ${(el.getAttribute("role") || "")}`.toLowerCase();
  return /nav|menu|sidebar|footer|cookie|banner|ad-|ads|advert|newsletter|subscribe|signup|login|social|share|recommend|comment|widget|toolbar|breadcrumb|pagination/i.test(hay) || (el.getAttribute("role") || "") === "navigation";
}

function ctSections(root: Element): SourceSection[] {
  const sections: SourceSection[] = [];
  const blocks = Array.from(
    root.querySelectorAll("h1, h2, h3, h4, p, ul, ol, blockquote, pre, table")
  );
  let current: SourceSection | null = null;
  for (const b of blocks) {
    if (ctIsJunk(b)) continue;
    const tag = b.tagName.toLowerCase();
    if (/^h[1-4]$/.test(tag)) {
      if (current && current.content.trim()) sections.push(current);
      current = { heading: (b.textContent || "").trim().slice(0, 200), content: "" };
    } else {
      const txt = ctClean(b);
      if (!txt) continue;
      if (!current) current = { content: "" };
      current.content += (current.content ? "\n\n" : "") + txt;
    }
  }
  if (current && current.content.trim()) sections.push(current);
  const filtered = sections
    .map((s) => ({ heading: s.heading, content: s.content.trim().slice(0, 6000) }))
    .filter((s) => s.content.length > 0);
  return filtered.length ? filtered : [{ content: ctClean(root).slice(0, 6000) }];
}

function ctLinks(root: Element): SourceLink[] {
  const out: SourceLink[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    if (ctIsJunk(a)) continue;
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

function ctCode(root: Element): SourceCodeBlock[] {
  const out: SourceCodeBlock[] = [];
  for (const b of Array.from(root.querySelectorAll("pre, code, [class*='highlight'], [class*='code-block']"))) {
    const code = (b.textContent || "").replace(/\s+/g, " ").trim();
    if (code.length < 12) continue;
    const m = (b.className || "").toString().match(/language-([a-z0-9+#]+)/i);
    out.push({ language: m ? m[1].toLowerCase() : undefined, code: code.slice(0, 4000) });
    if (out.length >= 40) break;
  }
  return out;
}
