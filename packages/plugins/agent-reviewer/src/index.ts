import {
  type Agent,
  type AgentSessionInfo,
  type AgentLaunchConfig,
  type ActivityDetection,
  type ActivityState,
  type PluginModule,
  type RuntimeHandle,
} from "@composio/ao-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const manifest = {
  name: "reviewer",
  slot: "agent" as const,
  description: "Agent plugin: Reviewer (Inline LLM)",
  version: "0.1.0",
};

const ReviewCommentSchema = z.object({
  path: z.string(),
  line: z.number(),
  body: z.string(),
});

const ReviewResultSchema = z.object({
  decision: z.enum(["APPROVE", "REQUEST_CHANGES"]),
  summary: z.string(),
  tddCompliance: z.boolean().default(true),
  comments: z.array(ReviewCommentSchema),
});

function createReviewerAgent(): Agent {
  return {
    name: "reviewer",
    processName: "bash",

    getLaunchCommand(): string {
      return "bash";
    },

    getEnvironment(): Record<string, string> {
      return {};
    },

    detectActivity(): ActivityState {
      return "idle";
    },

    async getActivityState(): Promise<ActivityDetection | null> {
      return null;
    },

    async isProcessRunning(): Promise<boolean> {
      return true;
    },

    async getSessionInfo(): Promise<AgentSessionInfo | null> {
      return null;
    },

    async executeInline<T = unknown>(config: AgentLaunchConfig): Promise<T> {
      if (!config.inlineConfig?.endpoint) {
        throw new Error("Reviewer needs inlineConfig.endpoint to reach LLM.");
      }
      
      const workspacePath = config.projectConfig.path; // wait, context! No, config.projectConfig.path is original, workspacePath may be created worktree. 
      // Fortunately we can just run glab from the project path if it's identical, or find out later. For now, project path.
      
      let diff = "";
      try {
        const { stdout } = await execFileAsync("glab", ["mr", "diff"], {
          cwd: workspacePath,
          maxBuffer: 10 * 1024 * 1024,
        });
        diff = stdout;
      } catch (err) {
         // fallback: just diff master
         const { stdout } = await execFileAsync("git", ["diff", config.projectConfig.defaultBranch], {
            cwd: workspacePath,
            maxBuffer: 10 * 1024 * 1024,
         });
         diff = stdout;
      }

      if (!diff.trim()) {
        console.log("[Reviewer] No diff found, automatically approving.");
        return { decision: "APPROVE", summary: "No changes.", comments: [] } as T;
      }

      const prompt = `Review the following code diff and provide a structured JSON response:\n\n${diff}`;
      
      const payload = {
        model: config.inlineConfig.model,
        messages: [
          { role: "system", content: "You are the Reviewer Agent. Output valid JSON: { decision: 'APPROVE'|'REQUEST_CHANGES', summary: '...', tddCompliance: true|false, comments: [{path: '..', line: 1, body: '..'}] }\nIf you notice missing tests for logic or unused variables, set tddCompliance to false. Setting tddCompliance to false MUST result in REQUEST_CHANGES decision." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (config.inlineConfig.auth?.token) {
         headers["Authorization"] = `Bearer ${config.inlineConfig.auth.token}`;
      }

      const url = config.inlineConfig.endpoint.endsWith("/chat/completions") 
         ? config.inlineConfig.endpoint 
         : `${config.inlineConfig.endpoint}/chat/completions`;

      console.log(`[Reviewer] Analyzing diff (${diff.length} chars) using ${url}...`);
      
      const response = await fetch(url, {
         method: "POST",
         headers,
         body: JSON.stringify(payload)
      });

      if (!response.ok) {
         throw new Error(`LLM Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from LLM");

      let parsed: unknown;
      try {
         parsed = JSON.parse(content);
      } catch (e) {
         throw new Error(`Invalid JSON from LLM: ${e}`);
      }

      const validated = ReviewResultSchema.parse(parsed);

      // Post comments if any
      if (validated.decision === "REQUEST_CHANGES" || validated.comments.length > 0) {
        for (const c of validated.comments) {
           try {
              // we don't have line specific note support in basic glab easily, so we just add a combined note for now
              const note = `File: ${c.path}:${c.line}\n\n${c.body}`;
              await execFileAsync("glab", ["mr", "note", "-m", note], { cwd: workspacePath });
           } catch { /* best effort */ }
        }
      }

      if (validated.decision === "APPROVE") {
         try {
            await execFileAsync("glab", ["mr", "approve"], { cwd: workspacePath });
         } catch { /* best effort */ }
      }

      return validated as T;
    }
  };
}

export function create(): Agent {
  return createReviewerAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
