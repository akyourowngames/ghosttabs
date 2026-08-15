// GhostTab background service worker (Manifest V3).
// Phase 1: establish side-panel behavior + a small message router.
// AI / storage logic is intentionally not implemented yet.

chrome.runtime.onInstalled.addListener(() => {
  // Keep the toolbar icon as the popup; the side panel is opened on demand.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((err) => console.error("[GhostTab] sidePanel behavior:", err));

  console.info("[GhostTab] background service worker installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GHOSTTAB_OPEN_SIDE_PANEL") {
    const windowId =
      (message as { windowId?: number }).windowId ??
      (_sender.tab?.windowId as number | undefined);

    if (windowId !== undefined) {
      chrome.sidePanel
        .open({ windowId })
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true; // keep the message channel open for async response
    }
    sendResponse({ ok: false, error: "No windowId available" });
  }

  return false;
});
