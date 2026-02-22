import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getProjectBaseDir } from "./paths.js";

export interface StructuredEventLogEntry {
  type: string;
  sessionId: string;
  projectId: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

export function getEventLogPath(configPath: string, projectPath: string): string {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  return join(baseDir, "ao-events.jsonl");
}

export function appendStructuredEvent(
  configPath: string,
  projectPath: string,
  entry: StructuredEventLogEntry,
): void {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  mkdirSync(baseDir, { recursive: true });

  const logPath = getEventLogPath(configPath, projectPath);
  const row = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    type: entry.type,
    sessionId: entry.sessionId,
    projectId: entry.projectId,
    data: entry.data ?? {},
  };

  appendFileSync(logPath, `${JSON.stringify(row)}\n`, "utf-8");
}