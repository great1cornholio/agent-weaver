const fs = require("fs");

const yamlSnippet = `
hosts:
  local:
    address: localhost
    totalVramGb: 128
    models:
      gpt-oss-120:
        endpoint: http://localhost:8082/v1
        vramGb: 60
        maxSlots: 1
      qwen3-coder-30b-a3b:
        endpoint: http://localhost:8081/v1
        vramGb: 18
        maxSlots: 2

agentTypes:
  coordinator:
    model: gpt-oss-120
    maxConcurrentPerHost: 1
  developer:
    model: qwen3-coder-30b-a3b
    maxConcurrentPerHost: 1
  reviewer:
    model: gpt-oss-120
    maxConcurrentPerHost: 1
  tester:
    model: qwen3-coder-30b-a3b
    maxConcurrentPerHost: 1

concurrency:
  mode: parallel
  queueSize: 20
  queueStrategy: priority
`;

const lines = fs
  .readFileSync("/home/rascal/agent-weaver/agent-orchestrator.yaml", "utf8")
  .split("\n");
const out = [];
for (const line of lines) {
  if (line.includes("notifiers: [desktop]")) {
    out.push(line.replace("desktop", "telegram"));
  } else {
    out.push(line);
  }
}
const text = out.join("\n");
const fixed = text.replace("projects:", yamlSnippet + "\nprojects:");
fs.writeFileSync("/home/rascal/agent-weaver/agent-orchestrator.yaml", fixed);

const example = fs.readFileSync(
  "/home/rascal/agent-weaver/agent-orchestrator.yaml.example",
  "utf8",
);
const fixedEx = example.replace("notifiers: [desktop]", "notifiers: [telegram]");
fs.writeFileSync("/home/rascal/agent-weaver/agent-orchestrator.yaml.example", fixedEx);
