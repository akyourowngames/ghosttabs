import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

export function CreateWorkspaceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, goal: string) => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, goal.trim());
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl border border-border bg-popover p-4 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">New Workspace</h2>
          <IconButton onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Name
        </label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. AI Browser Agent"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        />

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Goal (optional)
        </label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="What are you working toward?"
          rows={2}
          className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        />

        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
