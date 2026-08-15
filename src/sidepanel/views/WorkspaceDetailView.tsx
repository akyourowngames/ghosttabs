import { useState } from "react";
import {
  ChevronLeft,
  Circle,
  Layers,
  Settings,
  Trash2,
} from "lucide-react";
import type { ContextItem, Workspace } from "@/types";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { MemoryCard, FactLine } from "@/components/MemoryCard";
import { SourceCard } from "@/components/SourceCard";
import { ContinueButtons } from "@/components/ContinueButtons";
import { EmptyState } from "@/components/EmptyState";

const MEMORY_ORDER: { type: ContextItem["type"]; label: string; glyph: string }[] = [
  { type: "decision", label: "Decisions", glyph: "✓" },
  { type: "goal", label: "Goals", glyph: "◎" },
  { type: "question", label: "Questions", glyph: "?" },
  { type: "fact", label: "Facts", glyph: "ⓘ" },
];

export function WorkspaceDetailView({
  workspace,
  memoryItems,
  sources,
  activity,
  onBack,
  onSettings,
  onContinue,
  onCapture,
  onOpenSource,
  onDelete,
}: {
  workspace: Workspace;
  memoryItems: ContextItem[];
  sources: ContextItem[];
  activity: { verb: string; title: string; at: number }[];
  onBack: () => void;
  onSettings: () => void;
  onContinue: () => void;
  onCapture: () => void;
  onOpenSource: (id: string) => void;
  onDelete: () => void;
}) {
  const [openType, setOpenType] = useState<ContextItem["type"] | null>(null);

  const byType = (t: ContextItem["type"]) =>
    memoryItems.filter((i) => i.type === t);
  const canContinue = memoryItems.length > 0 || sources.length > 0;
  const highRelevance = sources.filter(
    (s) => (s.analysis?.relevance ?? 0) >= 0.5
  );
  const lowRelevance = sources.filter(
    (s) => (s.analysis?.relevance ?? 0) < 0.5
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header (PART C #26) */}
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <IconButton onClick={onBack} title="Back">
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <div className="flex-1 leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">
              GhostTab
            </span>
            <span className="rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-success">
              Active
            </span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {workspace.name}
          </div>
        </div>
        <IconButton onClick={onSettings} title="Settings">
          <Settings className="h-4 w-4" />
        </IconButton>
        <IconButton
          onClick={() => {
            if (confirm("Delete this workspace? This cannot be undone."))
              onDelete();
          }}
          title="Delete workspace"
          className="text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </header>

      <main className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Workspace overview (PART C #27) */}
        <section>
          <div className="text-[15px] font-semibold tracking-tight">
            {workspace.name}
          </div>
          {workspace.goal && (
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
              {workspace.goal}
            </p>
          )}
        </section>

        {/* Memory (PART C #28) — compact counts, expand on click */}
        <section>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Memory
          </div>
          {memoryItems.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Nothing learned yet. Capture a page to start.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {MEMORY_ORDER.map(({ type, label, glyph }) => {
                const items = byType(type);
                if (!items.length) return null;
                const isOpen = openType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOpenType(isOpen ? null : type)}
                    className="flex items-center gap-1.5 text-[12.5px] text-foreground/85 hover:text-foreground"
                  >
                    <span className="text-muted-foreground">{glyph}</span>
                    <span className="font-medium">{items.length}</span>
                    <span className="text-muted-foreground">{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {openType && (
            <div className="mt-2 space-y-0.5 rounded-lg border border-border bg-surface/40 p-1.5">
              {byType(openType).map((m) =>
                m.type === "fact" ? (
                  <FactLine key={m.id} text={m.content} />
                ) : (
                  <MemoryCard key={m.id} item={m} />
                )
              )}
            </div>
          )}
        </section>

        {/* Sources (PART C #29) */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sources
            </span>
            <Button
              variant="ghost"
              size="sm"
              title="Capture the current page"
              onClick={onCapture}
              className="h-7 px-2 text-[11px]"
            >
              <Layers className="h-3.5 w-3.5" />
              Capture page
            </Button>
          </div>

          {highRelevance.length === 0 && lowRelevance.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No pages captured yet"
              description="Capture the page you're working on to start building context."
            />
          ) : (
            <div className="space-y-0.5">
              {highRelevance.map((s) => (
                <SourceCard key={s.id} item={s} onOpen={onOpenSource} />
              ))}

              {lowRelevance.length > 0 && (
                <div className="pt-1">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Low relevance
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {lowRelevance.map((s) => (
                      <SourceCard key={s.id} item={s} onOpen={onOpenSource} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Recent activity (PART C #25) */}
        {activity.length > 0 && (
          <section>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recent
            </div>
            <div className="space-y-0.5">
              {activity.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px]"
                >
                  <Circle className="h-1.5 w-1.5 shrink-0 fill-current text-primary/60" />
                  <span className="min-w-0 flex-1 truncate text-foreground/80">
                    <span className="text-muted-foreground">{a.verb} </span>
                    {a.title}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground/70">
                    {formatRelativeTimeCompact(a.at)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Sticky footer (PART C #31-32) */}
      <ContinueButtons
        onOpen={onContinue}
        disabled={!canContinue}
        hint="Capture a few pages first to build context."
      />
    </div>
  );
}

function formatRelativeTimeCompact(at: number): string {
  const diff = Date.now() - at;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
