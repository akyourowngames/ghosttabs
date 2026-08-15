import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { ContextItem } from "@/types";
import { Brand } from "@/components/Brand";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { relevanceLabel } from "@/lib/utils/relevance";
import { MEMORY_CONFIDENCE_THRESHOLD } from "@/lib/ai";
import { formatRelativeTime } from "@/lib/utils/format";

export function SourceDetailView({
  item,
  onBack,
}: {
  item: ContextItem;
  onBack: () => void;
}) {
  const [showContent, setShowContent] = useState(false);
  const analysis = item.analysis;
  const memories = analysis?.memories ?? [];
  const rel = analysis ? relevanceLabel(analysis.relevance ?? 0) : null;
  const host = item.source?.url
    ? (() => {
        try {
          return new URL(item.source.url).hostname.replace(/^www\./, "");
        } catch {
          return undefined;
        }
      })()
    : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-1 border-b border-border/80 px-3 py-3">
        <IconButton onClick={onBack} title="Back">
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <div className="flex-1">
          <Brand showLive />
        </div>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge>{item.source?.platform ?? item.type}</Badge>
            {item.type === "conversation" && (
              <span className="text-[10.5px] text-muted-foreground">
                {item.messageCount ?? 0} messages
              </span>
            )}
            {rel && (
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium ${rel.cls}`}
              >
                {rel.label.toUpperCase()}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-[15px] font-semibold leading-snug">
            {item.title || item.source?.url || "Untitled source"}
          </h2>
          {host && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">{host}</div>
          )}
          <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
            Captured {formatRelativeTime(item.createdAt)}
          </div>
        </div>

        {analysis && (
          <>
            <section>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Summary
              </div>
              <p className="text-[13px] leading-relaxed text-foreground/90">
                {analysis.summary}
              </p>
            </section>

            <section>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                What GhostTab learned
              </div>
              <div className="space-y-2">
                {memories.length > 0 ? (
                  memories.map((m, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border/80 bg-background/40 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                          {m.type}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${m.confidence >= MEMORY_CONFIDENCE_THRESHOLD ? "bg-success/10 text-success" : "bg-muted text-muted-foreground" }`}
                        >
                          {m.confidence >= MEMORY_CONFIDENCE_THRESHOLD ? "memory" : "observation"}
                        </span>
                      </div>
                      <div className="mt-1 text-[13px] font-medium text-foreground/90">
                        {m.title}
                      </div>
                      {m.content && m.content !== m.title && (
                        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                          {m.content}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    No structured memory extracted from this source.
                  </p>
                )}
              </div>
            </section>

            {item.analysisRaw && (
              <section className="mt-4">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Model response
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/40 p-3 text-[11.5px] leading-relaxed text-foreground/80">
                  {item.analysisRaw}
                </pre>
              </section>
            )}
          </>
        )}

        {item.type === "conversation" && item.messages ? (
          <ConversationThread messages={item.messages} />
        ) : (
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Source content
              </div>
              <button
                type="button"
                onClick={() => setShowContent((s) => !s)}
                className="text-[11px] text-primary hover:underline"
              >
                {showContent ? "Hide" : "Show captured page"}
              </button>
            </div>
            {showContent && (
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-background/40 p-3 text-[12px] leading-relaxed text-foreground/80">
                {item.content}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function ConversationThread({
  messages,
}: {
  messages: { role: "user" | "assistant" | "unknown"; text: string; index: number }[];
}) {
  return (
    <section className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Conversation
      </div>
      <div className="space-y-3">
        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <div
              key={m.index}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                  isUser
                    ? "bg-primary/15 text-foreground"
                    : "border border-border bg-surface/50 text-foreground/90"
                }`}
              >
                <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {isUser ? "You" : "Assistant"}
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
