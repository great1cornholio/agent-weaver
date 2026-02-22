import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPluginRegistry } from "../plugin-registry.js";
import type { PluginModule, PluginManifest, OrchestratorConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlugin(slot: PluginManifest["slot"], name: string): PluginModule {
  return {
    manifest: {
      name,
      slot,
      description: `Test ${slot} plugin: ${name}`,
      version: "0.0.1",
    },
    create: vi.fn((config?: Record<string, unknown>) => ({
      name,
      _config: config,
    })),
  };
}

function makeOrchestratorConfig(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
  return {
    projects: {},
    ...overrides,
  } as OrchestratorConfig;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPluginRegistry", () => {
  it("returns a registry object", () => {
    const registry = createPluginRegistry();
    expect(registry).toHaveProperty("register");
    expect(registry).toHaveProperty("get");
    expect(registry).toHaveProperty("list");
    expect(registry).toHaveProperty("loadBuiltins");
    expect(registry).toHaveProperty("loadFromConfig");
  });
});

describe("register + get", () => {
  it("registers and retrieves a plugin", () => {
    const registry = createPluginRegistry();
    const plugin = makePlugin("runtime", "tmux");

    registry.register(plugin);

    const instance = registry.get<{ name: string }>("runtime", "tmux");
    expect(instance).not.toBeNull();
    expect(instance!.name).toBe("tmux");
  });

  it("returns null for unregistered plugin", () => {
    const registry = createPluginRegistry();
    expect(registry.get("runtime", "nonexistent")).toBeNull();
  });

  it("passes config to plugin create()", () => {
    const registry = createPluginRegistry();
    const plugin = makePlugin("workspace", "worktree");

    registry.register(plugin, { worktreeDir: "/custom/path" });

    expect(plugin.create).toHaveBeenCalledWith({ worktreeDir: "/custom/path" });
    const instance = registry.get<{ _config: Record<string, unknown> }>("workspace", "worktree");
    expect(instance!._config).toEqual({ worktreeDir: "/custom/path" });
  });

  it("overwrites previously registered plugin with same slot:name", () => {
    const registry = createPluginRegistry();
    const plugin1 = makePlugin("runtime", "tmux");
    const plugin2 = makePlugin("runtime", "tmux");

    registry.register(plugin1);
    registry.register(plugin2);

    // Should call create on both
    expect(plugin1.create).toHaveBeenCalledTimes(1);
    expect(plugin2.create).toHaveBeenCalledTimes(1);

    // get() returns the latest
    const instance = registry.get<{ name: string }>("runtime", "tmux");
    expect(instance).not.toBeNull();
  });

  it("registers plugins in different slots independently", () => {
    const registry = createPluginRegistry();
    const runtimePlugin = makePlugin("runtime", "tmux");
    const workspacePlugin = makePlugin("workspace", "worktree");

    registry.register(runtimePlugin);
    registry.register(workspacePlugin);

    expect(registry.get("runtime", "tmux")).not.toBeNull();
    expect(registry.get("workspace", "worktree")).not.toBeNull();
    expect(registry.get("runtime", "worktree")).toBeNull();
    expect(registry.get("workspace", "tmux")).toBeNull();
  });
});

describe("list", () => {
  it("lists plugins in a given slot", () => {
    const registry = createPluginRegistry();
    registry.register(makePlugin("runtime", "tmux"));
    registry.register(makePlugin("runtime", "process"));
    registry.register(makePlugin("workspace", "worktree"));

    const runtimes = registry.list("runtime");
    expect(runtimes).toHaveLength(2);
    expect(runtimes.map((m) => m.name)).toContain("tmux");
    expect(runtimes.map((m) => m.name)).toContain("process");
  });

  it("returns empty array for slot with no plugins", () => {
    const registry = createPluginRegistry();
    expect(registry.list("notifier")).toEqual([]);
  });

  it("does not return plugins from other slots", () => {
    const registry = createPluginRegistry();
    registry.register(makePlugin("runtime", "tmux"));

    expect(registry.list("workspace")).toEqual([]);
  });
});

describe("loadBuiltins", () => {
  it("silently skips unavailable packages", async () => {
    const registry = createPluginRegistry();
    // loadBuiltins tries to import all built-in packages.
    // In the test environment, most are not resolvable — should not throw.
    await expect(registry.loadBuiltins()).resolves.toBeUndefined();
  });

  it("emits warning when built-in plugin import fails", async () => {
    const warnings: Array<{ code: string; moduleName: string }> = [];
    const registry = createPluginRegistry({
      onWarning: (warning) => {
        warnings.push({ code: warning.code, moduleName: warning.moduleName });
      },
    });

    const importFn = vi.fn(async (_pkg: string) => {
      throw new Error("missing");
    });

    await registry.loadBuiltins(undefined, importFn);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((warning) => warning.code === "builtin-import-failed")).toBe(true);
  });
});

