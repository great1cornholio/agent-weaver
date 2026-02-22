import { describe, it, expect, vi } from "vitest";
import { TaskPipelineManager, type PipelineTddGuard, type TddGuardResult } from "../pipeline-manager.js";
import type { SubtaskPlan } from "../pipeline-plan.js";

function createGuard(red: TddGuardResult[], green: TddGuardResult[]): PipelineTddGuard {
  let redIndex = 0;
  let greenIndex = 0;

  return {
    assertRed: vi.fn(async () => red[Math.min(redIndex++, red.length - 1)]),
    assertGreen: vi.fn(async () => green[Math.min(greenIndex++, green.length - 1)]),
  };
}

describe("TaskPipelineManager", () => {
  it("executes layers and enforces red+green guards in strict mode", async () => {
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

    const runSubtask = vi.fn(async () => {});
    const guard = createGuard(
      [{ phase: "red", passed: true, testExit: 1, output: "red ok" }],
      [{ phase: "green", passed: true, testExit: 0, output: "green ok" }],
    );

    const manager = new TaskPipelineManager({
      runSubtask,
      guard,
      tddMode: "strict",
    });

    const result = await manager.executePlan(plan);

    expect(runSubtask).toHaveBeenCalledTimes(2);
    expect(guard.assertRed).toHaveBeenCalledTimes(1);
    expect(guard.assertGreen).toHaveBeenCalledTimes(1);
    expect(result.tddResults).toHaveLength(2);
  });

  it("re-runs tester layer when red guard fails in strict mode", async () => {
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

    const runSubtask = vi.fn(async () => {});
    const guard = createGuard(
      [
        { phase: "red", passed: false, testExit: 0, output: "red bad" },
        { phase: "red", passed: true, testExit: 1, output: "red good" },
      ],
      [{ phase: "green", passed: true, testExit: 0, output: "green ok" }],
    );

    const manager = new TaskPipelineManager({
      runSubtask,
      guard,
      tddMode: "strict",
      maxRedRetries: 1,
    });

    const result = await manager.executePlan(plan);

    expect(guard.assertRed).toHaveBeenCalledTimes(2);
    expect(result.tddResults.filter((entry) => entry.phase === "red")).toHaveLength(2);
    expect(runSubtask).toHaveBeenCalledTimes(3);
  });

  it("fails pipeline when green guard exhausts retries in strict mode", async () => {
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

    const runSubtask = vi.fn(async () => {});
    const guard = createGuard(
      [{ phase: "red", passed: true, testExit: 1, output: "red ok" }],
      [
        { phase: "green", passed: false, testExit: 1, output: "green bad" },
        { phase: "green", passed: false, testExit: 1, output: "green bad" },
      ],
    );

    const manager = new TaskPipelineManager({
      runSubtask,
      guard,
      tddMode: "strict",
      maxGreenRetries: 1,
    });

    await expect(manager.executePlan(plan)).rejects.toThrow(/green guard failed/i);
    expect(guard.assertGreen).toHaveBeenCalledTimes(2);
  });

  it("does not block on failed guard in warn mode", async () => {
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

    const runSubtask = vi.fn(async () => {});
    const guard = createGuard(
      [{ phase: "red", passed: false, testExit: 0, output: "red bad" }],
      [{ phase: "green", passed: false, testExit: 1, output: "green bad" }],
    );

    const manager = new TaskPipelineManager({
      runSubtask,
      guard,
      tddMode: "warn",
    });

    const result = await manager.executePlan(plan);
    expect(result.tddResults).toHaveLength(2);
    expect(runSubtask).toHaveBeenCalledTimes(2);
  });

  it("skips guard checks in off mode", async () => {
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

    const runSubtask = vi.fn(async () => {});
    const guard = createGuard(
      [{ phase: "red", passed: true, testExit: 1, output: "red" }],
      [{ phase: "green", passed: true, testExit: 0, output: "green" }],
    );

    const manager = new TaskPipelineManager({
      runSubtask,
      guard,
      tddMode: "off",
    });

    const result = await manager.executePlan(plan);
    expect(result.tddResults).toHaveLength(0);
    expect(guard.assertRed).toHaveBeenCalledTimes(0);
    expect(guard.assertGreen).toHaveBeenCalledTimes(0);
  });
});
