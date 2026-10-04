import { defineConfig } from "vite";

/**
 * The Trilium server answers with `Cross-Origin-Resource-Policy: same-origin` and no CORS headers,
 * so a page on another origin cannot read its API at all — not even with `mode: "no-cors"`. Proxying
 * `/api` makes every request same-origin from the browser's point of view.
 *
 * This is a development stand-in for what the shipped app does: the native shells route API calls
 * through native code (as upstream's iOS WKURLSchemeHandler does), so the constraint never reaches
 * the WebView. A browser-hosted deployment must likewise be served from the server's own origin.
 */
const TRILIUM_TARGET = process.env.TRILIUM_TARGET ?? "http://127.0.0.1:18740";

export default defineConfig({
  server: {
    port: 5273,
    strictPort: true,
    // A real http origin is required: the OPFS SAH-Pool VFS throws on `file://`, and
    // `navigator.storage.getDirectory()` is undefined there.
    host: "127.0.0.1",
    proxy: {
      "/api": { target: TRILIUM_TARGET, changeOrigin: false, secure: false }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022"
  },
  // sqlite-wasm ships a .wasm next to its JS and resolves it relative to the module URL; letting
  // Vite pre-bundle the package leaves that URL unresolvable.
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"]
  },
  worker: {
    format: "es"
  }
});
