import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A titled section whose body can collapse. Used for MEMORY categories so the
 * workspace stays uncluttered until the user expands a category.
 */
export function CollapsibleSection({
  icon: Icon,
  title,
  count,
  defaultCollapsed = false,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  count?: number;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <span>{title}</span>
          {typeof count === "number" && (
            <span className="rounded-full bg-muted/50 px-1.5 text-[10px] font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </div>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
