import { PanelRight, Sparkles } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";

export function App() {
  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  };

  return (
    <div className="w-[340px] min-h-[420px] bg-background text-foreground">
      <div className="border-b border-border/80 px-4 py-3.5">
        <Brand showLive />
      </div>

      <div className="flex flex-col gap-4 px-4 py-5">
        <div>
          <h1 className="text-base font-semibold tracking-tight">
            Your work follows you — not the AI.
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            GhostTab is a universal context layer for the web. Capture what
            matters, remember it locally, and continue any session elsewhere.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card/60 p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Capture → Remember → Continue
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            The full workspace lives in the side panel. Open it to start
            building your context layer.
          </p>
        </div>

        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={openSidePanel}
        >
          <PanelRight className="h-4 w-4" />
          Open Side Panel
        </Button>
      </div>

      <div className="border-t border-border/80 px-4 py-3 text-[11px] text-muted-foreground">
        Local-first · Manifest V3 · Phase 1 foundation
      </div>
    </div>
  );
}
