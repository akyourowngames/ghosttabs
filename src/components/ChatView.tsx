import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Trash2, CornerDownLeft } from "lucide-react";
import type { ContextItem, Workspace } from "@/types";
import type { SettingsState } from "@/sidepanel/views/SettingsView";
import { Button } from "@/components/ui/Button";
import { Brand } from "@/components/Brand";
import {
  buildWorkspaceContext,
  chatInWorkspace,
  loadChat,
  saveChat,
  parseMemoryCommand,
  applyMemoryCommand,
  type ChatTurn,
} from "@/lib/ai/chat";

const SUGGESTIONS = [
  "Summarize this workspace",
  "What decisions have we made?",
  "What are the open questions?",
  "What facts do we know?",
];

export function ChatView({
  workspace,
  items,
  settings,
  onMemoryChanged,
  onBack,
}: {
  workspace: Workspace;
  items: ContextItem[];
  settings: SettingsState;
  onMemoryChanged: () => void;
  onBack: () => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsId = workspace.id;

  // Load persisted chat history for this workspace.
  useEffect(() => {
    let mounted = true;
    loadChat(wsId).then((t) => {
      if (mounted) setTurns(t);
    });
    return () => {
      mounted = false;
    };
  }, [wsId]);

  // Scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;

    const cmd = parseMemoryCommand(text);
    let sysNote = "";
    if (cmd) {
      try {
        const res = await applyMemoryCommand(wsId, cmd);
        sysNote = `(System: ${res.message})`;
        onMemoryChanged();
      } catch {
        sysNote = "(System: failed to update memory)";
      }
    }

    const userTurn: ChatTurn = { role: "user", content: text };
    const next = [...turns, userTurn];
    setTurns(next);
    setInput("");
    setBusy(true);

    const contextText = buildWorkspaceContext(workspace, items);
    // Feed the system note into the model so it can acknowledge the edit.
    const effectiveUser = sysNote ? `${text}\n${sysNote}` : text;

    try {
      const reply = await chatInWorkspace({
        contextText,
        history: next,
        userMessage: effectiveUser,
        apiKey: settings.apiKey.trim(),
        model: settings.model.trim() || "tencent/hy3:free",
      });
      const assistantTurn: ChatTurn = { role: "assistant", content: reply };
      const updated = [...next, assistantTurn];
      setTurns(updated);
      await saveChat(wsId, updated);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : String(e);
      const failedTurn: ChatTurn = {
        role: "assistant",
        content: `Chat failed: ${message.slice(0, 160)}`,
      };
      const updated = [...next, failedTurn];
      setTurns(updated);
      await saveChat(wsId, updated);
    } finally {
      setBusy(false);
    }
  };

  const clearChat = async () => {
    setTurns([]);
    await saveChat(wsId, []);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border/80 px-3 py-2.5">
        <button
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Back to Workspace"
        >
          <CornerDownLeft className="h-4 w-4" />
        </button>
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{workspace.name}</div>
          <div className="truncate text-[10.5px] text-muted-foreground">
            GhostTab chat · pulls all workspace memory
          </div>
        </div>
        <button
          onClick={clearChat}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Clear chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
      >
        {turns.length === 0 && (
          <div className="mt-6 px-2 text-center">
            <Brand />
            <p className="mt-3 text-[13px] text-muted-foreground">
              Ask anything about <span className="text-foreground/90">{workspace.name}</span>.
              The assistant reads your goals, decisions, questions, facts, and
              captured sources.
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              Tip: type{" "}
              <span className="rounded bg-muted px-1 text-foreground/80">
                remember we prefer X
              </span>{" "}
              or{" "}
              <span className="rounded bg-muted px-1 text-foreground/80">
                forget X
              </span>{" "}
              to edit memory.
            </p>
          </div>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                t.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-elevated text-foreground border border-border/70"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border/70 bg-surface-elevated px-3 py-2 text-[13px] text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void send(s)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border/80 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Ask about the workspace, or remember / forget…"
            className="max-h-32 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
          <Button
            size="icon"
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            title="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