describe("extractPluginConfig (via register with config)", () => {
  // extractPluginConfig is tested indirectly: we verify that register()
  // correctly passes config through, and that loadBuiltins() would call
  // extractPluginConfig for known slot:name pairs. The actual config
  // forwarding logic is validated in workspace plugin unit tests.

  it("register passes config to plugin create()", () => {
    const registry = createPluginRegistry();
    const plugin = makePlugin("workspace", "worktree");

    registry.register(plugin, { worktreeDir: "/custom/path" });

    expect(plugin.create).toHaveBeenCalledWith({ worktreeDir: "/custom/path" });
  });

  it("register passes undefined config when none provided", () => {
    const registry = createPluginRegistry();
    const plugin = makePlugin("workspace", "clone");

    registry.register(plugin);

    expect(plugin.create).toHaveBeenCalledWith(undefined);
  });
});

describe("loadFromConfig", () => {
  it("does not throw when no plugins are importable", async () => {
    const registry = createPluginRegistry();
    const config = makeOrchestratorConfig({});

    // loadFromConfig calls loadBuiltins internally, which may fail to
    // import packages in the test env — should still succeed gracefully
    await expect(registry.loadFromConfig(config)).resolves.toBeUndefined();
  });

  it("loads plugin declared as module string in config.plugins", async () => {
    const registry = createPluginRegistry();
    const customRuntime = makePlugin("runtime", "custom-runtime");

    const importFn = vi.fn(async (pkg: string) => {
      if (pkg === "custom-runtime-plugin") {
        return customRuntime;
      }
      throw new Error("not found");
    });

    const config = makeOrchestratorConfig({
      plugins: {
        runtime: ["custom-runtime-plugin"],
      },
    });

    await registry.loadFromConfig(config, importFn);
    expect(registry.get("runtime", "custom-runtime")).not.toBeNull();
  });

  it("passes inline plugin config when entry uses object form", async () => {
    const registry = createPluginRegistry();
    const create = vi.fn((config?: Record<string, unknown>) => ({
      name: "custom-notifier",
      _config: config,
    }));
    const customNotifier: PluginModule = {
      manifest: {
        name: "custom-notifier",
        slot: "notifier",
        description: "custom notifier",
        version: "0.0.1",
      },
      create,
    };

    const importFn = vi.fn(async (pkg: string) => {
      if (pkg === "custom-notifier-plugin") {
        return customNotifier;
      }
      throw new Error("not found");
    });

    const config = makeOrchestratorConfig({
      plugins: {
        notifier: [
          {
            module: "custom-notifier-plugin",
            config: { endpoint: "https://example.test/webhook" },
          },
        ],
      },
    });

    await registry.loadFromConfig(config, importFn);

    const instance = registry.get<{ _config?: Record<string, unknown> }>("notifier", "custom-notifier");
    expect(instance?._config).toEqual({ endpoint: "https://example.test/webhook" });
  });

  it("ignores plugin when declared slot does not match manifest slot", async () => {
    const registry = createPluginRegistry();
    const wrongSlotPlugin = makePlugin("notifier", "slot-mismatch");

    const importFn = vi.fn(async (pkg: string) => {
      if (pkg === "mismatch-plugin") {
        return wrongSlotPlugin;
      }
      throw new Error("not found");
    });

    const config = makeOrchestratorConfig({
      plugins: {
        runtime: ["mismatch-plugin"],
      },
    });

    await registry.loadFromConfig(config, importFn);
    expect(registry.get("runtime", "slot-mismatch")).toBeNull();
    expect(registry.get("notifier", "slot-mismatch")).toBeNull();
  });

  it("emits warning when configured plugin slot does not match manifest", async () => {
    const warnings: Array<{ code: string; moduleName: string; slot: string }> = [];
    const registry = createPluginRegistry({
      onWarning: (warning) => {
        warnings.push({
          code: warning.code,
          moduleName: warning.moduleName,
          slot: warning.slot,
        });
      },
    });

    const wrongSlotPlugin = makePlugin("notifier", "slot-mismatch");
    const importFn = vi.fn(async (pkg: string) => {
      if (pkg === "mismatch-plugin") {
        return wrongSlotPlugin;
      }
      throw new Error("not found");
    });

    const config = makeOrchestratorConfig({
      plugins: {
        runtime: ["mismatch-plugin"],
      },
    });

    await registry.loadFromConfig(config, importFn);
    expect(
      warnings.some(
        (warning) =>
          warning.code === "configured-slot-mismatch" &&
          warning.moduleName === "mismatch-plugin" &&
          warning.slot === "runtime",
      ),
    ).toBe(true);
  });

  it("emits warning when configured plugin import fails", async () => {
    const warnings: Array<{ code: string; moduleName: string; slot: string }> = [];
    const registry = createPluginRegistry({
      onWarning: (warning) => {
        warnings.push({
          code: warning.code,
          moduleName: warning.moduleName,
          slot: warning.slot,
        });
      },
    });

    const importFn = vi.fn(async (pkg: string) => {
      if (pkg === "broken-plugin") {
        throw new Error("boom");
      }
      throw new Error("not found");
    });

    const config = makeOrchestratorConfig({
      plugins: {
        tracker: ["broken-plugin"],
      },
    });

    await registry.loadFromConfig(config, importFn);
    expect(
      warnings.some(
        (warning) =>
          warning.code === "configured-import-failed" &&
          warning.moduleName === "broken-plugin" &&
          warning.slot === "tracker",
      ),
    ).toBe(true);
  });
});
