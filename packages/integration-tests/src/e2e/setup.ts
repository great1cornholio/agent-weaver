import { beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

beforeAll(async () => {
  // Check if LLM base URL is provided
  if (!process.env.E2E_LLM_BASE_URL) {
    throw new Error(
      "E2E_LLM_BASE_URL environment variable is required to run real E2E tests. " +
        "It should point to an OpenAI-compatible /v1 endpoint (e.g., http://localhost:8080/v1)",
    );
  }

  // Check if tmux is installed
  try {
    await execFileAsync("tmux", ["-V"]);
  } catch (error) {
    throw new Error("tmux is required to run E2E tests. Please install tmux.");
  }

  // Check if git is installed
  try {
    await execFileAsync("git", ["--version"]);
  } catch (error) {
    throw new Error("git is required to run E2E tests. Please install git.");
  }

  // Check if CLI is built (index.js)
  const cliPath = resolve(__dirname, "../../../cli/dist/index.js");
  if (!existsSync(cliPath)) {
    throw new Error(
      `CLI executable not found at ${cliPath}. Please build the project before running E2E tests: pnpm build`,
    );
  }
});
