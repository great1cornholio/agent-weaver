const fs = require("fs");

const files = [
  "/home/rascal/agent-weaver/packages/integration-tests/src/epic-01-alpha-flow.integration.test.ts",
  "/home/rascal/agent-weaver/packages/integration-tests/src/epic-03-v1-flow.integration.test.ts",
  "/home/rascal/agent-weaver/packages/integration-tests/src/epic-05-vram-waiting.integration.test.ts",
  "/home/rascal/agent-weaver/packages/integration-tests/src/epic-07-gitlab-e2e.integration.test.ts",
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  if (!content.includes("getActivityState")) {
    content = content.replace(
      'detectActivity(): "active" {\n      return "active";\n    },',
      'detectActivity(): "active" {\n      return "active";\n    },\n    async getActivityState() {\n      return null;\n    },',
    );
  }
  if (!content.includes('notifiers: ["desktop"]')) {
    content = content.replace(
      'workspace: "worktree",\n    },',
      'workspace: "worktree",\n      notifiers: ["desktop"],\n    },',
    );
  }
  fs.writeFileSync(file, content);
}
