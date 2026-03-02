import type { VramScheduler } from "./vram-scheduler.js";
import type { HostConfig } from "./types.js";

export interface HostedAuth {
  type: string;
  token: string;
}

export interface SlotAllocation {
  model: string;
  host: string;
  endpoint: string;
  auth?: HostedAuth | null;
}

// Global state for local singleton client
let globalScheduler: VramScheduler | null = null;
let globalHostsConfig: Record<string, HostConfig> | null = null;
const getMaxRetries = () =>
  process.env.VRAM_MAX_RETRIES ? parseInt(process.env.VRAM_MAX_RETRIES) : 120; // 1 hr max at 30s per retry

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function initVramClient(
  schedulerInstance: VramScheduler,
  hostsConfig: Record<string, HostConfig>,
): void {
  globalScheduler = schedulerInstance;
  globalHostsConfig = hostsConfig;
}

export async function acquireSlot(
  model: string,
  agentType: string,
  sessionId?: string,
): Promise<SlotAllocation> {
  if (!globalScheduler || !globalHostsConfig) {
    throw new Error("VRAM Client is not initialized.");
  }

  const taskId = sessionId ?? `task-${Date.now()}`;
  let attempts = 0;

  while (attempts < getMaxRetries()) {
    const decision = globalScheduler.schedule([{ id: taskId, agentType }]);

    if (!("error" in decision)) {
      const hostConfig = globalHostsConfig[decision.host];
      const modelConfig = hostConfig?.models[decision.model];

      if (!hostConfig || !modelConfig) {
        throw new Error(
          `Configuration missing for host ${decision.host} or model ${decision.model}`,
        );
      }

      return {
        model: decision.model,
        host: decision.host,
        endpoint: modelConfig.endpoint,
        auth: hostConfig.auth as HostedAuth | undefined,
      };
    }

    if (decision.error === "no_slots") {
      const waitTime = (decision as any).retryAfter ?? 30;
      await delay(process.env.VRAM_MAX_RETRIES ? 1 : waitTime * 1000);
      attempts++;
    } else {
      throw new Error(`Failed to acquire slot: ${decision.error}`);
    }
  }

  throw new Error(`Failed to acquire VRAM slot after ${getMaxRetries()} retries.`);
}

export async function releaseSlot(
  model: string,
  host: string,
  agentType: string,
  sessionId?: string,
): Promise<void> {
  if (!globalScheduler) return;
  const taskId = sessionId ?? "unknown";
  globalScheduler.release(taskId, host, model, agentType);
}
