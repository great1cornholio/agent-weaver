import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

export class SessionWatcher {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /**
   * Waits for a session starting with \`prefix\` to hit 'completed' or 'failed'.
   */
  async waitForSessionCompletion(
    prefix: string,
    timeoutMs: number = 300_000,
  ): Promise<{ state: any; id: string }> {
    const start = Date.now();
    let sessionId: string | null = null;

    while (Date.now() - start < timeoutMs) {
      if (!sessionId) {
        const activeDir = join(this.dataDir, "sessions", "active");
        if (existsSync(activeDir)) {
          const files = await readdir(activeDir);
          const found = files.find((f) => f.includes(prefix));
          if (found) {
            sessionId = found.replace(".json", "");
          }
        }
      }

      if (sessionId) {
        // check state
        const activePath = join(this.dataDir, "sessions", "active", `${sessionId}.json`);
        if (existsSync(activePath)) {
          const data = JSON.parse(await readFile(activePath, "utf-8"));
          if (data.status === "completed" || data.status === "failed") {
            return { state: data, id: sessionId };
          }
        } else {
          // Might have been moved to archived or something else
          const archivedPath = join(this.dataDir, "sessions", "archived", `${sessionId}.json`);
          if (existsSync(archivedPath)) {
            const data = JSON.parse(await readFile(archivedPath, "utf-8"));
            return { state: data, id: sessionId };
          }
        }
      }

      await setTimeout(1000); // Poll every 1s
    }

    throw new Error(`Session ${prefix} did not complete within ${timeoutMs}ms.`);
  }

  async readSessionOutput(sessionId: string): Promise<string> {
    const activePath = join(this.dataDir, "sessions", "active", `${sessionId}.json`);
    if (existsSync(activePath)) {
      const data = JSON.parse(await readFile(activePath, "utf-8"));
      return data.result || "";
    }
    return "";
  }
}
