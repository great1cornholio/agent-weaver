import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectConfig } from "./types.js";

export type TestCommandSource = "agents" | "project" | "default";

export interface ResolvedTestCommand {
  command: string;
  source: TestCommandSource;
}

const DEFAULT_TEST_COMMAND = "pytest -x --tb=short";

function parseAgentsTestCommand(content: string): string | null {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*test\s*command\s*:\s*(.+)\s*$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function readAgentsCommand(workspacePath: string): string | null {
  const filePath = join(workspacePath, "AGENTS.md");
  try {
    const content = readFileSync(filePath, "utf-8");
    return parseAgentsTestCommand(content);
  } catch {
    return null;
  }
}

export function resolveTestCommand(project: ProjectConfig, workspacePath: string): ResolvedTestCommand {
  const fromAgents = readAgentsCommand(workspacePath);
  if (fromAgents) {
    return { command: fromAgents, source: "agents" };
  }

  if (project.testCmd) {
    return { command: project.testCmd, source: "project" };
  }

  return { command: DEFAULT_TEST_COMMAND, source: "default" };
}
