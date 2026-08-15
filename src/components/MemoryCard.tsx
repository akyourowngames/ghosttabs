import {
  CheckCircle2,
  HelpCircle,
  Info,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { ContextItem } from "@/types";

const META: Record<
  string,
  { icon: LucideIcon; label: string; accent: string }
> = {
  decision: {
    icon: CheckCircle2,
    label: "Decision",
    accent: "text-success",
  },
  goal: { icon: Target, label: "Goal", accent: "text-primary" },
  question: { icon: HelpCircle, label: "Question", accent: "text-warning" },
  fact: { icon: Info, label: "Fact", accent: "text-info" },
};

/** Compact, visually-distinct row for a single piece of workspace memory. */
export function MemoryCard({ item }: { item: ContextItem }) {
  const meta = META[item.type] ?? META.fact;
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/30">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.accent}`} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium leading-snug text-foreground/90">
          {item.title}
        </div>
        {item.type !== "decision" &&
          item.content &&
          item.content !== item.title && (
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
              {item.content}
            </p>
          )}
      </div>
    </div>
  );
}

/** Read-only fact line (facts are not standalone items — they live on sources). */
export function FactLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
      <div className="min-w-0 text-[12.5px] leading-snug text-foreground/85">
        {text}
      </div>
    </div>
  );
}
