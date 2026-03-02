import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentTypeConfig, HostConfig } from "./types.js";

export interface SchedulerTask {
  id: string;
  agentType: string;
}

export interface SchedulerDecision {
  taskId: string;
  host: string;
  model: string;
  retryAfter?: number;
}

export interface SchedulerNoSlots {
  error: "no_slots";
  retryAfter: number;
}

export interface SchedulerState {
  version: 1;
  usedSlots: Record<string, Record<string, number>>;
  activeAgentCounts: Record<string, Record<string, number>>;
  skipCounts: Record<string, number>;
}

export interface VramSchedulerOptions {
  queueLookahead?: number;
  maxSkipsPerTask?: number;
  retryBackoff?: number;
  statePath?: string;
}

function buildInitialSlots(hosts: Record<string, HostConfig>): Record<string, Record<string, number>> {
  const usedSlots: Record<string, Record<string, number>> = {};
  for (const [hostName, host] of Object.entries(hosts)) {
    usedSlots[hostName] = {};
    for (const modelName of Object.keys(host.models)) {
      usedSlots[hostName][modelName] = 0;
    }
  }
  return usedSlots;
}

function buildInitialAgentCounts(hosts: Record<string, HostConfig>): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const hostName of Object.keys(hosts)) {
    counts[hostName] = {};
  }
  return counts;
}

export class VramScheduler {
  private readonly hosts: Record<string, HostConfig>;
  private readonly agentTypes: Record<string, AgentTypeConfig>;
  private readonly queueLookahead: number;
  private readonly maxSkipsPerTask: number;
  private readonly retryBackoff: number;
  private readonly statePath?: string;

  private readonly usedSlots: Record<string, Record<string, number>>;
  private readonly activeAgentCounts: Record<string, Record<string, number>>;
  private readonly skipCounts: Record<string, number> = {};

  constructor(
    hosts: Record<string, HostConfig>,
    agentTypes: Record<string, AgentTypeConfig>,
    options: VramSchedulerOptions = {},
  ) {
    this.hosts = hosts;
    this.agentTypes = agentTypes;
    this.queueLookahead = options.queueLookahead ?? 5;
    this.maxSkipsPerTask = options.maxSkipsPerTask ?? 2;
    this.retryBackoff = options.retryBackoff ?? 30;
    this.statePath = options.statePath;

    this.usedSlots = buildInitialSlots(hosts);
    this.activeAgentCounts = buildInitialAgentCounts(hosts);

    this.loadState();
  }

  schedule(queue: SchedulerTask[]): SchedulerDecision | SchedulerNoSlots {
    if (queue.length === 0) {
      return { error: "no_slots", retryAfter: this.retryBackoff };
    }

    const forcedTask = queue.find((task) => (this.skipCounts[task.id] ?? 0) >= this.maxSkipsPerTask);
    if (forcedTask) {
      const forcedCandidate = this.findHostForTask(forcedTask);
      if (forcedCandidate) {
        this.markSelection(queue, forcedTask.id);
        return forcedCandidate;
      }
    }

    const maxIndex = Math.min(queue.length - 1, this.queueLookahead);
    for (let index = 0; index <= maxIndex; index += 1) {
      const task = queue[index];
      const candidate = this.findHostForTask(task);
      if (!candidate) {
        continue;
      }

      this.markSelection(queue, task.id);
      return candidate;
    }

    return { error: "no_slots", retryAfter: this.retryBackoff };
  }

  release(taskId: string, host: string, model: string, agentType: string): void {
    const currentModelCount = this.usedSlots[host]?.[model] ?? 0;
    this.usedSlots[host][model] = Math.max(0, currentModelCount - 1);

    const currentAgentCount = this.activeAgentCounts[host]?.[agentType] ?? 0;
    this.activeAgentCounts[host][agentType] = Math.max(0, currentAgentCount - 1);

    delete this.skipCounts[taskId];
    this.saveState();
  }

  snapshot(): SchedulerState {
    return {
      version: 1,
      usedSlots: JSON.parse(JSON.stringify(this.usedSlots)) as Record<string, Record<string, number>>,
      activeAgentCounts: JSON.parse(JSON.stringify(this.activeAgentCounts)) as Record<
        string,
        Record<string, number>
      >,
      skipCounts: { ...this.skipCounts },
    };
  }

  private findHostForTask(task: SchedulerTask): SchedulerDecision | null {
    const agentType = this.agentTypes[task.agentType];
    if (!agentType) {
      return null;
    }

    const model = agentType.model;
    for (const [hostName, host] of Object.entries(this.hosts)) {
      const hostModel = host.models[model];
      if (!hostModel) {
        continue;
      }

      const used = this.usedSlots[hostName]?.[model] ?? 0;
      if (used >= hostModel.maxSlots) {
        continue;
      }

      const maxPerHost = agentType.maxConcurrentPerHost;
      const active = this.activeAgentCounts[hostName]?.[task.agentType] ?? 0;
      if (maxPerHost !== undefined && active >= maxPerHost) {
        continue;
      }

      this.usedSlots[hostName][model] = used + 1;
      this.activeAgentCounts[hostName][task.agentType] = active + 1;
      this.saveState();

      return {
        taskId: task.id,
        host: hostName,
        model,
        retryAfter: this.retryBackoff,
      };
    }

    return null;
  }

  private markSelection(queue: SchedulerTask[], selectedTaskId: string): void {
    for (const task of queue) {
      if (task.id === selectedTaskId) {
        this.skipCounts[task.id] = 0;
        continue;
      }
      this.skipCounts[task.id] = (this.skipCounts[task.id] ?? 0) + 1;
    }
    this.saveState();
  }

  private loadState(): void {
    if (!this.statePath || !existsSync(this.statePath)) {
      return;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf-8")) as Partial<SchedulerState>;
      if (parsed.version !== 1) {
        return;
      }

      const persistedSlots = parsed.usedSlots ?? {};
      for (const [host, models] of Object.entries(persistedSlots)) {
        if (!this.usedSlots[host]) {
          continue;
        }
        for (const [model, value] of Object.entries(models)) {
          if (typeof value === "number" && this.usedSlots[host][model] !== undefined) {
            this.usedSlots[host][model] = Math.max(0, value);
          }
        }
      }

      const persistedActive = parsed.activeAgentCounts ?? {};
      for (const [host, counts] of Object.entries(persistedActive)) {
        if (!this.activeAgentCounts[host]) {
          continue;
        }
        for (const [agentType, value] of Object.entries(counts)) {
          if (typeof value === "number") {
            this.activeAgentCounts[host][agentType] = Math.max(0, value);
          }
        }
      }

      const persistedSkips = parsed.skipCounts ?? {};
      for (const [taskId, value] of Object.entries(persistedSkips)) {
        if (typeof value === "number") {
          this.skipCounts[taskId] = Math.max(0, value);
        }
      }
    } catch {
      // Ignore corrupted state and start clean
    }
  }

  private saveState(): void {
    if (!this.statePath) {
      return;
    }

    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.snapshot(), null, 2), "utf-8");
  }
}
