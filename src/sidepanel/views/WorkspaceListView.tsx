import { useState } from "react";
import { Plus, Settings } from "lucide-react";
import type { ContextItem, Workspace } from "@/types";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { WorkspaceCard } from "@/components/WorkspaceCard";
import { CreateWorkspaceModal } from "@/components/CreateWorkspaceModal";

export function WorkspaceListView({
  workspaces,
  context,
  tabCounts,
  onOpen,
  onSettings,
  onCreate,
}: {
  workspaces: Workspace[];
  context: Record<string, ContextItem[]>;
  tabCounts: Record<string, number>;
  onOpen: (id: string) => void;
  onSettings: () => void;
  onCreate: (name: string, goal: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/80 px-4 py-3.5">
        <Brand />
        <IconButton onClick={onSettings} title="Settings">
          <Settings className="h-4 w-4" />
        </IconButton>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <h1 className="text-lg font-semibold tracking-tight">Workspaces</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your local context layers. Pick one to continue where you left off.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              contextCount={(context[ws.id] ?? []).length}
              decisionCount={
                (context[ws.id] ?? []).filter((i) => i.type === "decision")
                  .length
              }
              tabCount={tabCounts[ws.id] ?? 0}
              onOpen={() => onOpen(ws.id)}
            />
          ))}
        </div>
      </main>

      <footer className="border-t border-border/80 p-3">
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" />
          New workspace
        </Button>
      </footer>

      {creating && (
        <CreateWorkspaceModal
          onClose={() => setCreating(false)}
          onCreate={(name, goal) => {
            onCreate(name, goal);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
