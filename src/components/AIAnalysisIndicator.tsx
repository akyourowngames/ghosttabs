import { Info } from "lucide-react";

/** Transparent note that captured page content may leave the device for AI. */
export function AIAnalysisIndicator() {
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        AI analysis. Captured page content may be sent to your configured AI
        provider (Kilo). Raw workspace storage stays local in this browser.
      </span>
    </p>
  );
}
