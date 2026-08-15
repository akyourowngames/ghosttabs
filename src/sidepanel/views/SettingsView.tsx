import type { ReactNode } from "react";
import {
  ChevronLeft,
  KeyRound,
  Palette,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { IconButton } from "@/components/ui/IconButton";
import { Switch } from "@/components/ui/Switch";
import { Card } from "@/components/ui/Card";
import { AIAnalysisIndicator } from "@/components/AIAnalysisIndicator";

export interface SettingsState {
  autoCapture: boolean;
  clipboardFallback: boolean;
  apiKey: string;
  /** Kilo model id, e.g. anthropic/claude-sonnet-4.5 */
  model: string;
}

export const DEFAULT_SETTINGS: SettingsState = {
  autoCapture: true,
  clipboardFallback: true,
  apiKey: "",
  model: "anthropic/claude-sonnet-4.5",
};

/** A titled, self-contained settings card with divided rows. */
function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </Card>
  );
}

function Row({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        {description && (
          <div className="mt-0.5 break-words text-[11.5px] leading-snug text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsView({
  onBack,
  settings,
  onChange,
  onResetDemo,
}: {
  onBack: () => void;
  settings: SettingsState;
  onChange: (next: Partial<SettingsState>) => void;
  onResetDemo: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-1 border-b border-border/80 px-3 py-3">
        <IconButton onClick={onBack} title="Back">
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <span className="text-sm font-semibold">Settings</span>
      </header>

      <main className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        <div className="flex items-center gap-2.5 px-1">
          <Brand />
          <span className="text-[11px] text-muted-foreground">v1.0.0</span>
        </div>

        <SettingsSection icon={KeyRound} title="Kilo AI Gateway">
          <div className="px-4 py-3">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              API key
            </label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/50 focus:border-primary"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Stored locally in this browser and sent to the Kilo AI Gateway
              when you capture a page.
            </p>
            <div className="mt-3">
              <AIAnalysisIndicator />
            </div>
          </div>
          <div className="px-4 py-3">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Model
            </label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => onChange({ model: e.target.value })}
              placeholder="anthropic/claude-sonnet-4.5"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/50 focus:border-primary"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              OpenAI-compatible model id used through the Kilo gateway.
            </p>
          </div>
        </SettingsSection>

        <SettingsSection icon={Sparkles} title="Capture">
          <Row
            title="Auto-capture page context"
            description="Silently index the active tab when added."
            control={
              <Switch
                checked={settings.autoCapture}
                onChange={(v) => onChange({ autoCapture: v })}
                label="Auto-capture page context"
              />
            }
          />
          <Row
            title="Clipboard fallback"
            description="Copy continuation prompts when injection fails."
            control={
              <Switch
                checked={settings.clipboardFallback}
                onChange={(v) => onChange({ clipboardFallback: v })}
                label="Clipboard fallback"
              />
            }
          />
        </SettingsSection>

        <SettingsSection icon={Palette} title="Appearance">
          <Row
            title="Theme"
            description="Obsidian dark — the only theme for the MVP."
            control={
              <span className="text-[12px] text-muted-foreground">Dark</span>
            }
          />
        </SettingsSection>

        <SettingsSection icon={Sparkles} title="Development">
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={onResetDemo}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent/40"
            >
              Reset demo workspace
            </button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Clears all local data and re-seeds a clean example workspace.
            </p>
          </div>
        </SettingsSection>
      </main>
    </div>
  );
}
