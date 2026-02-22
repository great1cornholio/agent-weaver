import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PRInfo, ProjectConfig, Session } from "@composio/ao-core";

const { glabMock } = vi.hoisted(() => ({ glabMock: vi.fn() }));

vi.mock("node:child_process", () => {
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: glabMock,
  });
  return { execFile };
});

import { create, manifest } from "../src/index.js";

const pr: PRInfo = {
  number: 7,
  url: "https://gitlab.com/group/repo/-/merge_requests/7",
  title: "feat: add health endpoint",
  owner: "group",
  repo: "repo",
  branch: "feature/issue-1",
  baseBranch: "main",
  isDraft: false,
};

const project: ProjectConfig = {
  name: "test",
  repo: "group/repo",
  path: "/tmp/repo",
  defaultBranch: "main",
  sessionPrefix: "tst",
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "tst-1",
    projectId: "test-project",
    status: "working",
    activity: "active",
    branch: "feature/issue-1",
    issueId: "1",
    pr: null,
    workspacePath: "/tmp/repo",
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

function mockGlab(result: unknown): void {
  glabMock.mockResolvedValueOnce({ stdout: JSON.stringify(result) });
}

describe("scm-gitlab plugin", () => {
  let scm: ReturnType<typeof create>;

  beforeEach(() => {
    vi.clearAllMocks();
    scm = create();
  });

  it("has correct manifest", () => {
    expect(manifest).toEqual({
      name: "gitlab",
      slot: "scm",
      description: "SCM plugin: GitLab (MRs, CI, reviews)",
      version: "0.1.0",
    });
  });

  it("detects MR for branch", async () => {
    mockGlab([
      {
        iid: 7,
        web_url: "https://gitlab.com/group/repo/-/merge_requests/7",
        title: "feat: add health endpoint",
        source_branch: "feature/issue-1",
        target_branch: "main",
        draft: false,
      },
    ]);

    const detected = await scm.detectPR(makeSession(), project);

    expect(detected).toEqual(pr);
  });

  it("maps PR state from GitLab", async () => {
    mockGlab({ state: "merged" });
    await expect(scm.getPRState(pr)).resolves.toBe("merged");
  });

  it("maps CI checks and summary", async () => {
    mockGlab([
      { name: "pytest", status: "success" },
      { name: "lint", status: "pending" },
    ]);

    const checks = await scm.getCIChecks(pr);
    expect(checks[0]?.status).toBe("passed");
    expect(checks[1]?.status).toBe("pending");

    mockGlab([
      { name: "pytest", status: "success" },
      { name: "lint", status: "success" },
    ]);
    await expect(scm.getCISummary(pr)).resolves.toBe("passing");
  });

  it("maps approvals to review decision", async () => {
    mockGlab({ approvals: { approved_by: [{ user: { username: "alice" } }] } });
    await expect(scm.getReviewDecision(pr)).resolves.toBe("approved");
  });

  it("reports mergeability based on ci+approval", async () => {
    mockGlab([{ name: "pytest", status: "success" }]);
    mockGlab({ approvals: { approved_by: [{ user: { username: "alice" } }] } });
    mockGlab({ state: "opened" });

    const result = await scm.getMergeability(pr);
    expect(result.mergeable).toBe(true);
    expect(result.blockers).toEqual([]);
  });
});