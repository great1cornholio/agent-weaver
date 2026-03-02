import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CompletionSignals {
  markerDetected: boolean;
  gitDiffNonEmpty: boolean;
  processExited: boolean;
  processExitCode: number | null;
}

export interface CompletionResult {
  status: "completed" | "failed" | "pending" | "timeout";
}

export class CompletionDetector {
  public signals: CompletionSignals = {
    markerDetected: false,
    gitDiffNonEmpty: false,
    processExited: false,
    processExitCode: null,
  };

  private targetMarker: string;

  constructor(
    public readonly workspacePath: string,
    public readonly timeoutMs: number = 3600000,
    public readonly agentType: string = "developer",
  ) {
    this.targetMarker = agentType === "tester" ? "TESTS_DONE" : "TASK_DONE";
  }

  onStdoutLine(line: string): void {
    if (line.includes(this.targetMarker)) {
      this.signals.markerDetected = true;
    }
  }

  onProcessExit(code: number): void {
    this.signals.processExited = true;
    this.signals.processExitCode = code;
  }

  async checkGitDiff(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("git", ["diff", "HEAD~1", "--name-only"], {
        cwd: this.workspacePath,
        timeout: 10000,
      });
      this.signals.gitDiffNonEmpty = stdout.trim().length > 0;
      return this.signals.gitDiffNonEmpty;
    } catch {
      // In case HEAD~1 doesn't exist (e.g. first commit) or git fails, just use status
      try {
        const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
          cwd: this.workspacePath,
          timeout: 10000,
        });
        this.signals.gitDiffNonEmpty = stdout.trim().length > 0;
        return this.signals.gitDiffNonEmpty;
      } catch {
        return false;
      }
    }
  }

  evaluate(): CompletionResult {
    // Failure -> process crashed
    if (this.signals.processExited && this.signals.processExitCode !== 0) {
      return { status: "failed" };
    }

    // Success -> process gracefully exited and either has marker or changes
    if (
      this.signals.processExited &&
      this.signals.processExitCode === 0 &&
      (this.signals.markerDetected || this.signals.gitDiffNonEmpty)
    ) {
      return { status: "completed" };
    }

    // Success -> marker detected plus some signal
    if (
      this.signals.markerDetected &&
      (this.signals.gitDiffNonEmpty || this.signals.processExited)
    ) {
      return { status: "completed" };
    }

    // Timeout handled by invoker via Date.now(), or we can just say "pending"
    return { status: "pending" };
  }
}
