import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors and shows them on-screen instead of failing
 * silently to a blank panel. (Module-load / pre-mount errors are handled by
 * the global listeners installed in main.tsx.)
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[GhostTab] render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-full overflow-auto bg-background p-5 text-foreground">
          <div className="mb-2 text-sm font-semibold text-danger">
            GhostTab hit a runtime error
          </div>
          <pre className="whitespace-pre-wrap rounded-lg border border-danger/30 bg-danger/5 p-3 text-[12px] leading-relaxed text-danger/90">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
