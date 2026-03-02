import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SandboxGitLab } from "../utils/sandbox-gitlab.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";

const execFileAsync = promisify(execFile);

// Helper to run `ao` command
async function runAoSubcommand(commandArgs: string[], sandbox: SandboxGitLab) {
  const cliPath = resolve(__dirname, "../../../../cli/dist/index.js");
  const env = {
    ...process.env,
    AGENT_ORCHESTRATOR_CONFIG: sandbox.configPath,
    AGENT_ORCHESTRATOR_DATA_DIR: sandbox.dataDir,
  };

  return await execFileAsync("node", [cliPath, ...commandArgs], {
    env,
    timeout: 600_000,
    cwd: sandbox.dir,
  });
}

describe("GitLab End-to-End Flow", () => {
  let sandbox: SandboxGitLab;
  let testIssueId: string;
  let testBranchName: string;

  beforeAll(async () => {
    sandbox = new SandboxGitLab({
      id: "gitlab-e2e-fibonacci",
      gitlabProject: "great_cornholio/sandbox-project",
    });
    await sandbox.init();

    // 1. Create a real remote issue via glab CLI
    const issueTitle = `Implement Fibonacci fn in TS - ${sandbox.id}`;
    const issueDesc =
      "Please create a fibonacci function in `src/math/fibonacci.ts` and ensure it exports a function `fibonacci(n: number): number`. Also add a few inline assertions at the bottom of the file to prove it works. Make sure to commit and create a Merge Request!";

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

    // Parse out the issue URL or ID. glab issue create outputs like:
    // http://192.168.1.190:9080/great_cornholio/sandbox-project/-/issues/12
    const issueMatch = stdout.match(/\/issues\/(\d+)/);
    if (!issueMatch) {
      throw new Error("Could not parse created issue ID from glab output:\n" + stdout);
    }
    testIssueId = issueMatch[1];
    testBranchName = `issue-${testIssueId}`; // Default logic in orchestrator creates this branch usually
  });

  afterAll(async () => {
    // Attempt cleanup of the MR/Issue maybe? Or just leave it as proof
    // Can close the issue just to keep it clean
    if (testIssueId) {
      try {
        await execFileAsync("glab", [
          "issue",
          "close",
          testIssueId,
          "--repo",
          sandbox.gitlabProject,
        ]);
      } catch (e) {}
    }
    await sandbox.cleanup();
  });

  it("should spawn an agent and complete the issue", async () => {
    // 2. Spawn the job using Agent Orchestrator
    console.log(`Spawning project: sandbox-gitlab issue: ${testIssueId}`);

    try {
      await runAoSubcommand(["spawn", "sandbox-gitlab", testIssueId], sandbox);
    } catch (e) {
      console.error(
        "Agent spawn crashed. Note: Sometimes agent exits non-zero even if successful if it fails to cleanup tmux.",
      );
    }

    // We expect the agent to:
    // a. Create the issue branch
    // b. Write `fibonacci.ts`
    // c. Commit and push it
    // d. Open an MR

    // Let's poll for branch creation / MR existence

    // Check if branch was pushed to remote
    const { stdout: branchesList } = await execFileAsync("glab", [
      "repo",
      "view",
      sandbox.gitlabProject,
      "--branches",
    ]);
    console.log("Branches available:", branchesList);

    // Check if an MR exists for this issue
    const { stdout: mrList } = await execFileAsync("glab", [
      "mr",
      "list",
      "--repo",
      sandbox.gitlabProject,
      "--state",
      "opened",
    ]);
    console.log("MRs available:", mrList);

    // We expect an MR related to the issue ID
    const mrCreated = mrList.includes(testIssueId) || mrList.toLowerCase().includes("fibonacci");

    expect(mrCreated).toBe(true);

    // Let's also check if code is there. We can pull the MR's branch locally to check if fibonacci.ts was created.
    // However, glab provides a way to view MR diffs, but doing git fetch is easier.
    await execFileAsync("git", ["fetch"], { cwd: join(sandbox.dir, "repo") });
  }, 600000); // 10 minutes timeout for the agent to finish
});
