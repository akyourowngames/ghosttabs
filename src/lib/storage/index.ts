// Clean, promise-based storage API for GhostTab.
// UI code should import from here and never touch IndexedDB directly.

import type { ContextItem, SourceAnalysis, Workspace, WorkspaceState } from "@/types";
import { uid } from "@/lib/utils/format";
import {
  openDB,
  wrap,
  txDone,
  STORE_WORKSPACES,
  STORE_CONTEXT,
  STORE_STATE,
  STORE_META,
} from "./db";

export { initStorage } from "./db";

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_WORKSPACES, "readonly");
  const all = await wrap(
    tx.objectStore(STORE_WORKSPACES).getAll() as IDBRequest<Workspace[]>
  );
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getWorkspace(
  id: string
): Promise<Workspace | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_WORKSPACES, "readonly");
  const ws = await wrap(
    tx.objectStore(STORE_WORKSPACES).get(id) as IDBRequest<
      Workspace | undefined
    >
  );
  return ws ?? undefined;
}

export async function createWorkspace(input: {
  name: string;
  goal?: string;
  currentFocus?: string;
}): Promise<Workspace> {
  const now = Date.now();
  const ws: Workspace = {
    id: uid("ws"),
    name: input.name,
    goal: input.goal,
    currentFocus: input.currentFocus ?? "",
    createdAt: now,
    updatedAt: now,
  };
  const db = await openDB();
  const tx = db.transaction(STORE_WORKSPACES, "readwrite");
  tx.objectStore(STORE_WORKSPACES).put(ws);
  await txDone(tx);
  return ws;
}

export async function updateWorkspace(
  id: string,
  patch: Partial<Pick<Workspace, "name" | "goal" | "currentFocus">>
): Promise<Workspace> {
  const db = await openDB();
  const tx = db.transaction(STORE_WORKSPACES, "readwrite");
  const store = tx.objectStore(STORE_WORKSPACES);
  const existing = await wrap(
    store.get(id) as IDBRequest<Workspace | undefined>
  );
  if (!existing) throw new Error(`Workspace ${id} not found`);
  const updated: Workspace = { ...existing, ...patch, updatedAt: Date.now() };
  store.put(updated);
  await txDone(tx);
  return updated;
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(
    [STORE_WORKSPACES, STORE_CONTEXT, STORE_STATE],
    "readwrite"
  );
  tx.objectStore(STORE_WORKSPACES).delete(id);
  const ctx = tx.objectStore(STORE_CONTEXT);
  const keys = await wrap(
    ctx.index("byWorkspace").getAllKeys(id) as IDBRequest<IDBValidKey[]>
  );
  for (const key of keys) ctx.delete(key);
  tx.objectStore(STORE_STATE).delete(id);
  await txDone(tx);
}

// ---------------------------------------------------------------------------
// Context items
// ---------------------------------------------------------------------------

export async function getContextItems(
  workspaceId: string
): Promise<ContextItem[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_CONTEXT, "readonly");
  const items = await wrap(
    tx
      .objectStore(STORE_CONTEXT)
      .index("byWorkspace")
      .getAll(workspaceId) as IDBRequest<ContextItem[]>
  );
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addContextItem(item: ContextItem): Promise<ContextItem> {
  const db = await openDB();
  const tx = db.transaction(STORE_CONTEXT, "readwrite");
  tx.objectStore(STORE_CONTEXT).put(item);
  await txDone(tx);
  return item;
}

export async function removeContextItem(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_CONTEXT, "readwrite");
  tx.objectStore(STORE_CONTEXT).delete(id);
  await txDone(tx);
}

// ---------------------------------------------------------------------------
// Workspace state (active tab ids)
// ---------------------------------------------------------------------------

export async function getWorkspaceState(
  workspaceId: string
): Promise<WorkspaceState | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_STATE, "readonly");
  const s = await wrap(
    tx.objectStore(STORE_STATE).get(workspaceId) as IDBRequest<
      WorkspaceState | undefined
    >
  );
  return s ?? undefined;
}

export async function setWorkspaceState(
  state: WorkspaceState
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_STATE, "readwrite");
  tx.objectStore(STORE_STATE).put(state);
  await txDone(tx);
}

// ---------------------------------------------------------------------------
// Meta (key/value, e.g. last-selected workspace)
// ---------------------------------------------------------------------------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_META, "readonly");
  const rec = await wrap(
    tx.objectStore(STORE_META).get(key) as IDBRequest<
      { key: string; value: T } | undefined
    >
  );
  return rec?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).put({ key, value });
  await txDone(tx);
}

const SELECTED_KEY = "selectedWorkspaceId";
export const getSelectedWorkspaceId = () => getMeta<string>(SELECTED_KEY);
export const setSelectedWorkspaceId = (id: string) =>
  setMeta(SELECTED_KEY, id);

