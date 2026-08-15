import { CheckCircle2 } from "lucide-react";
import type { ContextItem } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { contextTypeLabel, ContextTypeIcon } from
  "@/components/ContextTypeIcon";
import { formatRelativeTime } from "@/lib/utils/format";
import { InsightCard } from "@/components/InsightCard";

export function ContextItemCard({ item }: { item: ContextItem }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-background/40 p-3 transition-colors hover:border-border/80 hover:bg-accent/30">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{item.title}</span>
          <Badge>{contextTypeLabel(item.type)}</Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {item.content}
        </p>
        {item.source?.platform && (
          <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-muted-foreground/80">
            <span className="rounded bg-muted/50 px-1.5 py-0.5">
              {item.source.platform}
            </span>
            {item.source.url && (
              <span className="truncate">{item.source.url}</span>
            )}
          </div>
        )}
        {item.analysis && <InsightCard analysis={item.analysis} />}
      </div>
    </div>
  );
}

export function DecisionCard({ item }: { item: ContextItem }) {
  return (
    <div className="flex gap-3 rounded-lg border border-success/20 bg-success/5 p-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{item.title}</div>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {item.content}
        </p>
        {item.source?.platform && (
          <div className="mt-1.5">
            <Badge>{item.source.platform}</Badge>
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityRow({ item }: { item: ContextItem }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/30 px-3 py-2">
      <ContextTypeIcon type={item.type} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{item.title}</div>
        <div className="text-[10.5px] text-muted-foreground">
          {contextTypeLabel(item.type)}
          {item.source?.platform ? ` · ${item.source.platform}` : ""}
        </div>
      </div>
      <span className="text-[10.5px] text-muted-foreground">
        {formatRelativeTime(item.createdAt)}
      </span>
    </div>
  );
}
