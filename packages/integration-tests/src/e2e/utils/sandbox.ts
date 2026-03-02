import { mkdir, writeFile, rm, cp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SandboxConfig {
  id: string; // Unique id for the test
}

export class Sandbox {
  public id: string;
  public dir: string;
  public dataDir: string;
  public configPath: string;

  constructor(config: SandboxConfig) {
    this.id = config.id + "-" + Date.now();
    this.dir = resolve(`/tmp/agent-weaver-e2e-${this.id}`);
    this.dataDir = join(this.dir, ".ao-data");
    this.configPath = join(this.dir, "agent-orchestrator.yaml");
  }

  async init() {
    // 1. Clean up and create root dir
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.dataDir, { recursive: true });

    const repoDir = join(this.dir, "repo");
    await mkdir(repoDir, { recursive: true });

    // 2. Initialize a local git repository
    await execFileAsync("git", ["init"], { cwd: repoDir });

    // Set local git config to avoid global config pollution
    await execFileAsync("git", ["config", "user.email", "test@agent-orchestrator.local"], {
      cwd: repoDir,
    });
    await execFileAsync("git", ["config", "user.name", "E2E Test"], { cwd: repoDir });

    // Ensure we are on branch main
    try {
      await execFileAsync("git", ["branch", "-M", "main"], { cwd: repoDir });
    } catch (e) {
      // Ignore, might only work after first commit
    }

    // 3. Create a dummy file and initial commit
    await writeFile(join(repoDir, "index.ts"), "export const hello = 'world';\n");
    await execFileAsync("git", ["add", "index.ts"], { cwd: repoDir });
    await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: repoDir });

    // Ensure we have a remote because workspace-worktree assumes origin/main
    const remoteDir = join(this.dir, "upstream.git");
    await execFileAsync("git", ["init", "--bare", remoteDir]);
    await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd: repoDir });
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: repoDir });

    // 4. Generate dynamic config utilizing the provided LLM url
    const endpointUrl = process.env.E2E_LLM_BASE_URL!;
    const modelName = process.env.E2E_LLM_MODEL || "openai/qwen3-coder-next";
    const yamlContent = `
plugins:
  workspace:
    - module: "@composio/ao-plugin-workspace-worktree"
      config:
        worktreeDir: ${this.dir}/worktrees

defaults:
  agent: aider

hosts:
  local-e2e:
    address: localhost
    totalVramGb: 128
    models:
      "${modelName}":
        endpoint: ${endpointUrl}
        vramGb: 8
        maxSlots: 10
        contextWindow: 16000

agentTypes:
  coordinator:
    model: "${modelName}"
    maxConcurrentPerHost: 2
  reviewer:
    model: "${modelName}"
    maxConcurrentPerHost: 2
  developer:
    model: "${modelName}"
    maxConcurrentPerHost: 2

projects:
  test-project:
    repo: e2e-test
    path: ${repoDir}
    defaultBranch: main
`;
    await writeFile(this.configPath, yamlContent);
  }

  async cleanup() {
    await rm(this.dir, { recursive: true, force: true });
  }
}
