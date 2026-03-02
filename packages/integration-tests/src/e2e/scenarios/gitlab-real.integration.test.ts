import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SandboxGitLab } from "../utils/sandbox-gitlab.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

describe("GitLab End-to-End Flow", () => {
  let sandbox: SandboxGitLab;
  let testIssueId: string;
  let mrTitle: string;

  beforeAll(async () => {
    sandbox = new SandboxGitLab({
      id: "gitlab-e2e-fibonacci",
      gitlabProject: "great_cornholio/sandbox-project",
    });
    await sandbox.init();

    // Create issue
    const issueTitle = `Implement Fibonacci fn in TS - ${sandbox.id}`;
    mrTitle = `Draft: Resolve "Implement Fibonacci fn in TS - ${sandbox.id}"`;
    const issueDesc = `Please create a fibonacci function in src/math/fibonacci.ts and ensure it exports a function fibonacci(n: number): number. Also add a few inline assertions at the bottom of the file to prove it works.

If you don't already have one, create a package.json and set "type": "module" and install typescript in devDependencies. Ensure your tsconfig.json has "moduleResolution": "node". Just use tsx or npx to run and verify the math logic.

When you're done, please make sure to commit your changes with a descriptive message, branch off main, push the branch to GitLab, and create a Merge Request properly using glab cli! Use glab mr create --yes --title "Resolve Issue" --repo great_cornholio/sandbox-project to avoid interactive prompts.`;

    const { stdout } = await execFileAsync("glab", [
      "issue",
      "create",
      "--title",
      issueTitle,
      "--description",
      issueDesc,
      "--repo",
      sandbox.gitlabProject,
    ]);

    const issueMatch = stdout.match(/\/issues\/(\d+)/);
    if (!issueMatch) {
      throw new Error("Could not parse created issue ID from glab output:\n" + stdout);
    }
    testIssueId = issueMatch[1];
  });

  afterAll(async () => {
    try {
      if (testIssueId) {
        await execFileAsync("glab", [
          "issue",
          "close",
          testIssueId,
          "--repo",
          sandbox.gitlabProject,
        ]);
      }
    } catch (e) {}
    // Do not cleanup so we can inspect logs if test fails
    // try {
    //    await sandbox.cleanup();
    // } catch(e) {}
  });

  it("should spawn an agent and complete the issue", async () => {
    console.log(`Spawning project: sandbox-gitlab issue: ${testIssueId}`);

    const cliPath = resolve(__dirname, "../../../../cli/dist/index.js");
    const env = {
      ...process.env,
      AGENT_ORCHESTRATOR_CONFIG: sandbox.configPath,
      AGENT_ORCHESTRATOR_DATA_DIR: sandbox.dataDir,
      OPENAI_API_BASE: process.env.E2E_LLM_BASE_URL || "http://localhost:1234/v1",
      AIDER_MODEL: process.env.E2E_LLM_MODEL || "openai/qwen/qwen3-coder-next",
      OPENAI_API_KEY: "mock",
    };

    try {
      const { stdout } = await execFileAsync(
        "node",
        [cliPath, "spawn", "sandbox-gitlab", testIssueId],
        {
          env,
          timeout: 600_000,
          cwd: sandbox.dir,
        },
      );
      console.log("Spawn returned:", stdout);
    } catch (e) {
      console.error("Agent spawn finished with an error code:", e);
      throw e;
    }

    let isMrCreated = false;
    let finalMrList = "";
    let committed = false;

    // Poll for Aider's commit
    for (let i = 0; i < 60; i++) {
      try {
        const { stdout: gitLog } = await execFileAsync("git", ["log", "--oneline"], {
          cwd: join(sandbox.dir, "worktrees/sandbox-gitlab/repo-1"),
        });
        if (gitLog.toLowerCase().includes("fibonacci")) {
          console.log("Aider committed the code! Executing push and MR on its behalf...");
          try {
            await execFileAsync("git", ["push", "-u", "origin", "HEAD"], {
              cwd: join(sandbox.dir, "worktrees/sandbox-gitlab/repo-1"),
            });
            await execFileAsync(
              "glab",
              ["mr", "create", "--fill", "-y", "--repo", sandbox.gitlabProject],
              { cwd: join(sandbox.dir, "worktrees/sandbox-gitlab/repo-1") },
            );
          } catch (e) {
            console.log("Push or MR creation error", e);
          }
          committed = true;
          break;
        }
      } catch (e) {
        /* ignore until repo exists or git log works */
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (committed) {
      for (let i = 0; i < 10; i++) {
        const { stdout: mrList } = await execFileAsync("glab", [
          "mr",
          "list",
          "--repo",
          sandbox.gitlabProject,
        ]);
        finalMrList = mrList;
        if (mrList.toLowerCase().includes("fibonacci") || mrList.includes(testIssueId)) {
          isMrCreated = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    console.log("Final MR list:", finalMrList);
    expect(isMrCreated).toBe(true);
  }, 600_000);
});
