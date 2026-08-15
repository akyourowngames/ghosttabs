import { MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ContinueButtons({
  onOpen,
  disabled,
  hint,
}: {
  onOpen: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3.5 backdrop-blur">
      <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
        Continue your work
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => onOpen()}
          className="gap-1.5"
        >
          <MessageSquare size={15} />
          ChatGPT
        </Button>
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => onOpen()}
          className="gap-1.5"
        >
          <Sparkles size={15} />
          Claude
        </Button>
      </div>
      {disabled && hint && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
