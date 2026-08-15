import type { PageContext } from "@/types";

/**
 * Collect structured, useful context from the current page without
 * dumping the entire DOM. Must stay fully self-contained (no references
 * to module-scope values) so it can be injected on demand via
 * chrome.scripting.executeScript.
 */
export function extractPageContext(): PageContext {
  const READABLE_MAX = 4000;
  const HEADING_MAX = 12;

  const title = (document.title || "").trim();
  const url = location.href;

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

  return { title, url, headings, readableText, selectedText };
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
export async function extractConversationContext(): Promise<{
  platform: "chatgpt" | "claude" | "generic";
  title: string;
  url: string;
  messages: { role: "user" | "assistant" | "unknown"; text: string; index: number }[];
  fullText: string;
  messageCount: number;
  selectedText?: string;
}> {
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
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
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
        const text = cleanText(a);
        if (text.length < 2) continue;
        out.push({ role: roleOf(a), text });
      }
    }
    if (out.length === 0) {
      for (const n of Array.from(document.querySelectorAll("[data-message-author-role]"))) {
        const text = cleanText(n);
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
      const text = cleanText(t);
      if (text.length < 2) continue;
      out.push({ role: roleOf(t), text });
    }
    if (out.length > 0) return out;
    for (const b of Array.from(
      document.querySelectorAll(
        ".font-user-message, .font-claude-message, [data-testid='user-message'], [data-testid='assistant-message']"
      )
    )) {
      const text = cleanText(b);
      if (text.length < 2) continue;
      out.push({ role: roleOf(b), text });
    }
    if (out.length > 0) return out;
    const main = document.querySelector("main");
    if (main) {
      for (const a of Array.from(main.querySelectorAll("article"))) {
        const text = cleanText(a);
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
    return { platform: "chatgpt", title, url, messages, fullText, messageCount: messages.length };
  }

  if (platform === "claude") {
    const messages = inferRolesIfNeeded(await walk(collectClaudeTurns));
    let title = (document.title || "").trim();
    if (!title || /claude/i.test(title)) {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) title = firstUser.text.slice(0, 90);
    }
    const fullText = messages.map((m) => `${m.role.toUpperCase()}\n${m.text}`).join("\n\n");
    return { platform: "claude", title, url, messages, fullText, messageCount: messages.length };
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
    title: (document.title || "").trim(),
    url,
    messages: [],
    fullText: readable,
    messageCount: 0,
    selectedText,
  };
}
