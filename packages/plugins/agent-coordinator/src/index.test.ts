import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeHandle, Session, AgentLaunchConfig } from "@composio/ao-core";

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock("node:child_process", () => {
  const fn = Object.assign((..._args: unknown[]) => {}, {
    [Symbol.for("nodejs.util.promisify.custom")]: mockExecFileAsync,
  });
  return { execFile: fn };
});

import { create, manifest, default as defaultExport } from "./index.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-1",
    projectId: "test-project",
    status: "working",
    activity: "active",
    branch: "feat/test",
    issueId: null,
    pr: null,
    workspacePath: "/workspace/test",
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

function makeTmuxHandle(id = "test-session"): RuntimeHandle {
  return { id, runtimeName: "tmux", data: {} };
}

function makeLaunchConfig(overrides: Partial<AgentLaunchConfig> = {}): AgentLaunchConfig {
  return {
    sessionId: "sess-1",
    projectConfig: {
      name: "my-project",
      repo: "owner/repo",
      path: "/workspace/repo",
      defaultBranch: "main",
      sessionPrefix: "my",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("plugin manifest & exports", () => {
  it("has correct manifest", () => {
    expect(manifest).toEqual({
      name: "coordinator",
      slot: "agent",
      description: "Agent plugin: Coordinator",
      version: "0.1.0",
    });
  });

  it("default export is valid", () => {
    expect(defaultExport.manifest).toBe(manifest);
    expect(typeof defaultExport.create).toBe("function");
  });
});

describe("getLaunchCommand", () => {
  const agent = create();

  it("uses codex and coordinator prompt by default", () => {
    const cmd = agent.getLaunchCommand(makeLaunchConfig());
    expect(cmd).toContain("codex");
    expect(cmd).toContain("--system-prompt");
  });

  it("includes model and prompt when provided", () => {
    const cmd = agent.getLaunchCommand(
      makeLaunchConfig({ model: "gpt-oss-120", prompt: "Plan issue #1" }),
    );
    expect(cmd).toContain("--model 'gpt-oss-120'");
    expect(cmd).toContain("-- 'Plan issue #1'");
  });
});

describe("getEnvironment", () => {
  const agent = create();

  it("sets AO_SESSION_ID and AO_AGENT_TYPE", () => {
    const env = agent.getEnvironment(makeLaunchConfig());
    expect(env["AO_SESSION_ID"]).toBe("sess-1");
    expect(env["AO_AGENT_TYPE"]).toBe("coordinator");
  });
});

describe("isProcessRunning", () => {
  const agent = create();

  it("returns true when codex is running on tmux pane tty", async () => {
    mockExecFileAsync.mockImplementation((cmd: string) => {
      if (cmd === "tmux") {
        return Promise.resolve({ stdout: "/dev/ttys005\n", stderr: "" });
      }
      if (cmd === "ps") {
        return Promise.resolve({
          stdout: "  PID TT ARGS\n  444 ttys005 codex --model x\n",
          stderr: "",
        });
      }
      return Promise.reject(new Error("unexpected"));
    });

    expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(true);
  });

  it("returns false when codex is not running", async () => {
    mockExecFileAsync.mockImplementation((cmd: string) => {
      if (cmd === "tmux") {
        return Promise.resolve({ stdout: "/dev/ttys005\n", stderr: "" });
      }
      if (cmd === "ps") {
        return Promise.resolve({
          stdout: "  PID TT ARGS\n  444 ttys005 zsh\n",
          stderr: "",
        });
      }
      return Promise.reject(new Error("unexpected"));
    });

    expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(false);
  });
});

describe("getActivityState", () => {
  const agent = create();

  it("returns exited when runtime handle is missing", async () => {
    const result = await agent.getActivityState(makeSession({ runtimeHandle: null }));
    expect(result?.state).toBe("exited");
  });
});
