import type { ContextItem } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { InsightCard } from "@/components/InsightCard";
import { relevanceLabel } from "@/lib/utils/relevance";
import { formatRelativeTime } from "@/lib/utils/format";

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Compact source row (PART C #29). Low-relevance sources collapse by default.
 * Conversation sources show message count + word count, never the full text.
 */
export function SourceCard({
  item,
  onOpen,
}: {
  item: ContextItem;
  onOpen: (id: string) => void;
}) {
  const analysis = item.analysis;
  const rel = analysis ? relevanceLabel(analysis.relevance ?? 0) : null;
  const lowRelevance = rel ? (analysis!.relevance ?? 0) < 0.5 : false;
  const host = hostOf(item.source?.url);
  const platform = item.source?.platform;
  const title = item.title || item.source?.url || "Untitled source";

  const meta =
    item.type === "conversation"
      ? `${item.messageCount ?? 0} messages`
      : host ?? platform ?? "WEB";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(item.id)}
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-accent/40"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <Badge>{platform ?? item.type}</Badge>
          {rel && (
            <span
              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium ${rel.cls}`}
            >
              {rel.label.split(" ")[0]}
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[13px] font-medium text-foreground/90">
          {title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground/80">
          <span className="truncate">{meta}</span>
          <span>·</span>
          <span className="shrink-0">{formatRelativeTime(item.createdAt)}</span>
        </div>
      </div>

      {!lowRelevance && analysis && (
        <div className="hidden w-44 shrink-0 sm:block">
          <InsightCard analysis={analysis} />
        </div>
      )}
    </div>
  );
}
