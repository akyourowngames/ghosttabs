import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@/styles/globals.css";

/** Render a fatal error to the screen even before/without React. */
function showFatal(message: string, stack?: string) {
  const root = document.getElementById("root");
  const box = document.createElement("pre");
  box.style.cssText =
    "position:fixed;inset:0;margin:0;padding:16px;overflow:auto;background:#0b0b0f;color:#f87171;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;z-index:2147483647;";
  box.textContent = `GhostTab failed to start:\n\n${message}\n\n${stack ?? ""}`;
  if (root) root.appendChild(box);
  else document.body.appendChild(box);
}

window.addEventListener("error", (e) => {
  showFatal(e.message || String(e.error), (e.error as Error)?.stack);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as Error;
  showFatal(r?.message || String(r), r?.stack);
});

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (err) {
  showFatal((err as Error).message, (err as Error).stack);
}
