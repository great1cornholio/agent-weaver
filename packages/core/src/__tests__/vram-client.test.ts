import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initVramClient, acquireSlot, releaseSlot } from "../vram-client.js";
import type { VramScheduler } from "../vram-scheduler.js";
import type { HostConfig } from "../types.js";

describe("vram-client", () => {
  const mockScheduler = {
    schedule: vi.fn(),
    release: vi.fn(),
  } as unknown as VramScheduler;

  const mockHostsConfig: Record<string, HostConfig> = {
    host1: {
      address: "localhost",
      totalVramGb: 10,
      models: {
        model1: { endpoint: "http://host1/model1", vramGb: 5, maxSlots: 2 },
      },
    },
  };

  const originalEnv = process.env.VRAM_MAX_RETRIES;

  beforeEach(() => {
    vi.clearAllMocks();
    initVramClient(mockScheduler, mockHostsConfig);
    process.env.VRAM_MAX_RETRIES = "3";
  });

  afterEach(() => {
    // Reset to null to test uninitialized state initially
    initVramClient(null as any, null as any);
    if (originalEnv === undefined) {
      delete process.env.VRAM_MAX_RETRIES;
    } else {
      process.env.VRAM_MAX_RETRIES = originalEnv;
    }
  });

  it("throws acquire when not initialized", async () => {
    initVramClient(null as any, null as any);
    await expect(acquireSlot("model", "dev", "test-call")).rejects.toThrow(
      /VRAM Client is not initialized/,
    );
  });

  it("allows release when not initialized", async () => {
    initVramClient(null as any, null as any);
    await expect(releaseSlot("model", "host1", "dev", "test-call")).resolves.toBeUndefined();
  });

  it("returns slot on first try if scheduling succeeds", async () => {
    initVramClient(mockScheduler, mockHostsConfig);
    (mockScheduler.schedule as any).mockReturnValue({
      model: "model1",
      host: "host1",
    });

    const result = await acquireSlot("model1", "dev", "test-id");
    expect(result).toEqual({
      model: "model1",
      host: "host1",
      endpoint: "http://host1/model1",
      auth: undefined,
    });
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);
  });

  it("throws error if config is missing for scheduled host/model", async () => {
    initVramClient(mockScheduler, mockHostsConfig);
    (mockScheduler.schedule as any).mockReturnValue({
      model: "unknown_model",
      host: "host1",
    });

    await expect(acquireSlot("unknown_model", "dev", "test-id")).rejects.toThrow(
      /Configuration missing/,
    );
  });

  it("retries when scheduler returns no_slots and finally succeeds", async () => {
    initVramClient(mockScheduler, mockHostsConfig);
    (mockScheduler.schedule as any)
      .mockReturnValueOnce({ error: "no_slots", retryAfter: 1 })
      .mockReturnValueOnce({
        model: "model1",
        host: "host1",
      });

    const result = await acquireSlot("model1", "dev", "test-id");
    expect(result.host).toBe("host1");
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(2);
  });

  it("throws error after max retries when no_slots persists", async () => {
    initVramClient(mockScheduler, mockHostsConfig);
    (mockScheduler.schedule as any).mockReturnValue({ error: "no_slots", retryAfter: 1 });

    await expect(acquireSlot("model1", "dev", "test-id")).rejects.toThrow(
      /Failed to acquire VRAM slot after 3 retries/,
    );
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on other scheduler errors", async () => {
    initVramClient(mockScheduler, mockHostsConfig);
    (mockScheduler.schedule as any).mockReturnValue({ error: "unknown_error" });

    await expect(acquireSlot("model1", "dev", "test-id")).rejects.toThrow(
      /Failed to acquire slot: unknown_error/,
    );
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);
  });

  it("releases slot properly", async () => {
    initVramClient(mockScheduler, mockHostsConfig);
    await releaseSlot("model1", "host1", "dev", "test-id");
    expect(mockScheduler.release).toHaveBeenCalledWith("test-id", "host1", "model1", "dev");
  });
});
