import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPluginRegistry,
  createSessionManager,
  getProjectBaseDir,
  type PluginModule,
  type Runtime,
  type Agent,
  type Workspace,
  type OrchestratorConfig,
  type RuntimeHandle,
  type OrchestratorEvent,
  type NotifyAction,
  type SCM,
  type Notifier,
  type Session,
  type PRInfo,
} from "@composio/ao-core";
import trackerGitlab from "@composio/ao-plugin-tracker-gitlab";
import scmGitlab from "@composio/ao-plugin-scm-gitlab";
import notifierTelegram from "@composio/ao-plugin-notifier-telegram";

const { glabMock } = vi.hoisted(() => ({ glabMock: vi.fn() }));

vi.mock("node:child_process", () => {
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: glabMock,
  });
  return { execFile };
});

function mockGlabJson(result: unknown): void {
  glabMock.mockResolvedValueOnce({ stdout: JSON.stringify(result) });
}

function makeRuntime(): Runtime {
  return {
    name: "mock-runtime",
    async create(config): Promise<RuntimeHandle> {
      return {
        id: config.sessionId,
        runtimeName: "mock-runtime",
        data: {},
      };
    },
    async destroy(): Promise<void> {},
    async sendMessage(): Promise<void> {},
    async getOutput(): Promise<string> {
      return "";
    },
    async isAlive(): Promise<boolean> {
      return true;
    },
  };
}

function makeAgent(): Agent {
  return {
    name: "mock-agent",
    processName: "mock-agent",
    getLaunchCommand(): string {
      return "mock-agent --run";
    },
    getEnvironment(): Record<string, string> {
      return { TEST_ENV: "1" };
    },
    async isProcessRunning(): Promise<boolean> {
      return true;
    },
    detectActivity(): "active" {
      return "active";
    },
    async getSessionInfo() {
      return null;
    },
  };
}

function makeWorkspace(workspacePath: string): Workspace {
  return {
    name: "mock-workspace",
    async create(config) {
      return {
        path: workspacePath,
        branch: config.branch,
        sessionId: config.sessionId,
        projectId: config.projectId,
      };
    },
    async destroy(): Promise<void> {},
    async list() {
      return [];
    },
  };
}

