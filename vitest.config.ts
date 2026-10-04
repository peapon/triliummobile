import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `reference/` holds shallow clones of upstream Trilium and TriliumDroid used for reading
    // source. Their own test suites must never be collected here.
    include: ["src/**/*.spec.ts", "tools/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "reference/**", "dist/**"],
    environment: "node"
  }
});
