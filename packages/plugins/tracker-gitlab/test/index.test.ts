import { describe, it, expect, beforeEach, vi } from "vitest";

const { glabMock } = vi.hoisted(() => ({ glabMock: vi.fn() }));

vi.mock("node:child_process", () => {
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: glabMock,
  });
  return { execFile };
});

import { create, manifest } from "../src/index.js";
import type { ProjectConfig } from "@composio/ao-core";

const project: ProjectConfig = {
  name: "test",
  repo: "group/repo",
  path: "/tmp/repo",
  defaultBranch: "main",
  sessionPrefix: "test",
};

function mockGlab(result: unknown) {
  glabMock.mockResolvedValueOnce({ stdout: JSON.stringify(result) });
}

function mockGlabRaw(stdout: string) {
  glabMock.mockResolvedValueOnce({ stdout });
}

const sampleIssue = {
  iid: 42,
  title: "Add health endpoint",
  description: "Add GET /health returning {status: ok}",
  web_url: "https://gitlab.com/group/repo/-/issues/42",
  state: "opened",
  labels: ["backend", "api"],
  assignees: [{ username: "alice" }],
};

describe("tracker-gitlab plugin", () => {
  let tracker: ReturnType<typeof create>;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = create();
  });

  describe("manifest", () => {
    it("has correct metadata", () => {
      expect(manifest.name).toBe("gitlab");
      expect(manifest.slot).toBe("tracker");
      expect(manifest.version).toBe("0.1.0");
    });
  });

  describe("getIssue", () => {
    it("maps GitLab issue payload to core Issue", async () => {
      mockGlab(sampleIssue);
      const issue = await tracker.getIssue("42", project);

      expect(issue).toEqual({
        id: "42",
        title: "Add health endpoint",
        description: "Add GET /health returning {status: ok}",
        url: "https://gitlab.com/group/repo/-/issues/42",
        state: "open",
        labels: ["backend", "api"],
        assignee: "alice",
      });
    });

    it("maps closed issue state", async () => {
      mockGlab({ ...sampleIssue, state: "closed" });
      const issue = await tracker.getIssue("42", project);
      expect(issue.state).toBe("closed");
    });

    it("handles missing description", async () => {
      mockGlab({ ...sampleIssue, description: null });
      const issue = await tracker.getIssue("42", project);
      expect(issue.description).toBe("");
    });

    it("handles no assignees", async () => {
      mockGlab({ ...sampleIssue, assignees: [] });
      const issue = await tracker.getIssue("42", project);
      expect(issue.assignee).toBeUndefined();
    });
  });

  describe("isCompleted", () => {
    it("returns true for closed issue", async () => {
      mockGlab({ ...sampleIssue, state: "closed" });
      await expect(tracker.isCompleted("42", project)).resolves.toBe(true);
    });

    it("returns false for opened issue", async () => {
      mockGlab(sampleIssue);
      await expect(tracker.isCompleted("42", project)).resolves.toBe(false);
    });
  });

  describe("issueUrl", () => {
    it("uses gitlab.com by default", () => {
      expect(tracker.issueUrl("42", project)).toBe("https://gitlab.com/group/repo/-/issues/42");
    });

    it("uses project tracker URL when configured", () => {
      const projectWithHost: ProjectConfig = {
        ...project,
        tracker: {
          plugin: "gitlab",
          url: "https://gitlab.acme.local/",
        },
      };

      expect(tracker.issueUrl("#42", projectWithHost)).toBe(
        "https://gitlab.acme.local/group/repo/-/issues/42",
      );
    });
  });

  describe("branchName", () => {
    it("generates feat/issue-N", () => {
      expect(tracker.branchName("#42", project)).toBe("feat/issue-42");
    });
  });

  describe("generatePrompt", () => {
    it("includes issue core fields", async () => {
      mockGlab(sampleIssue);
      const prompt = await tracker.generatePrompt("42", project);

      expect(prompt).toContain("GitLab issue #42: Add health endpoint");
      expect(prompt).toContain("https://gitlab.com/group/repo/-/issues/42");
      expect(prompt).toContain("backend, api");
      expect(prompt).toContain("Add GET /health returning {status: ok}");
    });
  });

  describe("listIssues", () => {
    it("passes opened state by default", async () => {
      mockGlab([]);
      await tracker.listIssues!({}, project);

      expect(glabMock).toHaveBeenCalledWith(
        "glab",
        expect.arrayContaining(["issue", "list", "--state", "opened"]),
        expect.any(Object),
      );
    });

    it("maps returned list", async () => {
      mockGlab([sampleIssue, { ...sampleIssue, iid: 77, title: "Another issue" }]);
      const issues = await tracker.listIssues!({ state: "all", limit: 2 }, project);

      expect(issues).toHaveLength(2);
      expect(issues[0]?.id).toBe("42");
      expect(issues[1]?.id).toBe("77");
    });
  });

  describe("updateIssue", () => {
    it("closes issue when state is closed", async () => {
      mockGlabRaw("");
      await tracker.updateIssue!("42", { state: "closed" }, project);

      expect(glabMock).toHaveBeenCalledWith(
        "glab",
        ["issue", "close", "42", "--repo", "group/repo"],
        expect.any(Object),
      );
    });

    it("adds comment note", async () => {
      mockGlabRaw("");
      await tracker.updateIssue!("42", { comment: "Please verify" }, project);

      expect(glabMock).toHaveBeenCalledWith(
        "glab",
        ["issue", "note", "42", "--repo", "group/repo", "--message", "Please verify"],
        expect.any(Object),
      );
    });
  });

  describe("createIssue", () => {
    it("creates and fetches issue details", async () => {
      mockGlabRaw("https://gitlab.com/group/repo/-/issues/88\n");
      mockGlab({ ...sampleIssue, iid: 88, title: "New issue" });

      const issue = await tracker.createIssue!(
        {
          title: "New issue",
          description: "body",
          labels: ["backend"],
          assignee: "alice",
        },
        project,
      );

      expect(issue.id).toBe("88");
      expect(issue.title).toBe("New issue");
    });
  });
});