// ---------------------------------------------------------------------------
// Dangerous / development utilities
// ---------------------------------------------------------------------------

/** Wipe every store. Not called automatically. */
export async function clearAll(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(
    [STORE_WORKSPACES, STORE_CONTEXT, STORE_STATE, STORE_META],
    "readwrite"
  );
  tx.objectStore(STORE_WORKSPACES).clear();
  tx.objectStore(STORE_CONTEXT).clear();
  tx.objectStore(STORE_STATE).clear();
  tx.objectStore(STORE_META).clear();
  await txDone(tx);
}

/** Clear everything and re-seed a clean demo workspace. Dev only. */
export async function resetDemoWorkspace(): Promise<void> {
  await clearAll();
  await seedStarterIfEmpty();
}

// ---------------------------------------------------------------------------
// First-run seed (clean demo workspace)
// ---------------------------------------------------------------------------

/** Minimal clean SourceAnalysis for seeded demo sources (Part 23). */
function cleanAnalysis(
  summary: string,
  relevance: number,
  extra: Partial<SourceAnalysis> = {}
): SourceAnalysis {
  return {
    summary,
    keyTopics: [],
    importantPoints: [],
    goals: [],
    decisions: [],
    questions: [],
    facts: [],
    relevance,
    sourceQuality: relevance >= 0.8 ? "high" : relevance >= 0.5 ? "medium" : "low",
    memories: [],
    ...extra,
  };
}

