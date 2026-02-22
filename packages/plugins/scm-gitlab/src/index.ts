import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CI_STATUS,
  type PluginModule,
  type SCM,
  type Session,
  type ProjectConfig,
  type PRInfo,
  type PRState,
  type MergeMethod,
  type CICheck,
  type CIStatus,
  type Review,
  type ReviewDecision,
  type ReviewComment,
  type AutomatedComment,
  type MergeReadiness,
} from "@composio/ao-core";

const execFileAsync = promisify(execFile);

async function glab(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("glab", args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });
    return stdout.trim();
  } catch (err) {
    throw new Error(`glab ${args.slice(0, 3).join(" ")} failed: ${(err as Error).message}`, {
      cause: err,
    });
  }
}

function parseDate(value: string | undefined | null): Date {
  if (!value) return new Date(0);
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function repoFromProject(project: ProjectConfig): { owner: string; repo: string } {
  const parts = project.repo.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Invalid repo format "${project.repo}", expected "group/repo"`);
  }
  return {
    owner: parts.slice(0, -1).join("/"),
    repo: parts[parts.length - 1],
  };
}

function mapMrState(state: string): PRState {
  const normalized = state.toLowerCase();
  if (normalized === "merged") return "merged";
  if (normalized === "closed") return "closed";
  return "open";
}

function mapCiState(state: string): CICheck["status"] {
  const normalized = state.toLowerCase();
  if (normalized === "success") return "passed";
  if (normalized === "failed" || normalized === "canceled" || normalized === "manual") {
    return "failed";
  }
  if (normalized === "pending") return "pending";
  if (normalized === "running") return "running";
  if (normalized === "skipped") return "skipped";
  return "failed";
}

function mapReviewState(state: string): Review["state"] {
  const normalized = state.toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "changes_requested") return "changes_requested";
  if (normalized === "dismissed") return "dismissed";
  if (normalized === "pending") return "pending";
  return "commented";
}

function createGitLabSCM(): SCM {
  return {
    name: "gitlab",

    async detectPR(session: Session, project: ProjectConfig): Promise<PRInfo | null> {
      if (!session.branch) return null;

      const repoParts = repoFromProject(project);

      try {
        const raw = await glab([
          "mr",
          "list",
          "--repo",
          project.repo,
          "--source-branch",
          session.branch,
          "--output",
          "json",
        ]);

        const mrs: Array<{
          iid: number;
          web_url: string;
          title: string;
          source_branch: string;
          target_branch: string;
          draft: boolean;
        }> = JSON.parse(raw);

        if (!mrs[0]) return null;

        return {
          number: mrs[0].iid,
          url: mrs[0].web_url,
          title: mrs[0].title,
          owner: repoParts.owner,
          repo: repoParts.repo,
          branch: mrs[0].source_branch,
          baseBranch: mrs[0].target_branch,
          isDraft: Boolean(mrs[0].draft),
        };
      } catch {
        return null;
      }
    },

    async getPRState(pr: PRInfo): Promise<PRState> {
      const raw = await glab(["mr", "view", String(pr.number), "--repo", `${pr.owner}/${pr.repo}`, "--output", "json"]);
      const data: { state: string } = JSON.parse(raw);
      return mapMrState(data.state ?? "opened");
    },

    async getPRSummary(pr: PRInfo) {
      const raw = await glab(["mr", "view", String(pr.number), "--repo", `${pr.owner}/${pr.repo}`, "--output", "json"]);
      const data: {
        state: string;
        title: string;
        changes_count?: string | number;
      } = JSON.parse(raw);

      const changes = Number(data.changes_count ?? 0);
      return {
        state: mapMrState(data.state ?? "opened"),
        title: data.title ?? "",
        additions: Number.isFinite(changes) ? changes : 0,
        deletions: 0,
      };
    },

    async mergePR(pr: PRInfo, method: MergeMethod = "squash"): Promise<void> {
      const args = ["mr", "merge", String(pr.number), "--repo", `${pr.owner}/${pr.repo}`];
      if (method === "squash") {
        args.push("--squash");
      }
      await glab(args);
    },

    async closePR(pr: PRInfo): Promise<void> {
      await glab(["mr", "close", String(pr.number), "--repo", `${pr.owner}/${pr.repo}`]);
    },

    async getCIChecks(pr: PRInfo): Promise<CICheck[]> {
      try {
        const raw = await glab([
          "ci",
          "view",
          "--repo",
          `${pr.owner}/${pr.repo}`,
          "--merge-request",
          String(pr.number),
          "--output",
          "json",
        ]);

        const jobs: Array<{
          name: string;
          status: string;
          web_url?: string;
          started_at?: string;
          finished_at?: string;
        }> = JSON.parse(raw);

        return jobs.map((job) => ({
          name: job.name,
          status: mapCiState(job.status),
          url: job.web_url,
          conclusion: job.status,
          startedAt: job.started_at ? parseDate(job.started_at) : undefined,
          completedAt: job.finished_at ? parseDate(job.finished_at) : undefined,
        }));
      } catch (err) {
        throw new Error("Failed to fetch CI checks", { cause: err });
      }
    },

    async getCISummary(pr: PRInfo): Promise<CIStatus> {
      let checks: CICheck[];
      try {
        checks = await this.getCIChecks(pr);
      } catch {
        const state = await this.getPRState(pr).catch(() => "open" as PRState);
        if (state !== "open") return CI_STATUS.NONE;
        return CI_STATUS.FAILING;
      }

      if (checks.length === 0) return CI_STATUS.NONE;
      if (checks.some((check) => check.status === "failed")) return CI_STATUS.FAILING;
      if (checks.some((check) => check.status === "pending" || check.status === "running")) {
        return CI_STATUS.PENDING;
      }
      if (checks.some((check) => check.status === "passed")) return CI_STATUS.PASSING;
      return CI_STATUS.NONE;
    },

    async getReviews(pr: PRInfo): Promise<Review[]> {
      const raw = await glab(["mr", "view", String(pr.number), "--repo", `${pr.owner}/${pr.repo}`, "--output", "json"]);
      const data: {
        approvals?: {
          approved_by?: Array<{ user: { username: string }; created_at?: string }>;
        };
      } = JSON.parse(raw);

      const approvedBy = data.approvals?.approved_by ?? [];
      return approvedBy.map((entry) => ({
        author: entry.user.username,
        state: "approved",
        submittedAt: parseDate(entry.created_at),
      }));
    },

    async getReviewDecision(pr: PRInfo): Promise<ReviewDecision> {
      const reviews = await this.getReviews(pr);
      if (reviews.some((review) => review.state === "changes_requested")) {
        return "changes_requested";
      }
      if (reviews.some((review) => review.state === "approved")) {
        return "approved";
      }
      return "none";
    },

    async getPendingComments(pr: PRInfo): Promise<ReviewComment[]> {
      const raw = await glab(["mr", "view", String(pr.number), "--repo", `${pr.owner}/${pr.repo}`, "--comments"]);

      if (!raw) return [];

      return raw
        .split("\n\n")
        .filter((block) => block.trim().length > 0)
        .map((block, index) => ({
          id: `comment-${index + 1}`,
          author: "reviewer",
          body: block.trim(),
          isResolved: false,
          createdAt: new Date(),
          url: pr.url,
        }));
    },

    async getAutomatedComments(_pr: PRInfo): Promise<AutomatedComment[]> {
      return [];
    },

    async getMergeability(pr: PRInfo): Promise<MergeReadiness> {
      const ci = await this.getCISummary(pr);
      const review = await this.getReviewDecision(pr);
      const state = await this.getPRState(pr);

      const blockers: string[] = [];
      const ciPassing = ci === CI_STATUS.PASSING || ci === CI_STATUS.NONE;
      if (!ciPassing) blockers.push("CI is not passing");

      const approved = review === "approved";
      if (!approved) blockers.push("Review approval is required");

      const noConflicts = state === "open";
      if (!noConflicts) blockers.push("MR is not open");

      return {
        mergeable: ciPassing && approved && noConflicts,
        ciPassing,
        approved,
        noConflicts,
        blockers,
      };
    },
  };
}

export const manifest = {
  name: "gitlab",
  slot: "scm" as const,
  description: "SCM plugin: GitLab (MRs, CI, reviews)",
  version: "0.1.0",
};

export function create(): SCM {
  return createGitLabSCM();
}

export default { manifest, create } satisfies PluginModule<SCM>;