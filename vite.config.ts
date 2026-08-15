import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import fs from "node:fs";
import manifest from "./src/manifest";

/**
 * Chrome serves chrome-extension:// resources WITHOUT CORS headers. Module
 * scripts + the `crossorigin` attribute force a CORS fetch that can fail to
 * load inside the extension, leaving the panel blank. Strip it from emitted
 * HTML so same-origin extension module scripts load normally.
 */
function stripCrossOriginFromHtml() {
  let outDir = "dist";
  return {
    name: "strip-crossorigin-html",
    apply: "build" as const,
    configResolved(cfg: { build: { outDir?: string } }) {
      outDir = cfg.build.outDir || "dist";
    },
    closeBundle() {
      const root = path.resolve(process.cwd(), outDir);
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".html")) {
            const html = fs.readFileSync(full, "utf8");
            const stripped = html.replace(/\s+crossorigin/g, "");
            if (stripped !== html) fs.writeFileSync(full, stripped);
          }
        }
      };
      try {
        walk(root);
      } catch {
        /* ignore */
      }
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [react(), crx({ manifest }), stripCrossOriginFromHtml()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: { crossOrigin: false },
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
