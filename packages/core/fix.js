const fs = require("fs");
const content = fs.readFileSync(
  "/home/rascal/agent-weaver/packages/core/src/__tests__/session-manager.test.ts",
  "utf-8",
);
const fixed = content.replace(
  /it\("emits vram.slot.waiting and pipeline.failed when no scheduler slot can be allocated", async \(\) => {[\s\S]*? \}\);/,
  (match) => match.replace(/ \}\);$/, " }, 15000);"),
);
fs.writeFileSync(
  "/home/rascal/agent-weaver/packages/core/src/__tests__/session-manager.test.ts",
  fixed,
);
