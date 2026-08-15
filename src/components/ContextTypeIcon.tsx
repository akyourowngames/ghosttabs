import {
  CheckCircle2,
  Code2,
  FileText,
  HelpCircle,
  Info,
  MessageSquare,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { ContextType } from "@/types";
import { cn } from "@/lib/utils/cn";

const MAP: Record<
  ContextType,
  { icon: LucideIcon; label: string; className: string }
> = {
  conversation: {
    icon: MessageSquare,
    label: "Conversation",
    className: "text-primary bg-primary/10",
  },
  decision: {
    icon: CheckCircle2,
    label: "Decision",
    className: "text-success bg-success/10",
  },
  page: {
    icon: FileText,
    label: "Page",
    className: "text-muted-foreground bg-muted/40",
  },
  snippet: {
    icon: Code2,
    label: "Snippet",
    className: "text-info bg-info/10",
  },
  goal: {
    icon: Target,
    label: "Goal",
    className: "text-primary bg-primary/10",
  },
  question: {
    icon: HelpCircle,
    label: "Question",
    className: "text-warning bg-warning/10",
  },
  fact: {
    icon: Info,
    label: "Fact",
    className: "text-info bg-info/10",
  },
};

export function contextTypeLabel(type: ContextType): string {
  return MAP[type].label;
}

export function ContextTypeIcon({
  type,
  className,
}: {
  type: ContextType;
  className?: string;
}) {
  const { icon: Icon, label, className: tone } = MAP[type];
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md",
        tone,
        className
      )}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}
