import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import coordinatorPlugin from "@composio/ao-plugin-agent-coordinator";

describe("agent-coordinator (integration)", () => {
  const agent = coordinatorPlugin.create();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return validated plan from LLM (happy path)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  strategy: "tdd",
                  subtasks: [
                    { id: "task1", agentType: "developer", description: "Implement feature" },
                  ],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result: any = await agent.executeInline!({
      prompt: "Do it",

      issueId: "1",
      sessionId: "s1",
      projectConfig: {} as any,
      inlineConfig: {
        endpoint: "http://localhost:11434/v1/chat/completions",
        model: "llama3",
      },
    });

    expect(result.strategy).toBe("tdd");
    expect(result.subtasks[0].id).toBe("task1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should throw error when LLM response is invalid JSON (error path)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: "Oops not json",
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      agent.executeInline!({
        prompt: "Do it",

        issueId: "1",
        sessionId: "s1",
        projectConfig: {} as any,
        inlineConfig: {
          endpoint: "http://test",
          model: "test",
        },
      }),
    ).rejects.toThrow(/Invalid JSON/);
  });

  it("should throw error on circular dependencies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  strategy: "tdd",
                  subtasks: [
                    {
                      id: "task1",
                      agentType: "developer",
                      description: "Task 1",
                      dependsOn: ["task2"],
                    },
                    {
                      id: "task2",
                      agentType: "developer",
                      description: "Task 2",
                      dependsOn: ["task1"],
                    },
                  ],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      agent.executeInline!({
        prompt: "Do it",

        issueId: "1",
        sessionId: "s1",
        projectConfig: {} as any,
        inlineConfig: {
          endpoint: "http://test",
          model: "test",
        },
      }),
    ).rejects.toThrow(/Circular dependency/);
  });
});
