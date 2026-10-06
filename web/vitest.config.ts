import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Minimal vitest setup for the money-path unit tests (pure functions only — no
 * DOM, no network, no DB). Isolated from the Next build: `next build` never runs
 * vitest, and vitest never imports the Next app.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
