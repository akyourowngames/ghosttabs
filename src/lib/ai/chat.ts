import type { ContextItem, MemoryType, Workspace } from "@/types";
import { KiloClient, FALLBACK_MODEL, type ChatMessage } from "./client";
import * as storage from "@/lib/storage";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MEMORY_TYPES = new Set(["decision", "goal", "question", "fact"]);
const SOURCE_TYPES = new Set(["page", "conversation", "snippet"]);

/**
 * Assemble a compact, readable snapshot of the workspace that the chat assistant
 * can reason over: goal, decisions, goals, open questions, facts, and the most
 * relevant captured sources. Never includes full page/conversation text.
 */
export function buildWorkspaceContext(
  workspace: Workspace,
  items: ContextItem[]
): string {
  const byRecency = (a: ContextItem, b: ContextItem) =>
    b.createdAt - a.createdAt;
  const memories = items
    .filter((i) => MEMORY_TYPES.has(i.type))
    .sort(byRecency);
  const sources = items.filter((i) => SOURCE_TYPES.has(i.type));

  const decisions = memories.filter((i) => i.type === "decision");
  const goals = memories.filter((i) => i.type === "goal");
  const questions = memories.filter((i) => i.type === "question");
  const facts = memories.filter((i) => i.type === "fact");
  const topSources = [...sources]
    .sort((a, b) => (b.analysis?.relevance ?? 0) - (a.analysis?.relevance ?? 0))
    .slice(0, 6);

  const L: string[] = [];
  L.push(`WORKSPACE: ${workspace.name}`);
  if (workspace.goal) L.push(`GOAL: ${workspace.goal}`);

  const block = (label: string, arr: ContextItem[]) => {
    if (!arr.length) return;
    L.push(`${label}:`);
    arr.slice(0, 14).forEach((it) => {
      const detail =
        it.content && it.content !== it.title ? ` — ${it.content}` : "";
      L.push(`- ${it.title}${detail}`);
    });
    L.push("");
  };

  block("DECISIONS", decisions);
  block("GOALS", goals);
  block("OPEN QUESTIONS", questions);
  block("FACTS", facts);

  if (topSources.length) {
    L.push("CAPTURED SOURCES:");
    for (const s of topSources) {
      const oneLine = (s.analysis?.summary || s.title || "")
        .split("\n")[0]
        .slice(0, 140);
      const plat = s.source?.platform ? `[${s.source.platform}] ` : "";
      L.push(`- ${plat}${s.title} — ${oneLine}`);
    }
    L.push("");
  }

  return L.join("\n");
}

const CHAT_SYSTEM = `You are GhostTab's workspace assistant. You have full knowledge of the user's workspace: its goal, decisions, goals, open questions, facts, and captured sources (provided below). Answer using ONLY that context — never invent details. Be concise and direct. If something isn't in the context, say so honestly. The user may ask you to REMEMBER new information or FORGET existing memory; when they do, acknowledge what you recorded or removed and keep your answer short.`;

/**
 * Chat with the workspace assistant. Uses the Kilo gateway. Falls back to a
 * deterministic keyword answer when no API key is configured.
 */
