import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "GhostTab",
  version: "1.0.0",
  description:
    "Your work follows you — not the AI. A universal context layer for the web.",
  action: {
    default_popup: "src/popup/index.html",
    default_title: "GhostTab",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["sidePanel", "storage", "activeTab", "scripting", "tabs"],
  host_permissions: ["<all_urls>"],
  // The side panel calls the Kilo gateway directly, so extension pages must be
  // allowed to make that connection. (Service-worker fetch is unrestricted.)
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'unsafe-eval'; object-src 'self'; connect-src 'self' https://api.kilo.ai https://*.kilo.ai ws://localhost:* http://localhost:*;",
  },
});
