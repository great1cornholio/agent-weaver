import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrchestratorConfig } from "@composio/ao-core";

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

import { runSpawnPreflight } from "../../src/lib/preflight.js";

function createConfig(trackerPlugin: "github" | "gitlab" | "linear"): OrchestratorConfig {
  return {
    configPath: "/tmp/agent-orchestrator.yaml",
    dataDir: "~/.agent-orchestrator",
    worktreeDir: "~/.worktrees",
    port: 3000,
    readyThresholdMs: 300_000,
    defaults: {
      runtime: "tmux",
      agent: "claude-code",
      workspace: "worktree",
      notifiers: ["desktop"],
    },
    projects: {
      sandbox: {
        name: "Sandbox",
        repo: "group/sandbox",
        path: "/tmp/sandbox",
        defaultBranch: "main",
        sessionPrefix: "sbx",
        tracker: { plugin: trackerPlugin },
      },
    },
    notifiers: {},
    notificationRouting: {},
    reactions: {},
  };
}

describe("runSpawnPreflight gitlab auth", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    process.env.GLAB_TOKEN = "";
    process.env.GITLAB_TOKEN = "";
  });

  it("fails when gitlab tracker issue flow has no token and glab auth is unavailable", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (cmd === "which" && args[0] === "git") {
          callback(null, "/usr/bin/git\n", "");
          return;
        }
        if (cmd === "which" && args[0] === "tmux") {
          callback(null, "/usr/bin/tmux\n", "");
          return;
        }
        if (cmd === "which" && args[0] === "glab") {
          callback(null, "/usr/bin/glab\n", "");
          return;
        }
        if (cmd === "glab" && args[0] === "auth" && args[1] === "status") {
          callback(new Error("not logged in"), "", "not logged in");
          return;
        }
        callback(new Error("unexpected call"), "", "");
      },
    );

    const report = await runSpawnPreflight(createConfig("gitlab"), "sandbox", {
      issueProvided: true,
    });

    expect(report.ok).toBe(false);
    expect(report.messages.some((entry) => entry.check === "tracker.gitlab.auth")).toBe(true);
  });

  it("passes gitlab auth check when GLAB_TOKEN is set", async () => {
    process.env.GLAB_TOKEN = "glpat-123";

    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (cmd === "which" && ["git", "tmux", "glab"].includes(args[0] ?? "")) {
          callback(null, `/usr/bin/${args[0]}\n`, "");
          return;
        }
        callback(new Error("unexpected call"), "", "");
      },
    );

    const report = await runSpawnPreflight(createConfig("gitlab"), "sandbox", {
      issueProvided: true,
    });

    expect(report.ok).toBe(true);
    expect(report.messages.some((entry) => entry.check === "tracker.gitlab.auth")).toBe(false);
  });
});
