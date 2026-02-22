import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { TddGuardResult } from "./pipeline-manager.js";
import type { SubtaskPlan } from "./pipeline-plan.js";

export interface SubtaskCheckpointResult {
  status: "pending" | "running" | "done" | "failed";
  agentType: "tester" | "developer" | "reviewer";
  startedAt?: string;
  completedAt?: string;
  output?: string;
}

export interface PipelineCheckpoint {
  sessionId: string;
  planHash: string;
  completedLayers: number[];
  currentLayer: number;
  subtaskResults: Record<string, SubtaskCheckpointResult>;
  tddResults: TddGuardResult[];
  lastUpdated: string;
}

export function hashSubtaskPlan(plan: SubtaskPlan): string {
  const normalized = JSON.stringify(plan);
  return createHash("sha256").update(normalized).digest("hex");
}

export class PipelineCheckpointManager {
  private readonly path: string;

  constructor(workspacePath: string, sessionId: string) {
    this.path = join(workspacePath, ".ao", `pipeline-${sessionId}.json`);
  }

  get checkpointPath(): string {
    return this.path;
  }

  save(checkpoint: PipelineCheckpoint): void {
    const parent = dirname(this.path);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
    }
    writeFileSync(this.path, JSON.stringify(checkpoint, null, 2), "utf-8");
  }

  load(): PipelineCheckpoint | null {
    if (!existsSync(this.path)) {
      return null;
    }

    const raw = readFileSync(this.path, "utf-8");
    try {
      const parsed = JSON.parse(raw) as PipelineCheckpoint;
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    if (existsSync(this.path)) {
      rmSync(this.path, { force: true });
    }
  }
}
