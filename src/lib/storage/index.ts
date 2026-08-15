// Clean, promise-based storage API for GhostTab.
// UI code should import from here and never touch IndexedDB directly.

import type { ContextItem, Workspace, WorkspaceState } from "@/types";
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
}): Promise<Workspace> {
  const now = Date.now();
  const ws: Workspace = {
    id: uid("ws"),
    name: input.name,
    goal: input.goal,
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
  patch: Partial<Pick<Workspace, "name" | "goal">>
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

export async function seedStarterIfEmpty(): Promise<void> {
  const existing = await listWorkspaces();
  if (existing.length > 0) return;

  // Clean demo workspace (PART D #34) — no development history.
  const ws = await createWorkspace({
    name: "AI Browser Agent",
    goal: "Build a browser agent that can continue work across AI tools without losing context.",
  });

  const now = Date.now();
  const MIN = 60_000;
  const HR = 3_600_000;

  const chatgptSrc: ContextItem = {
    id: uid("c"),
    workspaceId: ws.id,
    type: "conversation",
    title: "Architecture discussion",
    content: "24 messages · ~3.1k words",
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
    analysis: {
      summary:
        "Discussion of a local-first browser agent that stores structured memory and routes AI analysis through a single gateway.",
      relevance: 0.92,
      memories: [
        { type: "decision", title: "Use a single AI gateway (Kilo)", content: "Route AI analysis through one provider gateway so the key stays in one place and models can be swapped later.", confidence: 0.9 },
        { type: "decision", title: "Keep memory local-first", content: "All workspace memory is stored locally; only a compact summary is sent to the AI provider.", confidence: 0.92 },
        { type: "fact", title: "Capture stores structured memory, not raw page text", content: "The workspace stores structured memory (decisions, goals, questions) rather than dumping raw page content.", confidence: 0.85 },
        { type: "question", title: "How should context transfer between ChatGPT and Claude?", content: "Open question: how should structured context be transferred reliably between AI tools like ChatGPT and Claude?", confidence: 0.8 },
      ],
    },
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
    analysis: {
      summary:
        "GhostTab is a Chrome MV3 extension that stores captured context locally in IndexedDB with a side-panel UI.",
      relevance: 0.9,
      memories: [
        { type: "decision", title: "Use Manifest V3", content: "GhostTab adopts Manifest V3 for the Chrome extension.", confidence: 0.95 },
        { type: "decision", title: "Store memory in IndexedDB", content: "All workspace memory is persisted locally in IndexedDB.", confidence: 0.95 },
        { type: "fact", title: "Side panel + content scripts + service worker", content: "GhostTab uses a side panel, content scripts, and a service worker for its architecture.", confidence: 0.85 },
      ],
    },
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
    analysis: {
      summary:
        "Manifest V3 uses service workers instead of background pages and introduces the sidePanel API.",
      relevance: 0.82,
      memories: [
        { type: "fact", title: "MV3 background logic runs in a service worker", content: "In Manifest V3, background logic runs in a service worker.", confidence: 0.85 },
        { type: "fact", title: "sidePanel API hosts GhostTab's UI", content: "The sidePanel API hosts GhostTab's extension UI.", confidence: 0.85 },
      ],
    },
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
    analysis: {
      summary:
        "Kilo is an OpenAI-compatible gateway used by GhostTab for context analysis.",
      relevance: 0.7,
      memories: [
        { type: "fact", title: "Kilo is OpenAI-compatible", content: "Kilo exposes an OpenAI-compatible chat gateway that GhostTab uses for analysis.", confidence: 0.8 },
      ],
    },
  };

  const memory: ContextItem[] = [
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "goal",
      title: "Build a universal browser context layer",
      content: "Build a universal browser context layer so AI tools share memory instead of starting from scratch.",
      createdAt: now - 3 * HR,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "decision",
      title: "Use Chrome MV3",
      content: "Adopt Manifest V3 for the Chrome extension.",
      createdAt: now - 2 * HR,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "decision",
      title: "Keep workspace memory local-first",
      content: "Persist all workspace memory locally; never send raw history to a provider.",
      createdAt: now - 2 * HR + MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "decision",
      title: "Use Kilo for AI analysis",
      content: "Route AI analysis through the Kilo gateway.",
      createdAt: now - 2 * HR + 2 * MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "question",
      title: "How should context transfer between AI tools reliably?",
      content: "How should structured context be transferred between ChatGPT and Claude reliably?",
      createdAt: now - 40 * MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "fact",
      title: "ChatGPT and Claude conversations can be captured",
      content: "GhostTab can capture full ChatGPT and Claude conversations locally.",
      createdAt: now - 30 * MIN,
    },
    {
      id: uid("c"),
      workspaceId: ws.id,
      type: "fact",
      title: "Workspace context is stored locally",
      content: "All captured context and memory lives in this browser's local storage.",
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
