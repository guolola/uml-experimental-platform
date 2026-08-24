import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    // Portal- and preview-heavy jsdom suites share browser-like globals; run files serially in CI.
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
