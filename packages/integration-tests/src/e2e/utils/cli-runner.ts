import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

export class CLIRunner {
  private cliPath: string;

  constructor() {
    this.cliPath = resolve(__dirname, "../../../../cli/dist/index.js");
  }

  /**
   * Spawns the AO CLI as a completely detached system process
   * We don't wait for completion here if the user doesn't want to.
   */
  async runCommand(
    args: string[],
    cwd: string,
    env: Record<string, string> = {},
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolveResult, reject) => {
      let stdout = "";
      let stderr = "";

      const child: ChildProcess = spawn(process.execPath, [this.cliPath, ...args], {
        cwd,
        env: { ...process.env, ...env },
      });

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
        // Uncomment minimal debug logging if needed:
        // console.log(`[CLI STDOUT] ${data.toString().trim()}`);
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolveResult({ stdout, stderr, code });
      });

      child.on("error", (err) => {
        reject(err);
      });
    });
  }
}
