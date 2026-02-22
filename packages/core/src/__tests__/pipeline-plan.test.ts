import { describe, it, expect } from "vitest";
import {
  buildExecutionLayers,
  topologicalSortSubtasks,
  validateSubtaskPlan,
  type SubtaskPlan,
} from "../pipeline-plan.js";

describe("pipeline-plan", () => {
  it("validates a correct tester->developer->reviewer plan", () => {
    const plan: SubtaskPlan = {
      strategy: "tdd",
      subtasks: [
        { id: "subtask-0", agentType: "tester", description: "write tests" },
        {
          id: "subtask-1",
          agentType: "developer",
          description: "implement",
          dependsOn: ["subtask-0"],
        },
        {
          id: "subtask-2",
          agentType: "reviewer",
          description: "review",
          dependsOn: ["subtask-1"],
        },
      ],
    };

    expect(() => validateSubtaskPlan(plan)).not.toThrow();
  });

  it("rejects plans with unknown dependencies", () => {
    const plan: SubtaskPlan = {
      strategy: "tdd",
      subtasks: [
        {
          id: "subtask-0",
          agentType: "developer",
          description: "implement",
          dependsOn: ["subtask-404"],
        },
      ],
    };

    expect(() => validateSubtaskPlan(plan)).toThrow(/unknown subtask/i);
  });

  it("rejects plans with circular dependencies", () => {
    const plan: SubtaskPlan = {
      strategy: "tdd",
      subtasks: [
        {
          id: "subtask-0",
          agentType: "tester",
          description: "tests",
          dependsOn: ["subtask-1"],
        },
        {
          id: "subtask-1",
          agentType: "developer",
          description: "impl",
          dependsOn: ["subtask-0"],
        },
      ],
    };

    expect(() => validateSubtaskPlan(plan)).toThrow(/circular dependency/i);
  });

  it("sorts subtasks topologically", () => {
    const plan: SubtaskPlan = {
      strategy: "tdd",
      subtasks: [
        {
          id: "subtask-2",
          agentType: "reviewer",
          description: "review",
          dependsOn: ["subtask-1"],
        },
        {
          id: "subtask-1",
          agentType: "developer",
          description: "implement",
          dependsOn: ["subtask-0"],
        },
        { id: "subtask-0", agentType: "tester", description: "tests" },
      ],
    };

    const sorted = topologicalSortSubtasks(plan).map((subtask) => subtask.id);
    expect(sorted).toEqual(["subtask-0", "subtask-1", "subtask-2"]);
  });

  it("builds execution layers from dependencies", () => {
    const plan: SubtaskPlan = {
      strategy: "tdd",
      subtasks: [
        { id: "subtask-0", agentType: "tester", description: "tests api" },
        { id: "subtask-1", agentType: "tester", description: "tests ui" },
        {
          id: "subtask-2",
          agentType: "developer",
          description: "impl api",
          dependsOn: ["subtask-0"],
        },
        {
          id: "subtask-3",
          agentType: "developer",
          description: "impl ui",
          dependsOn: ["subtask-1"],
        },
        {
          id: "subtask-4",
          agentType: "reviewer",
          description: "review",
          dependsOn: ["subtask-2", "subtask-3"],
        },
      ],
    };

    const layers = buildExecutionLayers(plan).map((layer) => layer.map((subtask) => subtask.id));
    expect(layers).toEqual([
      ["subtask-0", "subtask-1"],
      ["subtask-2", "subtask-3"],
      ["subtask-4"],
    ]);
  });
});
