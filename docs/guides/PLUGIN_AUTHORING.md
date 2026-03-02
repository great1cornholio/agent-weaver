# Plugin Authoring Guide

This guide shows the minimal contract for writing and loading custom Agent Orchestrator plugins.

## 1) Implement the PluginModule Contract

Every plugin must export:

- `manifest` with `name`, `slot`, `description`, `version`
- `create(config?)` returning an implementation for that slot
- default export using inline `satisfies PluginModule<T>`

```ts
import type { PluginModule, Runtime } from "@composio/ao-core";

export const manifest = {
  name: "my-runtime",
  slot: "runtime" as const,
  description: "Custom runtime plugin",
  version: "0.1.0",
};

export function create(config?: Record<string, unknown>): Runtime {
  return {
    name: "my-runtime",
    async create(runtimeConfig) {
      return {
        id: `my-runtime-${runtimeConfig.sessionId}`,
        runtimeName: "my-runtime",
        data: { config },
      };
    },
    async destroy() {},
    async sendMessage() {},
    async getOutput() {
      return "";
    },
    async isAlive() {
      return true;
    },
  };
}

export default { manifest, create } satisfies PluginModule<Runtime>;
```

## 2) Build and Install the Plugin

Use either:

- npm package name (published or workspace-available), or
- local/relative ESM module path.

## 3) Load the Plugin from Config

`agent-orchestrator.yaml` supports per-slot declarations in `plugins`.

### String form

```yaml
plugins:
  runtime:
    - "@acme/ao-plugin-runtime-remote"
```

### Object form with inline config

```yaml
plugins:
  notifier:
    - module: "@acme/ao-plugin-notifier-teams"
      config:
        webhook: ${TEAMS_WEBHOOK_URL}
        channel: eng-alerts
```

## 4) Safety Rules in Discovery

- Built-ins load first.
- Configured plugins load next.
- If plugin import fails, startup continues.
- If declared slot does not match `manifest.slot`, plugin is ignored.

## 5) Troubleshooting

- Ensure your module exports a valid `PluginModule` (direct export or `default`).
- Ensure `manifest.slot` matches the slot used under `plugins.<slot>`.
- Ensure ESM compatibility and `.js` import extensions in local files.
- Verify package/path is resolvable from the orchestrator runtime.

## 6) Recommended Validation

```bash
pnpm --filter @composio/ao-core test -- plugin-registry config-validation
pnpm --filter @composio/ao-core test
```
