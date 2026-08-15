// ChatGPT conversation extractor (PART A).
// Best-effort, multi-strategy. DOM is unstable across releases, so we use
// several structural signals and always fall back gracefully.

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
  const attr =
    turn.getAttribute("data-message-author-role") ||
    turn.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
  if (attr === "user" || attr === "assistant") return attr;

  // Structural / text signals.
  const html = turn.innerHTML.toLowerCase();
  if (html.includes("you said")) return "user";
  const heading = turn.querySelector("h1, h2, h3, h4, h5, h6");
  if (heading && /you/i.test(heading.textContent || "")) return "user";
  // User turns often carry a "You" label; assistant turns carry "ChatGPT".
  const label = Array.from(turn.querySelectorAll("[class*='label'], [data-testid*='author'], [aria-label]"))
    .map((n) => (n.getAttribute("aria-label") || n.textContent || "").toLowerCase())
    .join(" ");
  if (/\bchatgpt\b|\bgpt-4\b|\bo4\b/.test(label)) return "assistant";
  if (/\byou\b/.test(label)) return "user";
  return "unknown";
}

/** Collect all currently-rendered ChatGPT turns from `main`. */
function collectTurns(): { role: ConversationRole; text: string }[] {
  const out: { role: ConversationRole; text: string }[] = [];
  const main = document.querySelector("main");
  const roots = main ? [main] : [document];

  for (const root of roots) {
    const articles = Array.from(root.querySelectorAll("article"));
    for (const a of articles) {
      const text = cleanText(a);
      if (text.length < 2) continue;
      out.push({ role: roleOf(a), text });
    }
  }

  // Fallback: group by role markers if no <article> found.
  if (out.length === 0) {
    const nodes = Array.from(
      document.querySelectorAll("[data-message-author-role]")
    );
    for (const n of nodes) {
      const text = cleanText(n);
      if (text.length < 2) continue;
      const r = n.getAttribute("data-message-author-role");
      out.push({ role: r === "user" || r === "assistant" ? r : "unknown", text });
    }
  }
  return out;
}

export async function extractChatGPT(): Promise<ConversationContext> {
  const url = location.href;
  const scrollEl =
    (document.querySelector("main") as HTMLElement | null) ??
    (document.scrollingElement as HTMLElement | null) ??
    document.body;
  const savedTop = scrollEl.scrollTop;

  const seen = new Map<string, ConversationMessage>();
  let order = 0;
  let noNewStreak = 0;

  // Start at the top so the oldest messages load first (chronological order).
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

  // Restore the user's position (PART A #40).
  scrollEl.scrollTop = savedTop;

  const messages = [...seen.values()].sort((a, b) => a.index - b.index);

  let title = (document.title || "").trim();
  if (!title || /chatgpt/i.test(title)) {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) title = firstUser.text.slice(0, 90);
  }

  const fullText = messages
    .map((m) => `${m.role.toUpperCase()}\n${m.text}`)
    .join("\n\n");

  return {
    platform: "chatgpt",
    title,
    url,
    messages,
    fullText,
    messageCount: messages.length,
  };
}

export function chatgptExtractor(): ConversationExtractor {
  return {
    canHandle: (u: string) => detectPlatformName(u) === "chatgpt",
    extract: extractChatGPT,
  };
}
