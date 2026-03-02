import { describe, test, beforeAll, afterAll, expect } from "vitest";
import { Sandbox } from "../utils/sandbox.js";
import { CLIRunner } from "../utils/cli-runner.js";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getProjectBaseDir } from "@composio/ao-core";

const execFileAsync = promisify(execFile);

describe("E2E: Write Code via Agent", () => {
  let sandbox: Sandbox;
  let cli: CLIRunner;

  beforeAll(async () => {
    sandbox = new Sandbox({ id: "write-code-test" });
    await sandbox.init();
    cli = new CLIRunner();
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  test("agent should create a new function and commit it", async () => {
    // 1. Spawning CLI process in background
    console.log("Starting AO CLI...");
    const args = ["spawn", "test-project"];

    const { stdout, stderr, code } = await cli.runCommand(args, sandbox.dir, {
      OPENAI_API_BASE: process.env.E2E_LLM_BASE_URL!,
      OPENAI_API_KEY: "mock",
      AIDER_MODEL: process.env.E2E_LLM_MODEL || "openai/qwen3-coder-next",
      HOME: sandbox.dir,
    });

    console.log("CLI finished execution.");
    console.log("STDOUT:", stdout);
    console.log("STDERR:", stderr);

    expect(code).toBe(0);

    const originalHome = process.env.HOME;
    process.env.HOME = sandbox.dir;

    const repoDir = join(sandbox.dir, "repo");
    const baseDir = getProjectBaseDir(sandbox.configPath, repoDir);
    const sessionsDir = join(baseDir, "sessions");

    console.log("Expected sessionsDir:", sessionsDir);
    process.env.HOME = originalHome;

    expect(existsSync(sessionsDir)).toBe(true);

    // Parse the session ID mapped by the output, or simply look into dataDir
    const sessionIdMatch = stdout.match(/SESSION=([a-zA-Z0-9_\-]+)/);
    const sessionIdStr = sessionIdMatch ? sessionIdMatch[1] : null;
    expect(sessionIdStr).toBeDefined();

    const sessionId = sessionIdStr!;

    // 2. Send the instruction securely
    console.log(`Sending task to session ${sessionId}...`);
    const { stdout: sendStdout, code: sendCode } = await cli.runCommand(
      [
        "send",
        sessionId,
        "--no-wait",
        "Create a file named math.ts and export an add function that takes two numbers and returns their sum. In your final response, write DONE.",
      ],
      sandbox.dir,
      {
        OPENAI_API_BASE: process.env.E2E_LLM_BASE_URL!,
        OPENAI_API_KEY: "mock",
        AIDER_MODEL: process.env.E2E_LLM_MODEL || "openai/qwen3-coder-next",
        HOME: sandbox.dir,
      },
    );
    console.log("SEND STDOUT:", sendStdout);
    expect(sendCode).toBe(0);

    // Wait for session to be completed
    let isCompleted = false;
    let finalState: any = null;

    for (let i = 0; i < 30; i++) {
      // 30 seconds max
      if (existsSync(sessionsDir)) {
        const files = readdirSync(sessionsDir);
        const sessFile = files.find((f) => f === sessionId);
        if (sessFile) {
          const fileContent = await readFile(join(sessionsDir, sessFile), "utf-8");
          const state: Record<string, string> = {};
          for (const line of fileContent.split("\n")) {
            const matchStr = line.match(/^([^=]+)=(.*)$/);
            if (matchStr) {
              state[matchStr[1]] = matchStr[2];
            }
          }
          const worktreePath = join(sandbox.dir, "worktrees", "test-project", sessionId);
          const { stdout: logOut } = await execFileAsync("git", ["log", "--oneline"], {
            cwd: worktreePath,
          }).catch(() => ({ stdout: "" }));
          if (logOut.split("\n").filter(Boolean).length > 1) {
            isCompleted = true;
            finalState = state;
            break;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(isCompleted).toBe(true);
    expect(finalState).toBeDefined();

    const worktreePath = join(sandbox.dir, "worktrees", "test-project", sessionId);

    // 2. Validate the side-effects in the workspace directory
    const createdFilePath = join(worktreePath, "math.ts");
    expect(existsSync(createdFilePath)).toBe(true);

    const fileContent = await readFile(createdFilePath, "utf-8");
    expect(fileContent).toContain("export function add(");

    // 3. Validate git commit side-effects
    const { stdout: gitLogEnd } = await execFileAsync("git", ["log", "--oneline"], {
      cwd: worktreePath,
    });

    expect(gitLogEnd.length).toBeGreaterThan(0);
    expect(gitLogEnd.split("\n").filter(Boolean).length).toBeGreaterThan(1);
  }, 200_000);
});
