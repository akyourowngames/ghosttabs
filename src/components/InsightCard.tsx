import type { ContextAnalysis, MemoryCandidate } from "@/types";
import { relevanceLabel } from "@/lib/utils/relevance";
import { Sparkles } from "lucide-react";

const TYPE_LABEL: Record<MemoryCandidate["type"], string> = {
  decision: "Decision",
  goal: "Goal",
  question: "Question",
  fact: "Fact",
};

const TYPE_ICON: Record<MemoryCandidate["type"], string> = {
  decision: "✓",
  goal: "◎",
  question: "?",
  fact: "i",
};

function groupByType(memories: MemoryCandidate[]) {
  return (["decision", "goal", "question", "fact"] as const).map((type) => ({
    type,
    items: memories.filter((m) => m.type === type).slice(0, 3),
  })).filter((g) => g.items.length);
}

export function InsightCard({ analysis }: { analysis: ContextAnalysis }) {
  const groups = groupByType(analysis.memories ?? []);

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.06] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary/90">
          <Sparkles size={12} />
          <span>AI Insight</span>
        </div>
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {relevanceLabel(analysis.relevance ?? 0).label}
        </span>
      </div>

      {analysis.summary && (
        <p className="mt-1.5 text-[12px] leading-snug text-foreground/75">
          {analysis.summary}
        </p>
      )}

      {groups.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {groups.map((g) => (
            <div key={g.type}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {TYPE_LABEL[g.type]}
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {g.items.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[12px] leading-snug text-foreground/85"
                  >
                    <span className="mt-px text-primary/70">{TYPE_ICON[g.type]}</span>
                    <span>
                      {m.title}
                      {m.confidence < 0.75 && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          · observation
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
