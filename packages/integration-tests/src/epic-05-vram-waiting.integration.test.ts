import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  createPluginRegistry,
  createSessionManager,
  getEventLogPath,
  type Agent,
  type OrchestratorConfig,
  type PluginModule,
  type Runtime,
  type RuntimeHandle,
  type Workspace,
} from "@composio/ao-core";
import coordinatorPlugin from "@composio/ao-plugin-agent-coordinator";

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

interface StructuredEventRow {
  type: string;
  sessionId: string;
  projectId: string;
  data: Record<string, unknown>;
}

async function readStructuredEvents(logPath: string): Promise<StructuredEventRow[]> {
  const content = await readFile(logPath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as StructuredEventRow);
}

describe("Epic 5 VRAM waiting path (integration)", () => {
  const cleanupRoots = new Set<string>();

  afterAll(async () => {
    for (const root of cleanupRoots) {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("emits vram.slot.waiting with configured retryAfter and pipeline.failed", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ao-epic5-vram-waiting-"));
    cleanupRoots.add(tempRoot);

    const repoPath = join(tempRoot, "test-project");
    const worktreePath = join(tempRoot, "worktree", "tst-1");
    mkdirSync(repoPath, { recursive: true });
    mkdirSync(worktreePath, { recursive: true });

    const configPath = join(tempRoot, "agent-orchestrator.yaml");
    await writeFile(configPath, "projects: {}\n");

    const config: OrchestratorConfig = {
      configPath,
      port: 3000,
      readyThresholdMs: 300_000,
      defaults: {
        runtime: "mock-runtime",
        agent: "mock-agent",
        workspace: "mock-workspace",
      },
      concurrency: {
        queueLookahead: 5,
        maxSkipsPerTask: 2,
        retryBackoff: 17,
      },
      hosts: {
        local: {
          address: "localhost",
          models: {
            "model-developer": {
              endpoint: "http://localhost:8082/v1",
              vramGb: 8,
              maxSlots: 1,
            },
          },
        },
      },
      agentTypes: {
        tester: { model: "model-missing", maxConcurrentPerHost: 1 },
        developer: { model: "model-developer", maxConcurrentPerHost: 1 },
        reviewer: { model: "model-developer", maxConcurrentPerHost: 1 },
      },
      projects: {
        "test-project": {
          name: "Test Project",
          repo: "org/test-project",
          path: repoPath,
          defaultBranch: "main",
          sessionPrefix: "tst",
          workflow: "full",
          tddMode: "strict",
        },
      },
      reactions: {},
    };

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
      create: () => makeWorkspace(worktreePath),
    };

    registry.register(runtimePlugin);
    registry.register(agentPlugin);
    registry.register(workspacePlugin);
    registry.register(coordinatorPlugin);

    const sessionManager = createSessionManager({ config, registry });
    const session = await sessionManager.spawn({
      projectId: "test-project",
      issueId: "42",
    });

    const eventLogPath = getEventLogPath(configPath, repoPath);
    const events = await readStructuredEvents(eventLogPath);

    const waiting = events.find((event) => event.type === "vram.slot.waiting");
    expect(waiting).toBeDefined();
    expect(waiting?.sessionId).toBe(session.id);
    expect(waiting?.data["subtaskId"]).toBe("subtask-0");
    expect(waiting?.data["retryAfter"]).toBe(17);

    const failed = events.find((event) => event.type === "pipeline.failed");
    expect(failed).toBeDefined();
  });
});
