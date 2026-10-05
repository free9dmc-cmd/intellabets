import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * Unit tests are for pure logic (odds maths, validation) — no React, no DOM —
 * so the default Node environment is all we need.
 *
 * The alias mirrors `paths` in tsconfig.json so tests can import "@/lib/..."
 * exactly the way application code does. Vitest uses Vite's resolver, which
 * does not read tsconfig paths on its own.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
})
