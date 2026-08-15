import { useEffect, useRef, useState } from "react";
import type {
  ContextItem,
  ConversationContext,
  PageContext,
  Workspace,
  WorkspaceState,
} from "@/types";
import * as storage from "@/lib/storage";
import {
  buildConversationItem,
  buildPageItem,
  analysisTextForConversation,
} from "@/lib/context";
import {
  extractConversationContext,
  extractPageContext,
} from "@/content/extract";
import {
  analyzeContext,
  convertMemoriesToItems,
  localCurate,
  type AnalyzeContextInput,
  type ContextAnalysis,
} from "@/lib/ai";
import { generateContinuationContext } from "@/lib/ai/continue";
import { Toast } from "@/components/Toast";
import { ContinueModal } from "@/components/ContinueModal";
import { SettingsView, DEFAULT_SETTINGS, type SettingsState } from "./views/SettingsView";
import { WorkspaceListView } from "./views/WorkspaceListView";
import { WorkspaceDetailView } from "./views/WorkspaceDetailView";
import { SourceDetailView } from "./views/SourceDetailView";
import { testConnection } from "@/lib/ai/client";

type View =
  | { kind: "list" }
  | { kind: "detail"; id: string }
  | { kind: "source"; id: string }
  | { kind: "settings" };

type ToastData = {
  id: number;
  title?: string;
  message: string;
  action?: { label: string; onClick: () => void };
};

const SETTINGS_KEY = "settings";

