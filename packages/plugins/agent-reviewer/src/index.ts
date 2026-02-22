import {
  shellEscape,
  type Agent,
  type AgentSessionInfo,
  type AgentLaunchConfig,
  type ActivityDetection,
  type ActivityState,
  type PluginModule,
  type RuntimeHandle,
  type Session,
} from "@composio/ao-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const manifest = {
  name: "reviewer",
  slot: "agent" as const,
  description: "Agent plugin: Reviewer",
  version: "0.1.0",
};

const REVIEWER_INSTRUCTION =
  "You are the reviewer agent. Analyze MR diff and return structured APPROVE or REQUEST_CHANGES output.";

function createReviewerAgent(): Agent {
  return {
    name: "reviewer",
    processName: "codex",

    getLaunchCommand(config: AgentLaunchConfig): string {
      const parts: string[] = ["codex"];

      if (config.permissions === "skip") {
        parts.push("--approval-mode", "full-auto");
      }

      if (config.model) {
        parts.push("--model", shellEscape(config.model));
      }

      if (config.systemPromptFile) {
        parts.push("--system-prompt", `\"$(cat ${shellEscape(config.systemPromptFile)})\"`);
      } else if (config.systemPrompt) {
        parts.push("--system-prompt", shellEscape(config.systemPrompt));
      } else {
        parts.push("--system-prompt", shellEscape(REVIEWER_INSTRUCTION));
      }

      if (config.prompt) {
        parts.push("--", shellEscape(config.prompt));
      }

      return parts.join(" ");
    },

    getEnvironment(config: AgentLaunchConfig): Record<string, string> {
      const env: Record<string, string> = {
        AO_SESSION_ID: config.sessionId,
        AO_AGENT_TYPE: "reviewer",
      };
      if (config.issueId) {
        env["AO_ISSUE_ID"] = config.issueId;
      }
      return env;
    },

    detectActivity(terminalOutput: string): ActivityState {
      if (!terminalOutput.trim()) {
        return "idle";
      }
      return "active";
    },

    async getActivityState(
      session: Session,
      _readyThresholdMs?: number,
    ): Promise<ActivityDetection | null> {
      const exitedAt = new Date();
      if (!session.runtimeHandle) {
        return { state: "exited", timestamp: exitedAt };
      }
      const running = await this.isProcessRunning(session.runtimeHandle);
      if (!running) {
        return { state: "exited", timestamp: exitedAt };
      }
      return null;
    },

    async isProcessRunning(handle: RuntimeHandle): Promise<boolean> {
      try {
        if (handle.runtimeName === "tmux" && handle.id) {
          const { stdout: ttyOut } = await execFileAsync(
            "tmux",
            ["list-panes", "-t", handle.id, "-F", "#{pane_tty}"],
            { timeout: 30_000 },
          );
          const ttys = ttyOut
            .trim()
            .split("\n")
            .map((tty) => tty.trim())
            .filter(Boolean);
          if (ttys.length === 0) {
            return false;
          }

          const { stdout: psOut } = await execFileAsync("ps", ["-eo", "pid,tty,args"], {
            timeout: 30_000,
          });
          const ttySet = new Set(ttys.map((tty) => tty.replace(/^\/dev\//, "")));
          const processRe = /(?:^|\/)codex(?:\s|$)/;
          for (const line of psOut.split("\n")) {
            const cols = line.trimStart().split(/\s+/);
            if (cols.length < 3 || !ttySet.has(cols[1] ?? "")) {
              continue;
            }
            const args = cols.slice(2).join(" ");
            if (processRe.test(args)) {
              return true;
            }
          }
          return false;
        }

        const rawPid = handle.data["pid"];
        const pid = typeof rawPid === "number" ? rawPid : Number(rawPid);
        if (Number.isFinite(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
            return true;
          } catch (err: unknown) {
            if (err instanceof Error && "code" in err && err.code === "EPERM") {
              return true;
            }
            return false;
          }
        }

        return false;
      } catch {
        return false;
      }
    },

    async getSessionInfo(_session: Session): Promise<AgentSessionInfo | null> {
      return null;
    },
  };
}

export function create(): Agent {
  return createReviewerAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
