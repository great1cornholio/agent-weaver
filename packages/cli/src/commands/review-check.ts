import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import type { PRInfo, ProjectConfig, ReviewDecision, SCM, Session } from "@composio/ao-core";
import { loadConfig } from "@composio/ao-core";
import { exec } from "../lib/shell.js";
import { getPluginRegistry, getSessionManager } from "../lib/create-session-manager.js";

interface ReviewInfo {
  sessionId: string;
  tmuxTarget: string;
  prNumber: string;
  pendingComments: number;
  reviewDecision: ReviewDecision;
  scmName: string;
}

function parseProjectRepo(repo: string): { owner: string; name: string } {
  const parts = repo.split("/").filter(Boolean);
  if (parts.length < 2) {
    return { owner: "", name: "" };
  }
  return {
    owner: parts.slice(0, -1).join("/"),
    name: parts[parts.length - 1],
  };
}

function parseReviewNumber(prUrl: string): number | null {
  const match = prUrl.match(/\/(?:pull|merge_requests)\/(\d+)(?:$|[/?#])/);
  if (!match) return null;

  const number = parseInt(match[1], 10);
  return Number.isNaN(number) ? null : number;
}

function buildPRInfoFromSession(session: Session, project: ProjectConfig): PRInfo | null {
  const prUrl = session.metadata["pr"];
  if (!prUrl) return null;

  const number = parseReviewNumber(prUrl);
  if (number === null) return null;

  const repoParts = parseProjectRepo(project.repo);
  if (!repoParts.owner || !repoParts.name) return null;

  return {
    number,
    url: prUrl,
    title: "",
    owner: repoParts.owner,
    repo: repoParts.name,
    branch: session.branch ?? "",
    baseBranch: project.defaultBranch,
    isDraft: false,
  };
}

async function checkPRReviews(
  scm: SCM,
  prInfo: PRInfo,
): Promise<{ pendingComments: number; reviewDecision: ReviewDecision }> {
  try {
    const [reviewDecisionRaw, pendingCommentsRaw] = await Promise.all([
      scm.getReviewDecision(prInfo).catch(() => "none" as ReviewDecision),
      scm.getPendingComments(prInfo).catch(() => []),
    ]);

    const pendingComments = pendingCommentsRaw.length;
    const reviewDecision: ReviewDecision =
      reviewDecisionRaw === "none" && pendingComments > 0 ? "pending" : reviewDecisionRaw;

    return { pendingComments, reviewDecision };
  } catch {
    return { pendingComments: 0, reviewDecision: "none" };
  }
}

export function registerReviewCheck(program: Command): void {
  program
    .command("review-check")
    .description("Check PRs for review comments and trigger agents to address them")
    .argument("[project]", "Project ID (checks all if omitted)")
    .option("--dry-run", "Show what would be done without sending messages")
    .action(async (projectId: string | undefined, opts: { dryRun?: boolean }) => {
      const config = loadConfig();
      const registry = await getPluginRegistry(config);

      if (projectId && !config.projects[projectId]) {
        console.error(chalk.red(`Unknown project: ${projectId}`));
        process.exit(1);
      }

      const sm = await getSessionManager(config);
      const sessions = await sm.list(projectId);

      const spinner = ora("Checking PRs for review comments...").start();
      const results: ReviewInfo[] = [];

      for (const session of sessions) {
        const prUrl = session.metadata["pr"];
        if (!prUrl) continue;

        const project = config.projects[session.projectId];
        if (!project?.repo) continue;
        const scmName = project.scm?.plugin ?? "github";
        const scm = registry.get<SCM>("scm", scmName);
        if (!scm) continue;

        const prInfo = buildPRInfoFromSession(session, project);
        if (!prInfo) continue;

        const prNum = String(prInfo.number);

        try {
          const { pendingComments, reviewDecision } = await checkPRReviews(scm, prInfo);
          if (pendingComments > 0 || reviewDecision === "changes_requested") {
            results.push({
              sessionId: session.id,
              tmuxTarget: session.runtimeHandle?.id ?? session.id,
              prNumber: prNum,
              pendingComments,
              reviewDecision,
              scmName,
            });
          }
        } catch {
          // Skip PRs we can't access
        }
      }

      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.green("No pending review comments found."));
        return;
      }

      console.log(
        chalk.bold(
          `\nFound ${results.length} session${results.length > 1 ? "s" : ""} with pending reviews:\n`,
        ),
      );

      for (const result of results) {
        console.log(`  ${chalk.green(result.sessionId)}  PR #${result.prNumber}`);
        if (result.reviewDecision !== "none") {
          console.log(`    Decision: ${chalk.yellow(result.reviewDecision)}`);
        }
        if (result.pendingComments > 0) {
          console.log(`    Comments: ${chalk.yellow(String(result.pendingComments))}`);
        }

        if (!opts.dryRun) {
          try {
            // Interrupt busy agent and clear partial input before sending
            await exec("tmux", ["send-keys", "-t", result.tmuxTarget, "C-c"]);
            await new Promise((resolve) => setTimeout(resolve, 500));
            await exec("tmux", ["send-keys", "-t", result.tmuxTarget, "C-u"]);
            await new Promise((resolve) => setTimeout(resolve, 200));
            const reviewCmd =
              result.scmName === "gitlab" ? "glab mr view --comments" : "gh pr view --comments";
            const message = `There are review comments on your ${result.scmName === "gitlab" ? "MR" : "PR"}. Check with \`${reviewCmd}\` for details, address each comment, push fixes, and reply.`;
            await exec("tmux", ["send-keys", "-t", result.tmuxTarget, "-l", message]);
            await new Promise((resolve) => setTimeout(resolve, 200));
            await exec("tmux", ["send-keys", "-t", result.tmuxTarget, "Enter"]);
            console.log(chalk.green(`    -> Fix prompt sent`));
          } catch (err) {
            console.error(chalk.red(`    -> Failed to send: ${err}`));
          }
        } else {
          console.log(chalk.dim(`    (dry run — would send fix prompt)`));
        }
      }
      console.log();
    });
}