describe("Epic 1 E2E alpha flow (integration)", () => {
  let tempRoot = "";
  let configPath = "";
  let repoPath = "";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (configPath && repoPath) {
      const baseDir = getProjectBaseDir(configPath, repoPath);
      await rm(baseDir, { recursive: true, force: true }).catch(() => {});
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function setupAlphaFlow(): Promise<{
    notifier: Notifier;
    session: Session;
    prInfo: PRInfo;
  }> {
    tempRoot = await mkdtemp(join(tmpdir(), "ao-epic1-e2e-"));
    repoPath = join(tempRoot, "test-project");
    mkdirSync(repoPath, { recursive: true });
    configPath = join(tempRoot, "agent-orchestrator.yaml");
    await writeFile(configPath, "projects: {}\n");

    const registry = createPluginRegistry();
    const runtimePlugin: PluginModule<Runtime> = {
      manifest: {
        name: "mock-runtime",
        slot: "runtime",
        description: "mock runtime",
        version: "0.0.0",
      },
      create: () => makeRuntime(),
    };
    const agentPlugin: PluginModule<Agent> = {
      manifest: {
        name: "mock-agent",
        slot: "agent",
        description: "mock agent",
        version: "0.0.0",
      },
      create: () => makeAgent(),
    };
    const workspacePlugin: PluginModule<Workspace> = {
      manifest: {
        name: "mock-workspace",
        slot: "workspace",
        description: "mock workspace",
        version: "0.0.0",
      },
      create: () => makeWorkspace(join(tempRoot, "worktree", "tst-1")),
    };

    registry.register(runtimePlugin);
    registry.register(agentPlugin);
    registry.register(workspacePlugin);
    registry.register(trackerGitlab);
    registry.register(scmGitlab);
    registry.register(notifierTelegram, {
      token: "token-123",
      chatId: "123456",
    });

    const config: OrchestratorConfig = {
      configPath,
      port: 3000,
      readyThresholdMs: 300_000,
      defaults: {
        runtime: "mock-runtime",
        agent: "mock-agent",
        workspace: "mock-workspace",
        notifiers: ["telegram"],
      },
      projects: {
        "test-project": {
          name: "Test Project",
          repo: "group/repo",
          path: repoPath,
          defaultBranch: "main",
          sessionPrefix: "tst",
          tracker: { plugin: "gitlab", url: "https://gitlab.com" },
          scm: { plugin: "gitlab", url: "https://gitlab.com" },
        },
      },
      notifiers: {
        telegram: {
          plugin: "telegram",
          token: "token-123",
          chatId: "123456",
        },
      },
      notificationRouting: {
        urgent: ["telegram"],
        action: ["telegram"],
        warning: ["telegram"],
        info: ["telegram"],
      },
      reactions: {},
    };

    mockGlabJson({
      iid: 1,
      title: "Add /health endpoint",
      description: "Implement GET /health returning status ok",
      web_url: "https://gitlab.com/group/repo/-/issues/1",
      state: "opened",
      labels: ["backend"],
      assignees: [{ username: "alice" }],
    });
    mockGlabJson({
      iid: 1,
      title: "Add /health endpoint",
      description: "Implement GET /health returning status ok",
      web_url: "https://gitlab.com/group/repo/-/issues/1",
      state: "opened",
      labels: ["backend"],
      assignees: [{ username: "alice" }],
    });

    const sessionManager = createSessionManager({ config, registry });
    const session = await sessionManager.spawn({
      projectId: "test-project",
      issueId: "1",
    });

    const scm = registry.get<SCM>("scm", "gitlab");
    if (!scm) {
      throw new Error("scm-gitlab plugin not available");
    }

    mockGlabJson([
      {
        iid: 7,
        web_url: "https://gitlab.com/group/repo/-/merge_requests/7",
        title: "feat: add /health endpoint",
        source_branch: "feat/issue-1",
        target_branch: "main",
        draft: false,
      },
    ]);

    const prInfo = await scm.detectPR(session, config.projects["test-project"]);
    if (!prInfo) {
      throw new Error("PR info was not detected");
    }

    mockGlabJson({ state: "opened" });
    await expect(scm.getPRState(prInfo)).resolves.toBe("open");

    const notifier = registry.get<Notifier>("notifier", "telegram");
    if (!notifier) {
      throw new Error("notifier-telegram plugin not available");
    }

    return { notifier, session, prInfo };
  }

  it("runs spawn -> GitLab MR -> Telegram HITL path", async () => {
    const { notifier, session, prInfo } = await setupAlphaFlow();

    expect(session.id).toBe("tst-1");
    expect(session.branch).toBe("feat/issue-1");
    expect(session.issueId).toBe("1");
    expect(prInfo.number).toBe(7);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true, result: { message_id: 500 } })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const event: OrchestratorEvent = {
      id: "evt-pr-created",
      type: "pr.created",
      priority: "action",
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date("2026-02-22T10:00:00.000Z"),
      message: "MR created for issue #1",
      data: { prUrl: prInfo?.url },
    };
    const actions: NotifyAction[] = [
      { label: "Merge ✅", callbackEndpoint: "/api/hitl/merge/tst-1" },
      { label: "Reject ❌", callbackEndpoint: "/api/hitl/reject/tst-1" },
    ];

    await notifier!.notifyWithActions!(event, actions);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.reply_markup.inline_keyboard).toHaveLength(2);
    expect(payload.reply_markup.inline_keyboard[0][0].callback_data).toContain("/api/hitl/merge/tst-1");
    expect(payload.reply_markup.inline_keyboard[1][0].callback_data).toContain("/api/hitl/reject/tst-1");
    expect(payload.text).toContain("pr.created");
  });

  it("builds Reject ❌ callback payload for Telegram HITL", async () => {
    const { notifier, session, prInfo } = await setupAlphaFlow();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true, result: { message_id: 501 } })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const event: OrchestratorEvent = {
      id: "evt-pr-awaiting-decision",
      type: "review.pending",
      priority: "action",
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date("2026-02-22T10:01:00.000Z"),
      message: "Awaiting HITL decision",
      data: { prUrl: prInfo.url },
    };
    const actions: NotifyAction[] = [
      { label: "Reject ❌", callbackEndpoint: "/api/hitl/reject/tst-1" },
    ];

    await notifier.notifyWithActions!(event, actions);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.reply_markup.inline_keyboard).toHaveLength(1);
    expect(payload.reply_markup.inline_keyboard[0][0].text).toBe("Reject ❌");
    expect(payload.reply_markup.inline_keyboard[0][0].callback_data).toContain(
      "/api/hitl/reject/tst-1",
    );
  });

  it("fails loudly when Telegram API rejects HITL notification", async () => {
    const { notifier, session, prInfo } = await setupAlphaFlow();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ ok: false, description: "Unauthorized" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const event: OrchestratorEvent = {
      id: "evt-pr-auth-failed",
      type: "review.pending",
      priority: "action",
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date("2026-02-22T10:02:00.000Z"),
      message: "Awaiting HITL decision",
      data: { prUrl: prInfo.url },
    };

    await expect(
      notifier.notifyWithActions!(event, [
        { label: "Merge ✅", callbackEndpoint: "/api/hitl/merge/tst-1" },
      ]),
    ).rejects.toThrow("Telegram API request failed (401)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});