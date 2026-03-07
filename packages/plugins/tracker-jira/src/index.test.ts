import { describe, it, expect, vi, beforeEach } from "vitest";
import plugin from "./index.js";
import type { ProjectConfig } from "@composio/ao-core";

// Mock the global fetch object
global.fetch = vi.fn();

describe("tracker-jira plugin", () => {
  const mockProject: ProjectConfig = {
    name: "test-project",
    path: "/test",
    repo: "owner/repo",
    defaultBranch: "main",
    scm: { plugin: "github" },
    tracker: {
      plugin: "jira",
      host: "mycompany.atlassian.net",
      email: "bot@mycompany.com",
      token: "secret123",
      statusMap: {
        "new": "open",
        "progress": "in_progress",
        "customdone": "closed"
      }
    },
    sessionPrefix: "tp",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should match Tracker manifest standard", () => {
    expect(plugin.manifest.name).toBe("jira");
    expect(plugin.manifest.slot).toBe("tracker");
  });

  describe("issueUrl() and branchName()", () => {
    it("should construct proper Jira URLs", () => {
      const tracker = plugin.create();
      expect(tracker.issueUrl("PROJ-999", mockProject)).toBe("https://mycompany.atlassian.net/browse/PROJ-999");
    });

    it("should extract project prefix and sanitize to branch naming convention", () => {
      const tracker = plugin.create();
      expect(tracker.branchName("PR-1234", mockProject)).toBe("tp-pr-1234");
    });
  });

  describe("getIssue()", () => {
    it("should correctly fetch issue with standard API mapping", async () => {
      const tracker = plugin.create();

      const mockJiraResponse = {
        fields: {
          summary: "Fix Jira bugs",
          description: "This is a bug.",
          status: {
            statusCategory: { key: "new" }
          },
          assignee: { displayName: "John Doe" },
          labels: ["frontend"]
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockJiraResponse,
      });

      const issue = await tracker.getIssue("PROJ-100", mockProject);
      
      expect(issue).toEqual({
        id: "PROJ-100",
        title: "Fix Jira bugs",
        description: "This is a bug.",
        url: "https://mycompany.atlassian.net/browse/PROJ-100",
        state: "open",
        assignee: "John Doe",
        labels: ["frontend"],
      });
      
      expect(global.fetch).toHaveBeenCalledWith(
        "https://mycompany.atlassian.net/rest/api/2/issue/PROJ-100",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Authorization": expect.stringContaining("Basic ")
          })
        })
      );
    });

    it("should throw if configuration is absent", async () => {
      const tracker = plugin.create();
      
      // Empty config should trigger auth errors from env validation
      const badProject: ProjectConfig = { ...mockProject, tracker: { plugin: "jira" } };
      
      await expect(tracker.getIssue("NO-AUTH", badProject))
        .rejects.toThrow("Jira plugin requires JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN");
    });
  });

  describe("generatePrompt()", () => {
    it("returns neutral issue context by default", async () => {
      const tracker = plugin.create();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fields: {
            summary: "Playwright GUI coverage",
            description: "Add browser coverage for checkout.",
            status: { statusCategory: { key: "new" } },
            assignee: { displayName: "Jane Doe" },
            labels: ["mode:test-only"],
          },
        }),
      });

      const prompt = await tracker.generatePrompt("PROJ-101", mockProject);

      expect(prompt).toContain("Jira issue PROJ-101");
      expect(prompt).toContain("Playwright GUI coverage");
      expect(prompt).toContain("follow the orchestrator instructions");
      expect(prompt).not.toContain("Please implement");
    });
  });
});
