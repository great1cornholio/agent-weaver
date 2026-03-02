import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import reviewerPlugin from "@composio/ao-plugin-agent-reviewer";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("node:child_process", () => {
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: execFileMock,
  });
  return { execFile };
});

describe("agent-reviewer (integration)", () => {
  const agent = reviewerPlugin.create();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return validated review from LLM and post comments (happy path)", async () => {
    execFileMock.mockImplementation(async (cmd, args) => {
      if (cmd === "glab" && args[0] === "mr" && args[1] === "diff")
        return { stdout: "diff --git a/file.ts b/file.ts\n+some change" };
      return { stdout: "" };
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "REQUEST_CHANGES",
                  summary: "Need some changes",
                  tddCompliance: false,
                  comments: [{ path: "file.ts", line: 10, body: "Add a test here" }],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: any = await agent.executeInline!({
      prompt: "Review it",

      issueId: "1",
      sessionId: "s1",
      projectConfig: { path: "/tmp/repo" } as any,
      inlineConfig: {
        endpoint: "http://test/chat/completions",
        model: "llama3",
      },
    });

    expect(result.decision).toBe("REQUEST_CHANGES");
    expect(result.tddCompliance).toBe(false);
    expect(result.comments[0].path).toBe("file.ts");

    expect(execFileMock).toHaveBeenCalledWith(
      "glab",
      ["mr", "diff"],
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "glab",
      ["mr", "note", "-m", "File: file.ts:10\n\nAdd a test here"],
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
  });

  it("should auto-approve when diff is empty", async () => {
    execFileMock.mockImplementation(async () => {
      return { stdout: "  \n  " };
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result: any = await agent.executeInline!({
      prompt: "Review it",

      issueId: "1",
      sessionId: "s1",
      projectConfig: { path: "/tmp/repo", defaultBranch: "main" } as any,
      inlineConfig: { endpoint: "http://test", model: "test" },
    });

    expect(result.decision).toBe("APPROVE");
    expect(result.summary).toBe("No changes.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should fallback to git diff when glab fails", async () => {
    execFileMock.mockImplementation(async (cmd, args) => {
      if (cmd === "glab" && args[0] === "mr" && args[1] === "diff") throw new Error("glab fail");
      if (cmd === "git" && args[0] === "diff") return { stdout: "diff from git" };
      return { stdout: "" };
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "APPROVE",
                  summary: "Looks good",
                  tddCompliance: true,
                  comments: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: any = await agent.executeInline!({
      prompt: "Review it",

      issueId: "1",
      sessionId: "s1",
      projectConfig: { path: "/tmp/repo", defaultBranch: "main" } as any,
      inlineConfig: { endpoint: "http://test", model: "test" },
    });

    expect(result.decision).toBe("APPROVE");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["diff", "main"],
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
  });

  it("should throw error when LLM gives invalid JSON", async () => {
    execFileMock.mockImplementation(async () => ({ stdout: "diff" }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "invalid" } }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      agent.executeInline!({
        prompt: "Review it",

        issueId: "1",
        sessionId: "s1",
        projectConfig: { path: "/tmp/repo" } as any,
        inlineConfig: { endpoint: "http://test", model: "test" },
      }),
    ).rejects.toThrow(/Invalid JSON/);
  });
});
