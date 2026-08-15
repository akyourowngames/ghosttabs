import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 px-4 py-8 text-center">
      <Icon className="mx-auto h-6 w-6 text-muted-foreground/70" />
      <div className="mt-2 text-[13px] font-medium text-foreground">
        {title}
      </div>
      {description && (
        <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
