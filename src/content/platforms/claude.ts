// Claude (claude.ai) conversation extractor (PART A).
// Best-effort, multi-strategy. Mirrors the ChatGPT extractor's scroll-and-collect.

import type {
  ConversationContext,
  ConversationExtractor,
  ConversationMessage,
  ConversationRole,
} from "@/types";
import {
  SAFEGUARDS,
  cleanText,
  delay,
  detectPlatformName,
  normalizeKey,
} from "./generic";

function roleOf(turn: Element): ConversationRole {
  const cls = (turn.className || "").toLowerCase();
  if (cls.includes("user-message") || cls.includes("font-user")) return "user";
  if (cls.includes("claude-message") || cls.includes("font-claude") || cls.includes("assistant"))
    return "assistant";

  const attr =
    turn.getAttribute("data-testid") ||
    turn.querySelector("[data-testid]")?.getAttribute("data-testid") ||
    "";
  if (/user/i.test(attr)) return "user";
  if (/assistant|claude/i.test(attr)) return "assistant";

  const html = turn.innerHTML.toLowerCase();
  if (html.includes('you said') || html.includes('font-user-message')) return "user";
  const label = Array.from(
    turn.querySelectorAll("[aria-label], [data-testid*='author']")
  )
    .map((n) => (n.getAttribute("aria-label") || n.getAttribute("data-testid") || "").toLowerCase())
    .join(" ");
  if (/claude/.test(label)) return "assistant";
  if (/\byou\b/.test(label)) return "user";
  return "unknown";
}

function collectTurns(): { role: ConversationRole; text: string }[] {
  const out: { role: ConversationRole; text: string }[] = [];

  // Strategy 1: Claude's conversation-turn containers.
  const turns = Array.from(
    document.querySelectorAll("[data-testid='conversation-turn']")
  );
  for (const t of turns) {
    const text = cleanText(t);
    if (text.length < 2) continue;
    out.push({ role: roleOf(t), text });
  }
  if (out.length > 0) return out;

  // Strategy 2: message bubbles by class.
  const bubbles = Array.from(
    document.querySelectorAll(
      ".font-user-message, .font-claude-message, [data-testid='user-message'], [data-testid='assistant-message']"
    )
  );
  for (const b of bubbles) {
    const text = cleanText(b);
    if (text.length < 2) continue;
    out.push({ role: roleOf(b), text });
  }
  if (out.length > 0) return out;

  // Strategy 3: main articles.
  const main = document.querySelector("main");
  if (main) {
    for (const a of Array.from(main.querySelectorAll("article"))) {
      const text = cleanText(a);
      if (text.length < 2) continue;
      out.push({ role: roleOf(a), text });
    }
  }
  return out;
}

export async function extractClaude(): Promise<ConversationContext> {
  const url = location.href;
  const scrollEl =
    (document.querySelector("main") as HTMLElement | null) ??
    (document.scrollingElement as HTMLElement | null) ??
    document.body;
  const savedTop = scrollEl.scrollTop;

  const seen = new Map<string, ConversationMessage>();
  let order = 0;
  let noNewStreak = 0;

  scrollEl.scrollTop = 0;
  await delay(SAFEGUARDS.scrollDelayMs * 2);

  for (let attempt = 0; attempt < SAFEGUARDS.maxScrollAttempts; attempt++) {
    const turns = collectTurns();
    let added = 0;
    for (const t of turns) {
      const key = normalizeKey(t.role, t.text);
      if (!key || seen.has(key)) continue;
      seen.set(key, { role: t.role, text: t.text, index: order++ });
      added++;
    }

    if (added === 0) {
      noNewStreak += 1;
      if (noNewStreak >= SAFEGUARDS.noNewThreshold) break;
    } else {
      noNewStreak = 0;
    }

    if (seen.size >= SAFEGUARDS.maxMessages) break;
    let total = 0;
    for (const m of seen.values()) total += m.text.length;
    if (total >= SAFEGUARDS.maxChars) break;

    scrollEl.scrollTop += Math.max(400, scrollEl.clientHeight * 0.8);
    await delay(SAFEGUARDS.scrollDelayMs);
  }

  scrollEl.scrollTop = savedTop;

  const messages = [...seen.values()].sort((a, b) => a.index - b.index);

  let title = (document.title || "").trim();
  if (!title || /claude/i.test(title)) {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) title = firstUser.text.slice(0, 90);
  }

  const fullText = messages
    .map((m) => `${m.role.toUpperCase()}\n${m.text}`)
    .join("\n\n");

  return {
    platform: "claude",
    title,
    url,
    messages,
    fullText,
    messageCount: messages.length,
  };
}

export function claudeExtractor(): ConversationExtractor {
  return {
    canHandle: (u: string) => detectPlatformName(u) === "claude",
    extract: extractClaude,
  };
}
