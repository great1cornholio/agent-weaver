import { describe, expect, it } from "vitest";
import { generateOrchestratorPrompt } from "../orchestrator-prompt.js";
import type { OrchestratorConfig, ProjectConfig } from "../types.js";
import { getDefaultConfig } from "../config.js";

describe("generateOrchestratorPrompt", () => {
  const mockConfig: OrchestratorConfig = {
    ...getDefaultConfig(),
    port: 3000,
  };

  const mockProject: ProjectConfig = {
    name: "TestProject",
    repo: "test/repo",
    defaultBranch: "main",
    sessionPrefix: "tp",
    path: "/test/path",
  };

  it("should generate a prompt with basic project info", () => {
    const prompt = generateOrchestratorPrompt({
      config: mockConfig,
      projectId: "test-id",
      project: mockProject,
    });

    expect(prompt).toContain("# TestProject Orchestrator");
    expect(prompt).toContain("- **Name**: TestProject");
    expect(prompt).toContain("- **Repository**: test/repo");
    expect(prompt).toContain("- **Default Branch**: main");
    expect(prompt).toContain("- **Session Prefix**: tp");
    expect(prompt).toContain("- **Local Path**: /test/path");
    expect(prompt).toContain("- **Dashboard Port**: 3000");
    expect(prompt).toContain("ao spawn test-id INT-1234");
    expect(prompt).toContain("http://localhost:3000");
    expect(prompt).not.toContain("## Automated Reactions");
  });

  it("should include automated reactions if configured", () => {
    const projectWithReactions: ProjectConfig = {
      ...mockProject,
      reactions: {
        "pr-review": {
          auto: true,
          action: "send-to-agent",
        },
        "ci-failure": {
          auto: true,
          action: "notify",
          priority: "urgent",
        },
      },
    };

    const prompt = generateOrchestratorPrompt({
      config: mockConfig,
      projectId: "test-id",
      project: projectWithReactions,
    });

    expect(prompt).toContain("## Automated Reactions");
    expect(prompt).toContain("- **pr-review**: Auto-sends instruction to agent");
    expect(prompt).toContain("- **ci-failure**: Notifies human (priority: urgent)");
  });

  it("should include project-specific rules if provided", () => {
    const projectWithRules: ProjectConfig = {
      ...mockProject,
      orchestratorRules: "Always run npm test before committing.",
    };

    const prompt = generateOrchestratorPrompt({
      config: mockConfig,
      projectId: "test-id",
      project: projectWithRules,
    });

    expect(prompt).toContain("## Project-Specific Rules");
    expect(prompt).toContain("Always run npm test before committing.");
  });
});
