import type { Tracker, ProjectConfig, Issue, PluginModule, TrackerConfig } from "@composio/ao-core";

const NAME = "jira";

export const manifest = {
  name: NAME,
  version: "0.1.0",
  description: "Tracker plugin for Jira (Cloud only via native fetch)",
  slot: "tracker" as const,
};

function getJiraConfig(config?: TrackerConfig) {
  const host = typeof config?.host === "string" ? config.host : process.env.JIRA_HOST;
  const email = typeof config?.email === "string" ? config.email : process.env.JIRA_EMAIL;
  const token = typeof config?.token === "string" ? config.token : process.env.JIRA_API_TOKEN;

  if (!host || !email || !token) {
    throw new Error(
      "Jira plugin requires JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN. Set them in ENV or 'projects.<name>.tracker'.",
    );
  }

  // Generate Base64 Auth header
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

  return { host, authHeader };
}

function normalizeState(statusCategoryKey: string, customMap?: Record<string, string>): Issue["state"] {
  if (customMap && customMap[statusCategoryKey]) {
    const mapped = customMap[statusCategoryKey];
    if (["open", "in_progress", "closed", "cancelled"].includes(mapped)) {
      return mapped as Issue["state"];
    }
  }

  // Fallback to Jira's standard statusCategory keys
  switch (statusCategoryKey) {
    case "new":
      return "open";
    case "indeterminate":
      return "in_progress";
    case "done":
      return "closed";
    default:
      return "open";
  }
}

async function fetchJira(endpoint: string, authHeader: string): Promise<any> {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json",
    }
  });

  if (!response.ok) {
    throw new Error(`Jira API failed: ${response.status} ${response.statusText} (${endpoint})`);
  }

  return response.json();
}

export function create(): Tracker {
  return {
    name: NAME,

    async getIssue(identifier: string, project: ProjectConfig): Promise<Issue> {
      const { host, authHeader } = getJiraConfig(project.tracker);
      
      const endpoint = `https://${host}/rest/api/2/issue/${identifier}`;
      const data = await fetchJira(endpoint, authHeader);

      const title = data?.fields?.summary || "Untitled Jira Task";
      const description = data?.fields?.description || "No description provided.";
      
      const statusCategoryKey = data?.fields?.status?.statusCategory?.key || "new";
      const customStatusMap = project.tracker?.statusMap as Record<string, string> | undefined;
      const state = normalizeState(statusCategoryKey, customStatusMap);

      const assignee = data?.fields?.assignee?.displayName || undefined;
      const labels = data?.fields?.labels || [];

      return {
        id: identifier,
        title,
        description,
        url: this.issueUrl(identifier, project),
        state,
        assignee,
        labels,
      };
    },

    async isCompleted(identifier: string, project: ProjectConfig): Promise<boolean> {
      const issue = await this.getIssue(identifier, project);
      return issue.state === "closed" || issue.state === "cancelled";
    },

    issueUrl(identifier: string, project: ProjectConfig): string {
      const { host } = getJiraConfig(project.tracker);
      return `https://${host}/browse/${identifier}`;
    },

    branchName(identifier: string, project: ProjectConfig): string {
      const prefix = typeof project.sessionPrefix === "string" ? project.sessionPrefix : project.name;
      return `${prefix}-${identifier.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}`;
    },

    async generatePrompt(identifier: string, project: ProjectConfig): Promise<string> {
      const issue = await this.getIssue(identifier, project);

      const template = typeof project.tracker?.promptTemplate === "string"
        ? project.tracker.promptTemplate
        : `Jira issue {id}

## Goal
{title}

## Description
{description}

{link}

Use this issue as task context and follow the orchestrator instructions.
`;

      return template
        .replace("{id}", issue.id)
        .replace("{title}", issue.title)
        .replace("{description}", issue.description)
        .replace("{link}", issue.url);
    },
  };
}

export default { manifest, create } satisfies PluginModule<Tracker>;
