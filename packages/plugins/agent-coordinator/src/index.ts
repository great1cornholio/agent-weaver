import {
  type Agent,
  type AgentSessionInfo,
  type AgentLaunchConfig,
  type ActivityDetection,
  type ActivityState,
  type PluginModule,
  type RuntimeHandle,
  type Session,
} from "@composio/ao-core";
import { z } from "zod";

export const manifest = {
  name: "coordinator",
  slot: "agent" as const,
  description: "Agent plugin: Coordinator (Inline LLM)",
  version: "0.1.0",
};

const SubtaskSchema = z.object({
  id: z.string(),
  agentType: z.enum(["tester", "developer", "reviewer"]),
  description: z.string().min(5, "Description too short"),
  dependsOn: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
});

const SubtaskPlanSchema = z.object({
  strategy: z.enum(["tdd", "hotfix", "refactor"]),
  subtasks: z.array(SubtaskSchema).min(1, "Plan must have at least 1 subtask"),
});

function validateDependencies(plan: z.infer<typeof SubtaskPlanSchema>) {
  const map = new Map<string, string[]>();
  plan.subtasks.forEach((task) => map.set(task.id, task.dependsOn || []));

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(id: string) {
    if (visiting.has(id)) {
      throw new Error(`Circular dependency detected involving subtask: ${id}`);
    }
    if (visited.has(id)) return;

    visiting.add(id);
    const deps = map.get(id) || [];
    for (const dep of deps) {
      if (!map.has(dep)) {
        throw new Error(`Dependency ${dep} not found in plan for subtask ${id}`);
      }
      dfs(dep);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of map.keys()) {
    dfs(id);
  }
}

function createCoordinatorAgent(): Agent {
  return {
    name: "coordinator",
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
        throw new Error("Coordinator needs inlineConfig.endpoint to reach LLM.");
      }

      const prompt = config.prompt || "Create a simple implementation plan.";

      const payload = {
        model: config.inlineConfig.model,
        messages: [
          {
            role: "system",
            content:
              "You are the Coordinator Agent. Output valid JSON adhering to SubtaskPlan Schema: { strategy: 'tdd', subtasks: [{id:'..', agentType:'tester|developer|reviewer', description:'..'}] }",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (config.inlineConfig.auth?.token) {
        headers["Authorization"] = `Bearer ${config.inlineConfig.auth.token}`;
      }

      const url = config.inlineConfig.endpoint.endsWith("/chat/completions")
        ? config.inlineConfig.endpoint
        : `${config.inlineConfig.endpoint}/chat/completions`;

      console.log(`[Coordinator] Fetching plan from ${url}...`);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`LLM Error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from LLM");

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        throw new Error(`Invalid JSON from LLM: ${e}`);
      }

      const validated = SubtaskPlanSchema.parse(parsed);

      validateDependencies(validated);

      console.log(
        `[Coordinator] Returning validated plan with ${validated.subtasks.length} subtasks.`,
      );
      return validated as T;
    },
  };
}

export function create(): Agent {
  return createCoordinatorAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