/** Normalize a URL to a stable capture identity (drop query/hash/trailing slash). */
function normalizeUrl(u?: string): string {
  if (!u) return "";
  try {
    const url = new URL(u);
    return (url.host + url.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

const SOURCE_TYPES = new Set(["page", "conversation", "snippet"]);
const MEMORY_TYPES = new Set(["decision", "goal", "question", "fact"]);

export function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [context, setContext] = useState<Record<string, ContextItem[]>>({});
  const [states, setStates] = useState<Record<string, WorkspaceState>>({});
  const [view, setView] = useState<View>({ kind: "list" });
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastSeq = useRef(0);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [testState, setTestState] = useState<"idle" | "testing">("idle");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const lastCapture = useRef<{ wsId: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await storage.initStorage();
      await storage.seedStarterIfEmpty();

      const saved = await storage.getMeta<SettingsState>(SETTINGS_KEY);
      if (saved) setSettings(saved);

      const ws = await storage.listWorkspaces();
      const ctxMap: Record<string, ContextItem[]> = {};
      const stateMap: Record<string, WorkspaceState> = {};
      for (const w of ws) {
        ctxMap[w.id] = await storage.getContextItems(w.id);
        const s = await storage.getWorkspaceState(w.id);
        if (s) stateMap[w.id] = s;
      }
      const selected = await storage.getSelectedWorkspaceId();

      if (!mounted) return;
      setWorkspaces(ws);
      setContext(ctxMap);
      setStates(stateMap);
      setReady(true);
      if (selected && ws.some((w) => w.id === selected)) {
        setView({ kind: "detail", id: selected });
      }
    })().catch((err) => {
      console.error("[GhostTab] failed to load storage:", err);
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const notify = (
    message: string,
    opts?: { title?: string; action?: { label: string; onClick: () => void } }
  ) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, ...opts });
  };

  const refreshContext = async (wsId: string) => {
    const items = await storage.getContextItems(wsId);
    setContext((c) => ({ ...c, [wsId]: items }));
  };

  const createWorkspace = async (name: string, goal: string) => {
    const ws = await storage.createWorkspace({ name, goal: goal || undefined });
    setWorkspaces((w) => [ws, ...w]);
    setContext((c) => ({ ...c, [ws.id]: [] }));
    await storage.setSelectedWorkspaceId(ws.id);
    setView({ kind: "detail", id: ws.id });
    notify("Workspace created");
  };

  const analyzeAndStore = async (
    wsId: string,
    builtItem: ContextItem,
    source: AnalyzeContextInput["source"],
    kind: "page" | "conversation"
  ) => {
    const ws = workspaces.find((w) => w.id === wsId);
    const existing = await storage.getContextItems(wsId);

    const input: AnalyzeContextInput = {
      workspace: { name: ws?.name ?? "Workspace", goal: ws?.goal },
      source,
      existingMemory: existing.map((i) => `${i.title} ${i.content}`),
    };

    const key =
      settings.apiKey.trim() ||
      import.meta.env.VITE_KILO_API_KEY?.trim() ||
      "";

    notify(
      kind === "conversation"
        ? "Analyzing conversation…"
        : "Analyzing context…"
    );

    try {
      // 1) Try the AI service when a key is configured.
      let analysis: ContextAnalysis | null = null;
      let raw = "";
      let usedLocal = false;
      if (key) {
        try {
          const res = await analyzeContext(input, {
            apiKey: key,
            model: settings.model,
          });
          analysis = res.analysis;
          raw = res.raw;
        } catch (e) {
          raw = `AI call failed: ${e instanceof Error ? e.message : String(e)}`;
        }
      }

      // 2) Fall back to LOCAL curation when there is no key, the call failed,
      //    or the model returned nothing. This guarantees the workspace always
      //    gains some memory instead of leaving you with only a relevance tag.
      if (!analysis || analysis.memories.length === 0) {
        const local = localCurate(input);
        if (!analysis) {
          analysis = local;
          raw = "[local extraction — no API call]\n" + JSON.stringify(local, null, 2);
        } else {
          analysis = local;
          raw =
            raw +
            "\n\n[local extraction fallback — AI returned no memory]\n" +
            JSON.stringify(local, null, 2);
        }
        usedLocal = true;
      }

      if (!analysis) {
        await storage.addContextItem({ ...builtItem, analysisRaw: raw });
        notify(
          kind === "conversation"
            ? "Conversation captured — no memory extracted."
            : "Page captured — no memory extracted.",
          { title: "Captured", action: { label: "View context", onClick: () => setView({ kind: "detail", id: wsId }) } }
        );
        return;
      }

      await storage.addContextItem({ ...builtItem, analysis, analysisRaw: raw });

      const newOnes = convertMemoriesToItems(
        analysis,
        wsId,
        builtItem.source?.url,
        existing
      );
      for (const it of newOnes) await storage.addContextItem(it);

      await refreshContext(wsId);

      const label =
        kind === "conversation"
          ? `${builtItem.messageCount ?? 0} messages captured`
          : "Page captured";
      notify(analysis.summary || "Workspace updated with structured context.", {
        title: usedLocal ? "Captured (local)" : label,
        action: {
          label: "View context",
          onClick: () => setView({ kind: "detail", id: wsId }),
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Persist the failure detail so it's visible in the source detail view.
      try {
        await storage.addContextItem({
          ...builtItem,
          analysisRaw: `Error: ${message}`,
        });
      } catch {
        /* ignore storage failure */
      }
      notify(`Analysis failed: ${message.slice(0, 140)}`, {
        title: "Analysis failed",
        action: {
          label: "Retry",
          onClick: () => void addCurrentPage(wsId),
        },
      });
    }
  };

  const addCurrentPage = async (wsId: string) => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      notify("No active tab to capture");
      return;
    }

    // Step 1: deep conversation capture (ChatGPT / Claude) via a self-contained
    // injected function. This is the reliable path — crxjs does not bundle
    // module imports into executeScript's func, so extractConversationContext
    // carries all its logic inline.
    notify("Reading page…");
    let conv: ConversationContext | null = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractConversationContext,
      });
      const value = results?.[0]?.result;
      if (value && typeof value === "object") conv = value as ConversationContext;
    } catch {
      // restricted page
    }

    if (
      conv &&
      (conv.platform === "chatgpt" || conv.platform === "claude") &&
      conv.messageCount > 0
    ) {
      // Dedupe: don't capture the same conversation URL twice.
      const norm = normalizeUrl(conv.url);
      const prior = (await storage.getContextItems(wsId)).find(
        (i) => i.source?.url && normalizeUrl(i.source.url) === norm
      );
      if (prior) {
        notify("This conversation was already captured.", {
          title: "Already captured",
          action: { label: "View", onClick: () => setView({ kind: "source", id: prior.id }) },
        });
        return;
      }
      notify(`Captured ${conv.messageCount} messages…`);
      const convItem = buildConversationItem(wsId, conv);
      await storage.addContextItem(convItem);
      await refreshContext(wsId);
      lastCapture.current = { wsId };
      await analyzeAndStore(
        wsId,
        convItem,
        {
          title: conv.title || conv.url,
          url: conv.url,
          platform: conv.platform,
          content: analysisTextForConversation(conv),
          isConversation: true,
          messages: conv.messages.map((m) => ({
            role: m.role,
            text: m.text.slice(0, 2000),
          })),
        },
        "conversation"
      );
      return;
    }

    // Step 2: normal webpage capture.
    let ctx: PageContext | null = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContext,
      });
      const value = results?.[0]?.result;
      if (value && typeof value === "object") ctx = value as PageContext;
    } catch {
      // restricted page
    }

    if (!ctx) {
      notify("Open a normal website, then try again", {
        title: "Can't read this page",
      });
      return;
    }

    // Dedupe: don't capture the same page URL twice in one workspace.
    const norm = normalizeUrl(ctx.url);
    const prior = (await storage.getContextItems(wsId)).find(
      (i) => i.source?.url && normalizeUrl(i.source.url) === norm
    );
    if (prior) {
      notify("This page was already captured.", {
        title: "Already captured",
        action: { label: "View", onClick: () => setView({ kind: "source", id: prior.id }) },
      });
      return;
    }

    const pageItem = buildPageItem(wsId, ctx);
    await storage.addContextItem(pageItem);
    await refreshContext(wsId);
    lastCapture.current = { wsId };
    await analyzeAndStore(
      wsId,
      pageItem,
      {
        title: ctx.title || ctx.url,
        url: ctx.url,
        platform: pageItem.source?.platform,
        headings: ctx.headings,
        content: ctx.readableText,
        selectedText: ctx.selectedText,
      },
      "page"
    );
  };

  const deleteWorkspace = async (wsId: string) => {
    await storage.deleteWorkspace(wsId);
    setWorkspaces((w) => w.filter((x) => x.id !== wsId));
    setContext((c) => {
      const next = { ...c };
      delete next[wsId];
      return next;
    });
    setStates((s) => {
      const next = { ...s };
      delete next[wsId];
      return next;
    });
    if (
      (view.kind === "detail" || view.kind === "source") &&
      view.id === wsId
    ) {
      setView({ kind: "list" });
    }
    notify("Workspace deleted");
  };

  const openWorkspace = async (id: string) => {
    await storage.setSelectedWorkspaceId(id);
    setView({ kind: "detail", id });
  };

  const continueWorkspace = () => {
    if (memoryItems.length > 0 || sources.length > 0) {
      setShowContinue(true);
    }
  };

  const doContinue = async (platform: "chatgpt" | "claude") => {
    const name = platform === "chatgpt" ? "ChatGPT" : "Claude";
    const packet = generateContinuationContext({
      workspace: {
        name: activeWorkspace?.name ?? "Workspace",
        goal: activeWorkspace?.goal,
      },
      memories: memoryItems,
      recentSources: sources,
      recentActivity: activity,
    });

    let copied = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(packet.text);
        copied = true;
      }
    } catch {
      /* clipboard may be blocked; user can copy from the modal */
    }

    const url =
      platform === "chatgpt"
        ? "https://chat.openai.com/"
        : "https://claude.ai/";
    chrome.tabs.create({ url });
    setShowContinue(false);

    notify(
      copied
        ? `Context copied. Paste it into ${name} to continue.`
        : `Opening ${name}. If the context wasn't copied, reopen Continue and use "Copy context."`,
      { title: "Continue workspace" }
    );
  };

  const activeWorkspace =
    view.kind === "detail" || view.kind === "source"
      ? workspaces.find((w) => w.id === view.id)
      : undefined;
  const items = activeWorkspace
    ? context[activeWorkspace.id] ?? []
    : [];
  const memoryItems = items.filter((i) => MEMORY_TYPES.has(i.type));
  const sources = items.filter((i) => SOURCE_TYPES.has(i.type));
  const activity = [...items]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6)
    .map((i) => ({
      verb: verbFor(i.type),
      title: i.title || i.source?.url || "Untitled",
      at: i.createdAt,
    }));

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-sm text-muted-foreground">
          Loading GhostTab…
        </div>
      </div>
    );
  }

  const sourceItem =
    view.kind === "source"
      ? items.find((i) => i.id === view.id)
      : undefined;

  return (
    <div className="relative flex h-screen w-full flex-col bg-background text-foreground">
      {toast && (
        <Toast
          key={toast.id}
          title={toast.title}
          message={toast.message}
          actionLabel={toast.action?.label}
          onAction={toast.action?.onClick}
          onDone={() => setToast(null)}
        />
      )}

      {view.kind === "list" && (
        <WorkspaceListView
          workspaces={workspaces}
          context={context}
          tabCounts={tabCountsFrom(states)}
          onOpen={(id) => void openWorkspace(id)}
          onSettings={() => setView({ kind: "settings" })}
          onCreate={(name, goal) => void createWorkspace(name, goal)}
        />
      )}

      {view.kind === "detail" && activeWorkspace && (
        <WorkspaceDetailView
          workspace={activeWorkspace}
          memoryItems={memoryItems}
          sources={sources}
          activity={activity}
          onBack={() => setView({ kind: "list" })}
          onSettings={() => setView({ kind: "settings" })}
          onContinue={continueWorkspace}
          onCapture={() => void addCurrentPage(activeWorkspace.id)}
          onOpenSource={(id) => setView({ kind: "source", id })}
          onDelete={() => void deleteWorkspace(activeWorkspace.id)}
        />
      )}

      {view.kind === "source" && sourceItem && (
        <SourceDetailView
          item={sourceItem}
          onBack={() => setView({ kind: "detail", id: sourceItem.workspaceId })}
        />
      )}

      {view.kind === "settings" && (
        <SettingsView
          onBack={() => setView({ kind: "list" })}
          settings={settings}
          onChange={(next) => {
            setSettings((s) => {
              const merged = { ...s, ...next };
              void storage.setMeta(SETTINGS_KEY, merged);
              return merged;
            });
          }}
          testState={testState}
          testResult={testResult}
          onTestConnection={async () => {
            setTestState("testing");
            setTestResult(null);
            const res = await testConnection(
              settings.apiKey.trim(),
              settings.model.trim() || "tencent/hy3:free"
            );
            setTestResult(res);
            setTestState("idle");
          }}
          onResetDemo={async () => {
            if (
              confirm(
                "Reset the demo workspace? This clears all local GhostTab data."
              )
            ) {
              await storage.resetDemoWorkspace();
              const ws = await storage.listWorkspaces();
              const ctxMap: Record<string, ContextItem[]> = {};
              for (const w of ws)
                ctxMap[w.id] = await storage.getContextItems(w.id);
              setWorkspaces(ws);
              setContext(ctxMap);
              setView({ kind: "list" });
              notify("Demo workspace reset");
            }
          }}
        />
      )}

      {showContinue && activeWorkspace && (
        <ContinueModal
          workspaceName={activeWorkspace.name}
          memories={memoryItems}
          sources={sources}
          activity={activity}
          onClose={() => setShowContinue(false)}
          onContinue={(platform) => void doContinue(platform)}
        />
      )}
    </div>
  );
}

function verbFor(type: string): string {
  switch (type) {
    case "page":
      return "Captured";
    case "conversation":
      return "Saved conversation";
    case "snippet":
      return "Saved snippet";
    case "decision":
      return "Learned decision";
    case "goal":
      return "Added goal";
    case "question":
      return "Captured question";
    default:
      return "Added";
  }
}

function tabCountsFrom(
  states: Record<string, WorkspaceState>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, state] of Object.entries(states)) {
    out[id] = state.activeTabIds.length;
  }
  return out;
}
