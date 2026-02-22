import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OrchestratorConfig, ProjectConfig } from "@composio/ao-core";

const execFileAsync = promisify(execFile);

type Severity = "error" | "warning";

interface PreflightMessage {
  severity: Severity;
  check: string;
  message: string;
  fix?: string;
}

export interface SpawnPreflightReport {
  ok: boolean;
  messages: PreflightMessage[];
}

interface SpawnPreflightOptions {
  issueProvided: boolean;
}

function resolveProject(config: OrchestratorConfig, projectId: string): ProjectConfig {
  const project = config.projects[projectId];
  if (!project) {
    throw new Error(`Unknown project: ${projectId}`);
  }
  return project;
}

function requiredBinaries(
  config: OrchestratorConfig,
  project: ProjectConfig,
  options: SpawnPreflightOptions,
): string[] {
  const bins = new Set<string>();
  bins.add("git");

  const runtime = project.runtime ?? config.defaults.runtime;
  if (runtime === "tmux") {
    bins.add("tmux");
  }

  const trackerPlugin = project.tracker?.plugin;
  if (options.issueProvided && trackerPlugin === "github") {
    bins.add("gh");
  }
  if (options.issueProvided && trackerPlugin === "gitlab") {
    bins.add("glab");
  }

  return Array.from(bins);
}

function requiredEnvironment(
  project: ProjectConfig,
  options: SpawnPreflightOptions,
): Array<{ check: string; requiredAnyOf: string[]; fix: string }> {
  const requirements: Array<{ check: string; requiredAnyOf: string[]; fix: string }> = [];

  if (options.issueProvided && project.tracker?.plugin === "linear") {
    requirements.push({
      check: "tracker.linear.auth",
      requiredAnyOf: ["LINEAR_API_KEY", "COMPOSIO_API_KEY"],
      fix: "Set LINEAR_API_KEY (or COMPOSIO_API_KEY) before running spawn with issue ID.",
    });
  }

  return requirements;
}

async function hasBinary(binary: string): Promise<boolean> {
  try {
    await execFileAsync("which", [binary], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runSpawnPreflight(
  config: OrchestratorConfig,
  projectId: string,
  options: SpawnPreflightOptions,
): Promise<SpawnPreflightReport> {
  const project = resolveProject(config, projectId);
  const messages: PreflightMessage[] = [];

  const bins = requiredBinaries(config, project, options);
  const checks = await Promise.all(
    bins.map(async (binary) => ({
      binary,
      found: await hasBinary(binary),
    })),
  );

  for (const check of checks) {
    if (!check.found) {
      messages.push({
        severity: "error",
        check: `binary.${check.binary}`,
        message: `Required binary not found on PATH: ${check.binary}`,
        fix: `Install '${check.binary}' and ensure it is available in PATH.`,
      });
    }
  }

  const envRequirements = requiredEnvironment(project, options);
  for (const requirement of envRequirements) {
    const satisfied = requirement.requiredAnyOf.some((name) => {
      const value = process.env[name];
      return typeof value === "string" && value.length > 0;
    });

    if (!satisfied) {
      messages.push({
        severity: "error",
        check: requirement.check,
        message: `Missing required environment variable (${requirement.requiredAnyOf.join(" or ")})`,
        fix: requirement.fix,
      });
    }
  }

  if (!options.issueProvided && project.tracker?.plugin === "linear") {
    messages.push({
      severity: "warning",
      check: "tracker.linear.issue-less",
      message: "Linear tracker configured, but spawn was run without issue ID.",
      fix: "Provide an issue ID for tracker-linked workflow, e.g. 'ao spawn <project> INT-123'.",
    });
  }

  const ok = !messages.some((entry) => entry.severity === "error");
  return { ok, messages };
}

export function formatPreflightReport(report: SpawnPreflightReport): string {
  if (report.messages.length === 0) {
    return "Preflight checks passed.";
  }

  const lines = ["Spawn preflight checks:"];
  for (const item of report.messages) {
    const marker = item.severity === "error" ? "✗" : "⚠";
    lines.push(`- ${marker} [${item.check}] ${item.message}`);
    if (item.fix) {
      lines.push(`  fix: ${item.fix}`);
    }
  }

  return lines.join("\n");
}
