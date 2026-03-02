import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { resolveTestCommand } from "../test-command.js";
import type { ProjectConfig } from "../types.js";

describe("resolveTestCommand", () => {
  let tempDir: string;
  let project: ProjectConfig;

  beforeEach(() => {
    tempDir = join(tmpdir(), `ao-test-command-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    project = {
      name: "Test",
      repo: "org/test",
      path: tempDir,
      defaultBranch: "main",
      sessionPrefix: "tst",
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("uses AGENTS.md Test command when present", () => {
    writeFileSync(join(tempDir, "AGENTS.md"), "# Rules\nTest command: npm run test:ci\n", "utf-8");
    project.testCmd = "pnpm test";

    const resolved = resolveTestCommand(project, tempDir);
    expect(resolved).toEqual({ command: "npm run test:ci", source: "agents" });
  });

  it("falls back to project testCmd when AGENTS.md has no command", () => {
    writeFileSync(join(tempDir, "AGENTS.md"), "# Rules\nNo command here\n", "utf-8");
    project.testCmd = "pnpm test";

    const resolved = resolveTestCommand(project, tempDir);
    expect(resolved).toEqual({ command: "pnpm test", source: "project" });
  });

  it("uses default when AGENTS.md and project testCmd are missing", () => {
    const resolved = resolveTestCommand(project, tempDir);
    expect(resolved).toEqual({ command: "pytest -x --tb=short", source: "default" });
  });

  it("parses Test command case-insensitively", () => {
    writeFileSync(join(tempDir, "AGENTS.md"), "test COMMAND: go test ./...\n", "utf-8");

    const resolved = resolveTestCommand(project, tempDir);
    expect(resolved).toEqual({ command: "go test ./...", source: "agents" });
  });
});
