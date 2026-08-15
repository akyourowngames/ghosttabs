import { cn } from "@/lib/utils/cn";

/**
 * GhostTab wordmark + glyph used across popup, side panel and headers.
 */
export function Brand({
  className,
  showLive = false,
}: {
  className?: string;
  showLive?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/90 to-primary/40 shadow-[0_0_18px_-2px_hsl(var(--primary)/0.55)]">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 12l9 4 9-4" />
          <path d="M3 17l9 4 9-4" />
        </svg>
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Ghost<span className="text-primary">Tab</span>
      </span>
      {showLive && (
        <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
          Live
        </span>
      )}
    </div>
  );
}
