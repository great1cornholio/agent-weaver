import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { VramScheduler, type SchedulerTask } from "../vram-scheduler.js";

function makeScheduler(statePath?: string): VramScheduler {
  return new VramScheduler(
    {
      local: {
        address: "localhost",
        models: {
          "qwen3-coder-30b": {
            endpoint: "http://localhost:8081/v1",
            vramGb: 18,
            maxSlots: 1,
          },
          "gpt-oss-120": {
            endpoint: "http://localhost:8082/v1",
            vramGb: 60,
            maxSlots: 1,
          },
        },
      },
    },
    {
      coordinator: { model: "gpt-oss-120", maxConcurrentPerHost: 1 },
      developer: { model: "qwen3-coder-30b", maxConcurrentPerHost: 1 },
    },
    {
      queueLookahead: 2,
      maxSkipsPerTask: 2,
      retryBackoff: 30,
      statePath,
    },
  );
}

describe("VramScheduler (Epic 5)", () => {
  it("uses queue lookahead when head task has no available slot", () => {
    const scheduler = makeScheduler();

    const first = scheduler.schedule([{ id: "dev-running", agentType: "developer" }]);
    expect("taskId" in first && first.taskId).toBe("dev-running");

    const queue: SchedulerTask[] = [
      { id: "dev-blocked", agentType: "developer" },
      { id: "coord-ready", agentType: "coordinator" },
    ];

    const second = scheduler.schedule(queue);
    expect("taskId" in second && second.taskId).toBe("coord-ready");
  });

  it("returns no_slots with retry_after when queue cannot be scheduled", () => {
    const scheduler = makeScheduler();

    const firstDev = scheduler.schedule([{ id: "dev-1", agentType: "developer" }]);
    const firstCoord = scheduler.schedule([{ id: "coord-1", agentType: "coordinator" }]);
    expect("taskId" in firstDev).toBe(true);
    expect("taskId" in firstCoord).toBe(true);

    const blocked = scheduler.schedule([
      { id: "dev-2", agentType: "developer" },
      { id: "coord-2", agentType: "coordinator" },
    ]);

    expect("error" in blocked && blocked.error).toBe("no_slots");
    expect("retryAfter" in blocked && blocked.retryAfter).toBe(30);
  });

  it("persists slot and skip state to disk and restores it", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ao-vram-scheduler-"));
    const statePath = join(tempDir, "scheduler-state.json");

    try {
      const scheduler = makeScheduler(statePath);

      scheduler.schedule([{ id: "dev-running", agentType: "developer" }]);
      scheduler.schedule([
        { id: "dev-queued", agentType: "developer" },
        { id: "coord-picked", agentType: "coordinator" },
      ]);

      const restored = makeScheduler(statePath);
      const snapshot = restored.snapshot();

      expect(snapshot.usedSlots.local["gpt-oss-120"]).toBe(1);
      expect(snapshot.skipCounts["dev-queued"]).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
