import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// jsdom + @testing-library for component tests; the `@/...` alias mirrors
// tsconfig `paths` so tests import app modules the same way app code does.
// Server-action / DB integration tests also run here (node-compatible APIs
// work under jsdom), so a single config covers unit and integration tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    maxWorkers: 1,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "components/**/*.test.tsx",
      "lib/**/*.test.ts",
    ],
  },
});
