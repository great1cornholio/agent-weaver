import {
  shellEscape,
  DEFAULT_READY_THRESHOLD_MS,
  type Agent,
  type AgentSessionInfo,
  type AgentLaunchConfig,
  type ActivityDetection,
  type ActivityState,
  type PluginModule,
  type RuntimeHandle,
  type Session,
  CompletionDetector,
} from "@composio/ao-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";

const execFileAsync = promisify(execFile);

// =============================================================================
// Aider Activity Detection Helpers
// =============================================================================

async function hasRecentCommits(workspacePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--since=60 seconds ago", "--format=%H"],
      { cwd: workspacePath, timeout: 5_000 },
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function getChatHistoryMtime(workspacePath: string): Promise<Date | null> {
  try {
    const chatFile = join(workspacePath, ".aider.chat.history.md");
    await access(chatFile, constants.R_OK);
    const stats = await stat(chatFile);
    return stats.mtime;
  } catch {
    return null;
  }
}

// =============================================================================
// Plugin Definition
// =============================================================================

export const manifest = {
  name: "aider",
  slot: "agent" as const,
  description: "Agent plugin: Aider (aider.chat)",
  version: "0.1.0",
};

export function createAiderAgent(): Agent {
  // Store detectors keyed by session id to preserve state across calls
  const detectors = new Map<string, CompletionDetector>();

  return {
    name: "aider",
    processName: "aider",

    getLaunchCommand(config: AgentLaunchConfig): string {
      const args: string[] = [
        "aider",
        "--yes-always",
        "--yes",
        "--auto-commits",
        "--no-show-model-warnings",
      ];
      if (config.prompt) {
        args.push("--message", shellEscape(config.prompt));
      }
      return args.join(" ");
    },

    getEnvironment(_config: AgentLaunchConfig): Record<string, string> {
      const env: Record<string, string> = {};
      const keys = ["AIDER_MODEL", "OPENAI_API_KEY", "OPENAI_API_BASE", "ANTHROPIC_API_KEY"];
      for (const k of keys) {
        if (process.env[k]) {
          env[k] = process.env[k]!;
        }
      }
      return env;
    },

    detectActivity(terminalOutput: string): ActivityState {
      if (!terminalOutput.trim()) return "idle";
      return "active";
    },

    async getActivityState(
      session: Session,
      readyThresholdMs?: number,
    ): Promise<ActivityDetection | null> {
      const threshold = readyThresholdMs ?? DEFAULT_READY_THRESHOLD_MS;
      const workspacePath = session.workspacePath;
      if (!workspacePath) return null;

      // Ensure detector exists for this session
      let detector = detectors.get(session.id);
      if (!detector) {
        detector = new CompletionDetector(workspacePath, 3600000, "developer");
        detectors.set(session.id, detector);
      }

      const exitedAt = new Date();
      let running = false;
      if (session.runtimeHandle) {
        running = await this.isProcessRunning(session.runtimeHandle);
      }

      if (!running && session.runtimeHandle) {
        // Fake exit code 0 or 1 roughly based on last state could be used here.
        // Since aider doesn't easily expose exit code via tmux we assume 0 for completion checks.
        detector.onProcessExit(0);
        const res = detector.evaluate();
        if (res.status === "completed") {
          // Can be mapped to exited but normally orchestrator picks it up
        }
        return { state: "exited", timestamp: exitedAt };
      }

      // 1) Evaluate state through completion detector signals
      const hasCommitsFast = await detector.checkGitDiff();
      const res = detector.evaluate();

      if (res.status === "completed") {
        return { state: "exited", timestamp: new Date() };
      }

      // Fallback heuristics:

      const hasCommits = await hasRecentCommits(workspacePath);
      if (hasCommits) return { state: "active" };

      const chatMtime = await getChatHistoryMtime(workspacePath);
      if (!chatMtime) {
        return null;
      }

      const ageMs = Date.now() - chatMtime.getTime();
      const activeWindowMs = Math.min(30_000, threshold);
      if (ageMs < activeWindowMs) return { state: "active", timestamp: chatMtime };
      if (ageMs < threshold) return { state: "ready", timestamp: chatMtime };
      return { state: "idle", timestamp: chatMtime };
    },

    async isProcessRunning(handle: RuntimeHandle): Promise<boolean> {
      try {
        if (handle.runtimeName === "tmux" && handle.id) {
          const { stdout: ttyOut } = await execFileAsync(
            "tmux",
            ["list-panes", "-t", handle.id, "-F", "#{pane_tty}"],
            { timeout: 5_000 },
          );
          const ttys = ttyOut
            .trim()
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean);
          if (ttys.length === 0) return false;

          const { stdout: psOut } = await execFileAsync("ps", ["-eo", "pid,tty,args"], {
            timeout: 30_000,
          });
          const ttySet = new Set(ttys.map((t) => t.replace(/^\/dev\//, "")));
          const processRe = /(?:^|\/)aider(?:\s|$)/;
          for (const line of psOut.split("\n")) {
            const cols = line.trimStart().split(/\s+/);
            if (cols.length < 3 || !ttySet.has(cols[1] ?? "")) continue;
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
  return createAiderAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
