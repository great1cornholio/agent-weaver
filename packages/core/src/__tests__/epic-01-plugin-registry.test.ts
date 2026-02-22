import { describe, it, expect } from "vitest";
import { createPluginRegistry } from "../plugin-registry.js";

describe("Epic 1 scope - built-in plugin coverage", () => {
  it("includes GitLab tracker/scm and Telegram notifier built-ins", async () => {
    const registry = createPluginRegistry();
    const importedPackages: string[] = [];

    await registry.loadBuiltins(undefined, async (pkg: string) => {
      importedPackages.push(pkg);
      return {
        manifest: {
          name: "mock",
          slot: "runtime",
          description: "mock",
          version: "0.0.0",
        },
        create: () => ({ name: "mock" }),
      };
    });

    expect(importedPackages).toContain("@composio/ao-plugin-tracker-gitlab");
    expect(importedPackages).toContain("@composio/ao-plugin-scm-gitlab");
    expect(importedPackages).toContain("@composio/ao-plugin-notifier-telegram");
  });

  it("loads default Epic 1 agent runtime primitives", async () => {
    const registry = createPluginRegistry();
    const importedPackages: string[] = [];

    await registry.loadBuiltins(undefined, async (pkg: string) => {
      importedPackages.push(pkg);
      return {
        manifest: {
          name: "mock",
          slot: "runtime",
          description: "mock",
          version: "0.0.0",
        },
        create: () => ({ name: "mock" }),
      };
    });

    expect(importedPackages).toContain("@composio/ao-plugin-agent-aider");
    expect(importedPackages).toContain("@composio/ao-plugin-runtime-process");
    expect(importedPackages).toContain("@composio/ao-plugin-runtime-tmux");
  });
});