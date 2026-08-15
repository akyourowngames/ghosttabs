import { ChevronRight } from "lucide-react";
import type { Workspace } from "@/types";
import { formatRelativeTime } from "@/lib/utils/format";

export function WorkspaceCard({
  workspace,
  contextCount,
  decisionCount,
  tabCount,
  onOpen,
}: {
  workspace: Workspace;
  contextCount: number;
  decisionCount: number;
  tabCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group w-full rounded-xl border border-border bg-card/50 p-4 text-left transition-all hover:border-primary/40 hover:bg-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">
            {workspace.name}
          </div>
          {workspace.goal && (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">
              {workspace.goal}
            </p>
          )}
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          <b className="text-foreground">{contextCount}</b> context
        </span>
        <span>
          <b className="text-foreground">{decisionCount}</b> decisions
        </span>
        <span>
          <b className="text-foreground">{tabCount}</b> tabs
        </span>
        <span className="ml-auto">
          {formatRelativeTime(workspace.updatedAt)}
        </span>
      </div>
    </button>
  );
}
