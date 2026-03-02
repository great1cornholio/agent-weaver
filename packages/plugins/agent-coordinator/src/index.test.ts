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
      description: "Agent plugin: Coordinator (Inline LLM)",
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

  it("returns bash", () => {
    const cmd = agent.getLaunchCommand(makeLaunchConfig());
    expect(cmd).toBe("bash");
  });
});

describe("getEnvironment", () => {
  const agent = create();

  it("returns empty object", () => {
    const env = agent.getEnvironment(makeLaunchConfig());
    expect(env).toEqual({});
  });
});

describe("isProcessRunning", () => {
  const agent = create();

  it("returns true", async () => {
    expect(await agent.isProcessRunning(makeTmuxHandle())).toBe(true);
  });
});

describe("getActivityState", () => {
  const agent = create();

  it("returns null", async () => {
    const result = await agent.getActivityState(makeSession({ runtimeHandle: null }));
    expect(result).toBeNull();
  });
});

describe("executeInline", () => {
  const agent = create();

  it("throws when endpoint is missing", async () => {
    await expect(agent.executeInline!(makeLaunchConfig())).rejects.toThrow(/endpoint/);
  });
});
