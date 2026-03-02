# Epic 6 Release Notes: Plugin Discovery + Developer API

**Date**: 2026-02-22  
**Scope**: plugin-first extensibility (R-004 foundation)  
**Breaking Change**: No

## Summary

Epic 6 delivers the first complete config-driven plugin discovery path in core, with developer-facing docs and runtime warning telemetry.

Delivered capabilities:

- `plugins.<slot>[]` declarations in config,
- support for both module string and object form (`module` + inline `config`),
- safe slot-match validation during registration,
- warning telemetry for failed/invalid imports,
- updated plugin authoring + loading documentation.

## What Changed

### 1) Config surface for external plugin declarations

`OrchestratorConfig` now supports optional plugin declarations grouped by slot:

- string entry: module/package/path,
- object entry: `{ module, config }`.

Validation is enforced in config schema.

Files:

- `packages/core/src/types.ts`
- `packages/core/src/config.ts`
- `packages/core/src/__tests__/config-validation.test.ts`

### 2) Config-based plugin registry loading

`loadFromConfig()` now:

1. loads built-ins,
2. loads configured plugins from `plugins.<slot>[]`,
3. forwards inline config to `create(config)`,
4. ignores entries where declared slot does not match `manifest.slot`.

Files:

- `packages/core/src/plugin-registry.ts`
- `packages/core/src/__tests__/plugin-registry.test.ts`

### 3) Warning telemetry for plugin discovery failures

Registry now supports optional warning callback (`onWarning`) with structured warning payload for:

- built-in import failures,
- configured import failures,
- invalid module exports,
- slot mismatch.

CLI wires this callback to operational warnings during startup.

Files:

- `packages/core/src/plugin-registry.ts`
- `packages/cli/src/lib/create-session-manager.ts`
- `packages/core/src/__tests__/plugin-registry.test.ts`

### 4) Developer ergonomics documentation

Added docs and examples for external plugin loading and authoring.

Files:

- `agent-orchestrator.yaml.example`
- `docs/DEVELOPMENT.md`
- `docs/PLUGIN_AUTHORING.md`
- `README.md`
- `docs/epic-06-implementation-plan.md`

## Validation Performed

- `pnpm --filter @composio/ao-core test -- plugin-registry config-validation`
- `pnpm --filter @composio/ao-core test`
- `pnpm --filter @composio/ao-cli build`
- `pnpm --filter @composio/ao-cli test -- __tests__/lib/plugins.test.ts`

Status:

- core tests passed,
- CLI build passed,
- focused CLI test passed,
- known environment-specific failure exists in `init` suite when local port 3000 is already occupied (`EADDRINUSE`), unrelated to plugin discovery changes.
