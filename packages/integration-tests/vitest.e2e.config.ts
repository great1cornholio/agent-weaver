import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 300_000, // 5 minutes for real LLM generations
    hookTimeout: 60_000,
    pool: "forks",
    include: ["src/e2e/**/*.e2e.test.ts"],
    setupFiles: ["src/e2e/setup.ts"],
  },
});
