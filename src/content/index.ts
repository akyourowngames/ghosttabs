// GhostTab content script.
// - Lightweight presence marker.
// - Responds to page-context extraction requests from the side panel.

import { extractPageContext } from "./extract";

(() => {
  // Avoid double-injection when the script is re-run.
  if (document.documentElement.dataset.ghosttab === "active") return;
  document.documentElement.dataset.ghosttab = "active";

  (window as unknown as { ghosttab?: unknown }).ghosttab = {
    ready: true,
    version: "1.0.0",
  };
})();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GHOSTTAB_EXTRACT_PAGE") {
    try {
      const context = extractPageContext();
      sendResponse({ ok: true, context });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true; // response is sent synchronously above
  }
  return false;
});
