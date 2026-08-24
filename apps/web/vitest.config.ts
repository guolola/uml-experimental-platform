import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    maxWorkers: 4,
    minWorkers: 1,
    testTimeout: 10_000,
  },
});
