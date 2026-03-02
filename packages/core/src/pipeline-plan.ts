export type PipelineAgentType = "tester" | "developer" | "reviewer";

export interface Subtask {
  id: string;
  agentType: PipelineAgentType;
  description: string;
  dependsOn?: string[];
  files?: string[];
}

export interface SubtaskPlan {
  strategy: "tdd" | "hotfix" | "refactor";
  subtasks: Subtask[];
}

function buildSubtaskMap(plan: SubtaskPlan): Map<string, Subtask> {
  const map = new Map<string, Subtask>();
  for (const subtask of plan.subtasks) {
    if (!subtask.id.trim()) {
      throw new Error("Subtask id must be non-empty");
    }
    if (map.has(subtask.id)) {
      throw new Error(`Duplicate subtask id: ${subtask.id}`);
    }
    if (!subtask.description.trim()) {
      throw new Error(`Subtask ${subtask.id} has empty description`);
    }
    map.set(subtask.id, subtask);
  }
  return map;
}

export function validateSubtaskPlan(plan: SubtaskPlan): void {
  if (plan.subtasks.length === 0) {
    throw new Error("Subtask plan must contain at least one subtask");
  }

  const subtaskMap = buildSubtaskMap(plan);

  for (const subtask of plan.subtasks) {
    for (const depId of subtask.dependsOn ?? []) {
      if (!subtaskMap.has(depId)) {
        throw new Error(`Subtask ${subtask.id} depends on unknown subtask ${depId}`);
      }
      if (depId === subtask.id) {
        throw new Error(`Subtask ${subtask.id} cannot depend on itself`);
      }
    }
  }

  const state = new Map<string, "unvisited" | "visiting" | "visited">();
  for (const subtask of plan.subtasks) {
    state.set(subtask.id, "unvisited");
  }

  const visit = (subtaskId: string): void => {
    const current = state.get(subtaskId);
    if (current === "visiting") {
      throw new Error(`Circular dependency detected at ${subtaskId}`);
    }
    if (current === "visited") {
      return;
    }
    state.set(subtaskId, "visiting");
    const subtask = subtaskMap.get(subtaskId);
    if (!subtask) {
      throw new Error(`Unknown subtask ${subtaskId}`);
    }
    for (const depId of subtask.dependsOn ?? []) {
      visit(depId);
    }
    state.set(subtaskId, "visited");
  };

  for (const subtask of plan.subtasks) {
    visit(subtask.id);
  }
}

export function topologicalSortSubtasks(plan: SubtaskPlan): Subtask[] {
  validateSubtaskPlan(plan);

  const subtaskById = new Map(plan.subtasks.map((subtask) => [subtask.id, subtask]));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const subtask of plan.subtasks) {
    indegree.set(subtask.id, subtask.dependsOn?.length ?? 0);
    adjacency.set(subtask.id, []);
  }

  for (const subtask of plan.subtasks) {
    for (const depId of subtask.dependsOn ?? []) {
      const children = adjacency.get(depId);
      if (!children) {
        throw new Error(`Unknown dependency ${depId}`);
      }
      children.push(subtask.id);
    }
  }

  const queue: string[] = [];
  for (const subtask of plan.subtasks) {
    if ((indegree.get(subtask.id) ?? 0) === 0) {
      queue.push(subtask.id);
    }
  }

  const result: Subtask[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) {
      continue;
    }
    const subtask = subtaskById.get(id);
    if (!subtask) {
      throw new Error(`Unknown subtask ${id}`);
    }
    result.push(subtask);

    const children = adjacency.get(id) ?? [];
    for (const childId of children) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) {
        queue.push(childId);
      }
    }
  }

  if (result.length !== plan.subtasks.length) {
    throw new Error("Subtask plan contains a cycle");
  }

  return result;
}

export function buildExecutionLayers(plan: SubtaskPlan): Subtask[][] {
  validateSubtaskPlan(plan);

  const subtaskById = new Map(plan.subtasks.map((subtask) => [subtask.id, subtask]));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const subtask of plan.subtasks) {
    indegree.set(subtask.id, subtask.dependsOn?.length ?? 0);
    adjacency.set(subtask.id, []);
  }

  for (const subtask of plan.subtasks) {
    for (const depId of subtask.dependsOn ?? []) {
      const children = adjacency.get(depId);
      if (!children) {
        throw new Error(`Unknown dependency ${depId}`);
      }
      children.push(subtask.id);
    }
  }

  let frontier = plan.subtasks
    .filter((subtask) => (indegree.get(subtask.id) ?? 0) === 0)
    .map((subtask) => subtask.id);

  const layers: Subtask[][] = [];
  let visited = 0;

  while (frontier.length > 0) {
    const currentLayerIds = frontier;
    frontier = [];

    const layer = currentLayerIds.map((id) => {
      const subtask = subtaskById.get(id);
      if (!subtask) {
        throw new Error(`Unknown subtask ${id}`);
      }
      return subtask;
    });
    layers.push(layer);
    visited += layer.length;

    for (const id of currentLayerIds) {
      for (const childId of adjacency.get(id) ?? []) {
        const next = (indegree.get(childId) ?? 0) - 1;
        indegree.set(childId, next);
        if (next === 0) {
          frontier.push(childId);
        }
      }
    }
  }

  if (visited !== plan.subtasks.length) {
    throw new Error("Subtask plan contains a cycle");
  }

  return layers;
}
