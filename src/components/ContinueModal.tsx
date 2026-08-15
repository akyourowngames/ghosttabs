import { useState } from "react";
import { X, Copy, Check as CheckIcon } from "lucide-react";
import type { ContextItem } from "@/types";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { generateContinuationContext } from "@/lib/ai/continue";

export function ContinueModal({
  workspaceName,
  memories,
  sources,
  activity,
  onClose,
  onContinue,
}: {
  workspaceName: string;
  memories: ContextItem[];
  sources: ContextItem[];
  activity: { title: string; at: number }[];
  onClose: () => void;
  onContinue: (platform: "chatgpt" | "claude") => void;
}) {
  const [showContext, setShowContext] = useState(false);
  const [copied, setCopied] = useState(false);

  const packet = generateContinuationContext({
    workspace: { name: workspaceName },
    memories,
    recentSources: sources,
    recentActivity: activity,
  });

  const copyContext = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(packet.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* ignore */
    }
  };

  const enough = packet.decisionCount + packet.goalCount + packet.questionCount + packet.sourceCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-[15px] font-semibold">Continue Workspace</div>
            <div className="text-[11px] text-muted-foreground">{workspaceName}</div>
          </div>
          <IconButton onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4">
          {enough ? (
            <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-[12.5px] text-success">
              <div className="font-medium">GhostTab will bring:</div>
              <ul className="mt-1.5 grid grid-cols-2 gap-y-1">
                <Check line={`${packet.decisionCount} decision${packet.decisionCount === 1 ? "" : "s"}`} />
                <Check line={`${packet.goalCount} goal${packet.goalCount === 1 ? "" : "s"}`} />
                <Check line={`${packet.questionCount} open question${packet.questionCount === 1 ? "" : "s"}`} />
                <Check line={`${packet.factCount} fact${packet.factCount === 1 ? "" : "s"}`} />
                <Check line={`${packet.sourceCount} relevant source${packet.sourceCount === 1 ? "" : "s"}`} />
                <span className="col-span-2 text-[11px] text-success/70">
                  Estimated context ~{packet.estimatedTokens.toLocaleString()} tokens
                </span>
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-[12.5px] text-warning">
              Not enough context yet. Capture a few pages or build some workspace memory
              first.
            </div>
          )}

          {showContext && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Context packet
                </span>
                <button
                  type="button"
                  onClick={copyContext}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {copied ? <CheckIcon size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy context"}
                </button>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/40 p-3 text-[11px] leading-relaxed text-foreground/80">
                {packet.text}
              </pre>
            </div>
          )}
        </main>

        <footer className="space-y-2 border-t border-border px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="primary"
              disabled={!enough}
              onClick={() => onContinue("chatgpt")}
            >
              Continue with ChatGPT
            </Button>
            <Button
              variant="primary"
              disabled={!enough}
              onClick={() => onContinue("claude")}
            >
              Continue with Claude
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setShowContext((s) => !s)}
            className="w-full rounded-lg border border-border py-2 text-[12px] font-medium text-foreground/80 hover:bg-accent"
          >
            {showContext ? "Hide context" : "View context"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Check({ line }: { line: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <CheckIcon className="h-3.5 w-3.5 text-success" />
      <span>{line}</span>
    </li>
  );
}
