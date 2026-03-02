import { mkdir, writeFile, rm, cp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SandboxGitLabConfig {
  id: string; // Unique id for the test
  gitlabProject: string; // e.g. "great_cornholio/sandbox-project"
}

export class SandboxGitLab {
  public id: string;
  public dir: string;
  public dataDir: string;
  public configPath: string;
  public gitlabProject: string;

  constructor(config: SandboxGitLabConfig) {
    this.id = config.id + "-" + Date.now();
    this.dir = resolve(`/tmp/agent-weaver-e2e-gitlab-${this.id}`);
    this.dataDir = join(this.dir, ".ao-data");
    this.configPath = join(this.dir, "agent-orchestrator.yaml");
    this.gitlabProject = config.gitlabProject;
  }

  async init() {
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.dataDir, { recursive: true });

    const repoDir = join(this.dir, "repo");
    await mkdir(repoDir, { recursive: true });

    // Try to clone the real repo from GitLab
    try {
      const repoUrl = `http://oauth2:${process.env.GITLAB_TOKEN}@192.168.1.190:9080/${this.gitlabProject}.git`;
      await execFileAsync("git", ["clone", repoUrl, repoDir]);
    } catch (e) {
      throw new Error(
        `Failed to clone ${this.gitlabProject} using git. Make sure GITLAB_TOKEN is set.\n${e}`,
      );
    }

    // Set local git config to avoid global config pollution
    await execFileAsync("git", ["config", "user.email", "test-e2e@agent-orchestrator.local"], {
      cwd: repoDir,
    });
    await execFileAsync("git", ["config", "user.name", "E2E GitLab Test"], { cwd: repoDir });

    // Generate dynamic config utilizing the provided LLM url
    const endpointUrl = process.env.E2E_LLM_BASE_URL || "http://localhost:1234/v1";
    const modelName = process.env.E2E_LLM_MODEL || "openai/qwen3-coder-next";

    const yamlContent = `
plugins:
  workspace:
    - module: "@composio/ao-plugin-workspace-worktree"
      config:
        worktreeDir: ${this.dir}/worktrees
  scm:
    - "@composio/ao-plugin-scm-gitlab"
  tracker:
    - "@composio/ao-plugin-tracker-gitlab"

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
  sandbox-gitlab:
    repo: ${this.gitlabProject}
    path: ${repoDir}
    defaultBranch: main
    scm:
      plugin: gitlab
    tracker:
      plugin: gitlab
    agentRules: |
      You are an autonomous CI/CD backend worker. You automatically create missing files.
      CRITICAL FORMATTING GUIDELINES:
      - DO NOT output conversational preamble or explanations (e.g. "First I'll do X").
      - Respond ONLY with file changes.
      - You MUST include the full code blocks for ALL modified and created files in this exact response. Do NOT wait for another turn. Generate the code immediately right now.
`;
    await writeFile(this.configPath, yamlContent);
  }

  async cleanup() {
    await rm(this.dir, { recursive: true, force: true });
  }
}
