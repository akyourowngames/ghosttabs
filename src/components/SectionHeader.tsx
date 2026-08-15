import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </div>
      {action}
    </div>
  );
}