/** First-run seed: a clean demo workspace with NO development junk (Part 23). */
export async function seedStarterIfEmpty(): Promise<void> {
  const existing = await listWorkspaces();
  if (existing.length > 0) return;

  const ws = await createWorkspace({
    name: "AI Browser Agent",
    goal: "Build a browser context layer that lets users continue work across AI tools.",
    currentFocus:
      "Design context handoff between ChatGPT and Claude so a captured workspace can be resumed in either tool.",
  });

  const now = Date.now();
  const MIN = 60_000;
  const HR = 3_600_000;

  const chatgptSrc: ContextItem = {
    id: uid("c"),
    workspaceId: ws.id,
    type: "conversation",
    title: "Architecture discussion",
    content: "4 messages · ~320 words",
    source: { url: "https://chatgpt.com/c/abc123", platform: "ChatGPT" },
    messages: [
      { role: "user", text: "I want to build a browser extension that captures context from the pages I work on and lets me continue an AI session in another tool.", index: 0 },
      { role: "assistant", text: "Good framing. The core idea is a local workspace that stores structured memory (decisions, goals, questions) rather than raw page text. Capture should be local-first, and any AI call should send only a compact summary, not the whole page.", index: 1 },
      { role: "user", text: "Should the AI analysis run through a single provider gateway?", index: 2 },
      { role: "assistant", text: "Yes — route analysis through one gateway (Kilo) so the key stays in one place and you can swap models later. Keep memory scoring strict so implementation logs don't leak into durable memory.", index: 3 },
    ],
    fullText:
      "USER\nI want to build a browser extension that captures context from the pages I work on and lets me continue an AI session in another tool.\n\nASSISTANT\nGood framing. The core idea is a local workspace that stores structured memory (decisions, goals, questions) rather than raw page text. Capture should be local-first, and any AI call should send only a compact summary, not the whole page.\n\nUSER\nShould the AI analysis run through a single provider gateway?\n\nASSISTANT\nYes — route analysis through one gateway (Kilo) so the key stays in one place and you can swap models later. Keep memory scoring strict so implementation logs don't leak into durable memory.",
    messageCount: 4,
    createdAt: now - 50 * MIN,
    analysis: cleanAnalysis(
      "Discussion of a local-first browser agent that stores structured memory and routes AI analysis through a single gateway.",
      0.92,
      {
        keyTopics: ["local-first storage", "single AI gateway", "structured memory"],
        decisions: [
          "Route AI analysis through a single gateway (Kilo).",
          "Store workspace memory locally; send only a compact summary to the AI.",
        ],
        questions: ["How should context be handed off between ChatGPT and Claude?"],
      }
    ),
  };

  const githubSrc: ContextItem = {
    id: uid("c"),
    workspaceId: ws.id,
    type: "page",
    title: "ghosttab — GitHub",
    content:
      "GhostTab is a Chrome MV3 extension. Architecture: side panel + content scripts + service worker. Context is stored locally in IndexedDB. No backend.",
    source: { url: "https://github.com/acme/ghosttab", platform: "GitHub" },
    createdAt: now - 35 * MIN,
    analysis: cleanAnalysis(
      "GhostTab is a Chrome MV3 extension that stores captured context locally in IndexedDB with a side-panel UI.",
      0.9,
      {
        keyTopics: ["Manifest V3", "IndexedDB", "side panel"],
        decisions: [
          "Adopt Manifest V3 for the Chrome extension.",
          "Persist all workspace memory locally in IndexedDB.",
        ],
        facts: ["GhostTab uses a side panel, content scripts, and a service worker."],
      }
    ),
  };

  const chromeDocsSrc: ContextItem = {
    id: uid("c"),
    workspaceId: ws.id,
    type: "page",
    title: "Chrome MV3 Migration Guide",
    content:
      "Manifest V3 replaces background pages with service workers. Network requests must use declarativeNetRequest. The sidePanel API hosts the extension UI.",
    source: {
      url: "https://developer.chrome.com/docs/extensions/mv3",
      platform: "Docs",
    },
    createdAt: now - 20 * MIN,
    analysis: cleanAnalysis(
      "Manifest V3 uses service workers instead of background pages and introduces the sidePanel API.",
      0.82,
      {
        keyTopics: ["service workers", "sidePanel API", "declarativeNetRequest"],
        facts: [
          "In Manifest V3, background logic runs in a service worker.",
          "The sidePanel API hosts GhostTab's extension UI.",
        ],
      }
    ),
  };

  const kiloDocsSrc: ContextItem = {
    id: uid("c"),
    workspaceId: ws.id,
    type: "page",
    title: "Kilo AI Gateway",
    content:
      "Kilo exposes an OpenAI-compatible chat gateway. GhostTab sends captured context for analysis and receives structured memory candidates.",
    source: { url: "https://docs.kilo.ai/gateway", platform: "Docs" },
    createdAt: now - 12 * MIN,
    analysis: cleanAnalysis(
      "Kilo is an OpenAI-compatible gateway used by GhostTab for context analysis.",
      0.7,
      {
        keyTopics: ["OpenAI-compatible gateway", "memory analysis"],
        facts: ["Kilo exposes an OpenAI-compatible chat gateway that GhostTab uses for analysis."],
      }
    ),
  };

  const memory: ContextItem[] = [
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "goal",
      title: "Build a browser context layer",
      content: "Build a browser context layer that lets users continue work across AI tools.",
      createdAt: now - 3 * HR,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "decision",
      title: "Context belongs to the user",
      content: "Captured context and memory belong to the user, not to any single AI tool.",
      createdAt: now - 2 * HR,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "decision",
      title: "Use local-first workspace storage",
      content: "Persist all workspace memory locally; never send raw history to a provider.",
      createdAt: now - 2 * HR + MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "decision",
      title: "Use Kilo for AI understanding",
      content: "Route AI analysis through the Kilo gateway.",
      createdAt: now - 2 * HR + 2 * MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "question",
      title: "How should cross-AI context be handed off?",
      content: "How should structured context be handed off reliably between ChatGPT and Claude?",
      createdAt: now - 40 * MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "fact",
      title: "Browser pages can be captured into workspaces",
      content: "GhostTab can capture browser pages into a workspace as clean source documents.",
      createdAt: now - 30 * MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "fact",
      title: "Conversations are ordered messages",
      content: "ChatGPT and Claude conversations can be represented as ordered user/assistant messages.",
      createdAt: now - 25 * MIN,
    },
  ];

  const items: ContextItem[] = [
    ...memory,
    chatgptSrc,
    githubSrc,
    chromeDocsSrc,
    kiloDocsSrc,
  ];

  for (const it of items) await addContextItem(it);
  await setWorkspaceState({ workspaceId: ws.id, activeTabIds: [] });
}

// ---------------------------------------------------------------------------
// Memory cleanup (Part 22)
// ---------------------------------------------------------------------------

/** A deterministic blacklist for obvious junk memory (Part 22). */
const REPROCESS_BLACKLIST: RegExp[] = [
  /\bphase\s*[1-9]\b/i,
  /build succeeded/i,
  /npm run build/i,
  /typescript error/i,
  /chrome extension loaded/i,
  /account user/i,
  /good to see you/i,
  /\bchrome:\/\//i,
  /you said/i,
  /phase \d+ (complete|done)/i,
  /development status/i,
];

/**
 * Rescan existing workspace memory through the new quality rules and drop
 * obvious junk. NEVER deletes raw source documents — only durable memory
 * items whose title/content matches the blacklist (Part 22). Safe to run on
 * demand from Settings; not called automatically on startup.
 */
export async function reprocessWorkspaceMemory(
  workspaceId: string
): Promise<number> {
  const items = await getContextItems(workspaceId);
  const memory = items.filter((i) =>
    ["decision", "goal", "question", "fact"].includes(i.type)
  );
  let removed = 0;
  for (const m of memory) {
    const hay = `${m.title} ${m.content}`.toLowerCase();
    if (REPROCESS_BLACKLIST.some((re) => re.test(hay))) {
      await removeContextItem(m.id);
      removed++;
    }
  }
  return removed;
}
