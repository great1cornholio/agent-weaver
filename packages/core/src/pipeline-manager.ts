import { buildExecutionLayers, type Subtask, type SubtaskPlan } from "./pipeline-plan.js";

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
}

export interface PipelineExecutionResult {
  tddResults: TddGuardResult[];
}

export class TaskPipelineManager {
  private readonly runSubtask: (subtask: Subtask) => Promise<void>;
  private readonly guard: PipelineTddGuard;
  private readonly tddMode: TddMode;
  private readonly maxRedRetries: number;
  private readonly maxGreenRetries: number;
  private readonly onLayerStart?: (layerIndex: number, layer: Subtask[]) => void;
  private readonly onLayerCompleted?: (layerIndex: number, layer: Subtask[]) => void;

  constructor(options: TaskPipelineManagerOptions) {
    this.runSubtask = options.runSubtask;
    this.guard = options.guard;
    this.tddMode = options.tddMode;
    this.maxRedRetries = options.maxRedRetries ?? 2;
    this.maxGreenRetries = options.maxGreenRetries ?? 3;
    this.onLayerStart = options.onLayerStart;
    this.onLayerCompleted = options.onLayerCompleted;
  }

  async executePlan(plan: SubtaskPlan): Promise<PipelineExecutionResult> {
    const layers = buildExecutionLayers(plan);
    const tddResults: TddGuardResult[] = [];

    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      this.onLayerStart?.(index, layer);
      await this.runLayer(layer);
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

    return { tddResults };
  }

  private async runLayer(layer: Subtask[]): Promise<void> {
    await Promise.all(layer.map(async (subtask) => this.runSubtask(subtask)));
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
        await this.runLayer(layer);
      }
    }

    throw new Error(`TDD ${phase} guard failed after ${maxRetries + 1} attempts`);
  }
}
