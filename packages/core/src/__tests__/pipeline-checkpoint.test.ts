import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  hashSubtaskPlan,
  PipelineCheckpointManager,
  type PipelineCheckpoint,
} from "../pipeline-checkpoint.js";
import type { SubtaskPlan } from "../pipeline-plan.js";

describe("pipeline-checkpoint", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("saves and loads checkpoint", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ao-pipeline-checkpoint-"));
    const manager = new PipelineCheckpointManager(tempDir, "abc-1");
    const checkpoint: PipelineCheckpoint = {
      sessionId: "abc-1",
      planHash: "hash",
      completedLayers: [0],
      currentLayer: 1,
      subtaskResults: {
        "subtask-0": {
          status: "done",
          agentType: "tester",
          output: "TESTS_DONE",
        },
      },
      tddResults: [
        {
          phase: "red",
          passed: true,
          testExit: 1,
          output: "ok",
        },
      ],
      lastUpdated: new Date().toISOString(),
    };

    manager.save(checkpoint);
    const loaded = manager.load();

    expect(loaded).toEqual(checkpoint);
  });

  it("returns null when checkpoint does not exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ao-pipeline-checkpoint-"));
    const manager = new PipelineCheckpointManager(tempDir, "abc-2");
    expect(manager.load()).toBeNull();
  });

  it("returns null for malformed checkpoint file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ao-pipeline-checkpoint-"));
    const manager = new PipelineCheckpointManager(tempDir, "abc-3");

    mkdirSync(join(tempDir, ".ao"), { recursive: true });
    writeFileSync(manager.checkpointPath, "{ not-json", "utf-8");
    expect(manager.load()).toBeNull();
  });

  it("clears checkpoint file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ao-pipeline-checkpoint-"));
    const manager = new PipelineCheckpointManager(tempDir, "abc-4");

    manager.save({
      sessionId: "abc-4",
      planHash: "hash",
      completedLayers: [],
      currentLayer: 0,
      subtaskResults: {},
      tddResults: [],
      lastUpdated: new Date().toISOString(),
    });

    expect(existsSync(manager.checkpointPath)).toBe(true);
    manager.clear();
    expect(existsSync(manager.checkpointPath)).toBe(false);
  });

  it("produces deterministic plan hash", () => {
    const plan: SubtaskPlan = {
      strategy: "tdd",
      subtasks: [
        { id: "subtask-0", agentType: "tester", description: "tests" },
        {
          id: "subtask-1",
          agentType: "developer",
          description: "impl",
          dependsOn: ["subtask-0"],
        },
      ],
    };

    const first = hashSubtaskPlan(plan);
    const second = hashSubtaskPlan(plan);
    expect(first).toBe(second);
  });
});
