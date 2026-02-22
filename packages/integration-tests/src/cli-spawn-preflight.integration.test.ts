import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliDistPath = "/home/rascal/agent-weaver/packages/cli/dist/index.js";

describe.skipIf(!existsSync(cliDistPath))("CLI spawn preflight (integration)", () => {
  const cleanupRoots = new Set<string>();

  afterAll(async () => {
    for (const root of cleanupRoots) {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("fails fast when Linear issue spawn is missing required API keys", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ao-cli-preflight-"));
    cleanupRoots.add(tempRoot);

    const repoPath = join(tempRoot, "repo");
    await writeFile(
      join(tempRoot, "agent-orchestrator.yaml"),
      [
        "defaults:",
        "  runtime: process",
        "  agent: claude-code",
        "  workspace: clone",
        "projects:",
        "  smoke-project:",
        "    repo: org/repo",
        `    path: ${repoPath}`,
        "    tracker:",
        "      plugin: linear",
      ].join("\n"),
    );

    const env = {
      ...process.env,
      AO_CONFIG_PATH: join(tempRoot, "agent-orchestrator.yaml"),
      LINEAR_API_KEY: "",
      COMPOSIO_API_KEY: "",
    };

    const run = execFileAsync(
      "node",
      [cliDistPath, "spawn", "smoke-project", "INT-42"],
      {
        env,
        timeout: 20_000,
      },
    );

    await expect(run).rejects.toMatchObject({
      code: 1,
    });

    await run.catch((err: { stdout?: string; stderr?: string }) => {
      const output = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
      expect(output).toContain("tracker.linear.auth");
      expect(output).toContain("Missing required environment variable");
    });
  });
});