export async function chatInWorkspace(opts: {
  contextText: string;
  history: ChatTurn[];
  userMessage: string;
  apiKey: string;
  model: string;
}): Promise<string> {
  const { contextText, history, userMessage, apiKey, model } = opts;

  if (!apiKey.trim()) {
    return localAnswer(contextText, userMessage);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${CHAT_SYSTEM}\n\n--- WORKSPACE CONTEXT ---\n${contextText}`,
    },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];

  const call = async (m: string) => {
    const client = new KiloClient({ apiKey, model: m });
    return (await client.chat(messages, { temperature: 0.6 })).trim();
  };

  try {
    return (await call(model)) || "(no response)";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      model !== FALLBACK_MODEL &&
      /PAID_MODEL_AUTH_REQUIRED|sign in to use this model/i.test(msg)
    ) {
      return (await call(FALLBACK_MODEL)) || "(no response)";
    }
    throw e;
  }
}

/** Minimal offline answer when no Kilo key is configured. */
function localAnswer(context: string, question: string): string {
  const q = question.toLowerCase();
  const lines = context.split("\n");
  const match = () =>
    lines
      .filter((l) => l.startsWith("- ") && l.toLowerCase().includes(q))
      .map((l) => l.slice(2))
      .slice(0, 5);

  if (/decision|decided|chose/.test(q)) {
    const d = match();
    return d.length
      ? `From workspace memory:\n- ${d.join("\n- ")}`
      : "No decisions found in this workspace yet.";
  }
  if (/question|open|unresolved/.test(q)) {
    const d = match();
    return d.length
      ? `Open questions:\n- ${d.join("\n- ")}`
      : "No open questions recorded.";
  }
  if (/fact|remember|know/.test(q)) {
    const d = match();
    return d.length
      ? `Known facts:\n- ${d.join("\n- ")}`
      : "No facts recorded for this workspace.";
  }
  if (/goal|objective|building|purpose/.test(q)) {
    const g = lines.find((l) => l.startsWith("GOAL:"));
    return g ? g.slice(6).trim() : "No goal set for this workspace.";
  }
  return "I can answer questions about this workspace's goal, decisions, questions, and facts. Add a Kilo API key in Settings for full AI chat, or type 'remember <fact>' / 'forget <topic>' to edit memory.";
}

// ---------------------------------------------------------------------------
// Remember / Forget via chat
// ---------------------------------------------------------------------------

export type MemoryCommand =
  | { kind: "remember"; type: MemoryType; text: string }
  | { kind: "forget"; query: string }
  | null;

/** Parse a remember/forget intent from a user message. */
export function parseMemoryCommand(input: string): MemoryCommand {
  const t = input.trim();
  const lower = t.toLowerCase();

  const forget = lower.match(/^(forget|remove|delete)\b[ :]*(.+)$/s);
  if (forget && forget[2].trim().length > 2) {
    return { kind: "forget", query: forget[2].trim() };
  }

  const remember = lower.match(
    /^(remember|note|add|save)\b[ :]*(decision|goal|question|fact)?[ :]*(.+)$/s
  );
  if (remember && remember[3].trim().length > 2) {
    const type = (remember[2] as MemoryType) || "fact";
    return { kind: "remember", type, text: remember[3].trim() };
  }

  return null;
}

/** Apply a remember/forget command against the workspace memory. */
export async function applyMemoryCommand(
  workspaceId: string,
  cmd: Exclude<MemoryCommand, null>
): Promise<{ ok: boolean; message: string }> {
  if (cmd.kind === "remember") {
    await storage.addContextItem({
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workspaceId,
      type: cmd.type,
      title: cmd.text.slice(0, 140),
      content: cmd.text,
      createdAt: Date.now(),
    } as ContextItem);
    return { ok: true, message: `Remembered a new ${cmd.type}: "${cmd.text}"` };
  }

  // forget
  const items = await storage.getContextItems(workspaceId);
  const q = cmd.query.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  const tokens = q.split(/\s+/).filter(Boolean);
  let removed = 0;
  for (const it of items) {
    if (!MEMORY_TYPES.has(it.type)) continue;
    const hay = `${it.title} ${it.content}`.toLowerCase();
    if (tokens.every((tok) => hay.includes(tok))) {
      await storage.removeContextItem(it.id);
      removed += 1;
    }
  }
  return {
    ok: true,
    message:
      removed > 0
        ? `Forgot ${removed} memory item(s) matching "${cmd.query}".`
        : `Nothing matched "${cmd.query}" — no memory removed.`,
  };
}

// ---------------------------------------------------------------------------
// Chat history persistence (per workspace, local-first)
// ---------------------------------------------------------------------------

const chatKey = (wsId: string) => `chat:${wsId}`;

export async function loadChat(wsId: string): Promise<ChatTurn[]> {
  const saved = await storage.getMeta<ChatTurn[]>(chatKey(wsId));
  return Array.isArray(saved) ? saved : [];
}

export async function saveChat(
  wsId: string,
  turns: ChatTurn[]
): Promise<void> {
  await storage.setMeta(chatKey(wsId), turns);
}
