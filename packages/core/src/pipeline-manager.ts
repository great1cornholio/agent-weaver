import { buildExecutionLayers, type Subtask, type SubtaskPlan } from "./pipeline-plan.js";
import { hashSubtaskPlan, type SubtaskCheckpointResult } from "./pipeline-checkpoint.js";

export type TddMode = "strict" | "warn" | "off";

export interface TddGuardResult {
  phase: "red" | "green";
  passed: boolean;
  testExit: number;
  output: string;
}

export interface PipelineTddGuard {
  assertRed(): Promise<TddGuardResult>;
  assertGreen(): Promise<TddGuardResult>;
}

export interface TaskPipelineManagerOptions {
  runSubtask: (subtask: Subtask) => Promise<void>;
  guard: PipelineTddGuard;
  tddMode: TddMode;
  maxRedRetries?: number;
  maxGreenRetries?: number;
  onLayerStart?: (layerIndex: number, layer: Subtask[]) => void;
  onLayerCompleted?: (layerIndex: number, layer: Subtask[]) => void;
  checkpointStore?: PipelineCheckpointStore;
  sessionId?: string;
}

export interface PipelineExecutionResult {
  tddResults: TddGuardResult[];
  resumedFromLayer: number;
}

export interface PipelineCheckpointState {
  sessionId: string;
  planHash: string;
  completedLayers: number[];
  currentLayer: number;
  subtaskResults: Record<string, SubtaskCheckpointResult>;
  tddResults: TddGuardResult[];
  lastUpdated: string;
}

export interface PipelineCheckpointStore {
  load(): PipelineCheckpointState | null;
  save(checkpoint: PipelineCheckpointState): void;
  clear(): void;
}

export class TaskPipelineManager {
  private readonly runSubtask: (subtask: Subtask) => Promise<void>;
  private readonly guard: PipelineTddGuard;
  private readonly tddMode: TddMode;
  private readonly maxRedRetries: number;
  private readonly maxGreenRetries: number;
  private readonly onLayerStart?: (layerIndex: number, layer: Subtask[]) => void;
  private readonly onLayerCompleted?: (layerIndex: number, layer: Subtask[]) => void;
  private readonly checkpointStore?: PipelineCheckpointStore;
  private readonly sessionId: string;

  constructor(options: TaskPipelineManagerOptions) {
    this.runSubtask = options.runSubtask;
    this.guard = options.guard;
    this.tddMode = options.tddMode;
    this.maxRedRetries = options.maxRedRetries ?? 2;
    this.maxGreenRetries = options.maxGreenRetries ?? 3;
    this.onLayerStart = options.onLayerStart;
    this.onLayerCompleted = options.onLayerCompleted;
    this.checkpointStore = options.checkpointStore;
    this.sessionId = options.sessionId ?? "pipeline-session";
  }

  async executePlan(plan: SubtaskPlan): Promise<PipelineExecutionResult> {
    const layers = buildExecutionLayers(plan);
    const tddResults: TddGuardResult[] = [];
    const subtaskResults: Record<string, SubtaskCheckpointResult> = {};
    const planHash = hashSubtaskPlan(plan);
    let resumedFromLayer = 0;

    const existingCheckpoint = this.checkpointStore?.load() ?? null;
    if (existingCheckpoint && existingCheckpoint.planHash === planHash) {
      resumedFromLayer = Math.max(0, existingCheckpoint.currentLayer);
      tddResults.push(...existingCheckpoint.tddResults);
      Object.assign(subtaskResults, existingCheckpoint.subtaskResults);
    }

    for (let index = resumedFromLayer; index < layers.length; index += 1) {
      const layer = layers[index];

      this.saveCheckpoint({
        currentLayer: index,
        completedLayers: Array.from({ length: index }, (_, layerIndex) => layerIndex),
        planHash,
        tddResults,
        subtaskResults,
      });

      this.onLayerStart?.(index, layer);
      await this.runLayer(layer, subtaskResults);
      this.onLayerCompleted?.(index, layer);

      const nextLayer = layers[index + 1] ?? [];

      if (this.requiresRedGuard(layer, nextLayer)) {
        const redResult = await this.enforceGuard("red", this.maxRedRetries, layer);
        tddResults.push(...redResult);
      }

      if (this.requiresGreenGuard(layer)) {
        const greenResult = await this.enforceGuard("green", this.maxGreenRetries, layer);
        tddResults.push(...greenResult);
      }
    }

    this.checkpointStore?.clear();
    return { tddResults, resumedFromLayer };
  }

  private async runLayer(
    layer: Subtask[],
    subtaskResults: Record<string, SubtaskCheckpointResult>,
  ): Promise<void> {
    await Promise.all(
      layer.map(async (subtask) => {
        subtaskResults[subtask.id] = {
          status: "running",
          agentType: subtask.agentType,
          startedAt: new Date().toISOString(),
        };

        try {
          await this.runSubtask(subtask);
          subtaskResults[subtask.id] = {
            ...subtaskResults[subtask.id],
            status: "done",
            completedAt: new Date().toISOString(),
          };
        } catch (error) {
          subtaskResults[subtask.id] = {
            ...subtaskResults[subtask.id],
            status: "failed",
            completedAt: new Date().toISOString(),
            output: String(error),
          };
          throw error;
        }
      }),
    );
  }

  private requiresRedGuard(currentLayer: Subtask[], nextLayer: Subtask[]): boolean {
    const hasTester = currentLayer.some((subtask) => subtask.agentType === "tester");
    const hasNextDeveloper = nextLayer.some((subtask) => subtask.agentType === "developer");
    return hasTester && hasNextDeveloper;
  }

  private requiresGreenGuard(currentLayer: Subtask[]): boolean {
    return currentLayer.some((subtask) => subtask.agentType === "developer");
  }

  private async enforceGuard(
    phase: "red" | "green",
    maxRetries: number,
    layer: Subtask[],
  ): Promise<TddGuardResult[]> {
    if (this.tddMode === "off") {
      return [];
    }

    const results: TddGuardResult[] = [];
    const check = phase === "red" ? () => this.guard.assertRed() : () => this.guard.assertGreen();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const result = await check();
      results.push(result);

      if (result.passed) {
        return results;
      }

      if (this.tddMode === "warn") {
        return results;
      }

      if (attempt < maxRetries) {
        await this.runLayer(layer, {});
      }
    }

    throw new Error(`TDD ${phase} guard failed after ${maxRetries + 1} attempts`);
  }

  private saveCheckpoint(input: {
    currentLayer: number;
    completedLayers: number[];
    planHash: string;
    tddResults: TddGuardResult[];
    subtaskResults: Record<string, SubtaskCheckpointResult>;
  }): void {
    if (!this.checkpointStore) {
      return;
    }

    this.checkpointStore.save({
      sessionId: this.sessionId,
      planHash: input.planHash,
      completedLayers: input.completedLayers,
      currentLayer: input.currentLayer,
      subtaskResults: input.subtaskResults,
      tddResults: input.tddResults,
      lastUpdated: new Date().toISOString(),
    });
  }
}
