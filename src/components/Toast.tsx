import { useEffect } from "react";

export function Toast({
  title,
  message,
  actionLabel,
  onAction,
  onDone,
}: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-4">
      <div className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-popover/95 px-3 py-2 text-[12px] text-foreground shadow-lg backdrop-blur">
        <div className="min-w-0">
          {title && (
            <div className="truncate font-medium text-foreground">{title}</div>
          )}
          <div className="truncate text-muted-foreground">{message}</div>
        </div>
        {actionLabel && onAction && (
          <button
            onClick={() => {
              onAction();
              onDone();
            }}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-accent"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
