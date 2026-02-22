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
  type Session,
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

describe("Epic 3 E2E v1.0 flow (integration)", () => {
  const cleanupRoots = new Set<string>();

  afterAll(async () => {
    for (const root of cleanupRoots) {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function spawnFullWorkflow(options: {
    testCmd?: string;
    agentsTestCommand?: string;
  }): Promise<{
    session: Session;
    events: StructuredEventRow[];
  }> {
    const tempRoot = await mkdtemp(join(tmpdir(), "ao-epic3-e2e-"));
    cleanupRoots.add(tempRoot);

    const repoPath = join(tempRoot, "test-project");
    const worktreePath = join(tempRoot, "worktree", "tst-1");
    mkdirSync(repoPath, { recursive: true });
    mkdirSync(worktreePath, { recursive: true });

    if (options.agentsTestCommand) {
      await writeFile(worktreePath + "/AGENTS.md", `Test command: ${options.agentsTestCommand}\n`);
    }

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
      projects: {
        "test-project": {
          name: "Test Project",
          repo: "org/test-project",
          path: repoPath,
          defaultBranch: "main",
          sessionPrefix: "tst",
          workflow: "full",
          tddMode: "strict",
          ...(options.testCmd ? { testCmd: options.testCmd } : {}),
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
    return { session, events };
  }

  it("records stable full-workflow events with reviewer stage", async () => {
    const { session, events } = await spawnFullWorkflow({
      testCmd: "pnpm test:project",
      agentsTestCommand: "pnpm test:agents",
    });

    expect(session.id).toBe("tst-1");

    const types = events.map((event) => event.type);
    expect(types).toContain("session.started");
    expect(types).toContain("pipeline.layer.started");
    expect(types).toContain("pipeline.layer.completed");
    expect(types).toContain("pipeline.subtask.executed");
    expect(types).toContain("pipeline.completed");
    expect(types).toContain("pipeline.test.command.selected");

    const selectedCommand = events.find((event) => event.type === "pipeline.test.command.selected");
    expect(selectedCommand?.data["source"]).toBe("agents");
    expect(selectedCommand?.data["command"]).toBe("pnpm test:agents");

    const executed = events.filter((event) => event.type === "pipeline.subtask.executed");
    expect(executed).toHaveLength(3);
    expect(executed[2]?.data["agentType"]).toBe("reviewer");
  });

  it("falls back to project testCmd when AGENTS.md is absent", async () => {
    const { events } = await spawnFullWorkflow({
      testCmd: "pnpm test:project",
    });

    const selectedCommand = events.find((event) => event.type === "pipeline.test.command.selected");
    expect(selectedCommand?.data["source"]).toBe("project");
    expect(selectedCommand?.data["command"]).toBe("pnpm test:project");
  });
});