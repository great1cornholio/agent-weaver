# Epic 6 Release Notes: Plugin Discovery + Developer API

**Date**: 2026-02-22  
**Scope**: plugin-first extensibility and operational safety  
**Breaking Change**: No

## Highlights

- Added config-driven external plugin loading via `plugins.<slot>[]`.
- Added inline plugin config forwarding (`{ module, config }`).
- Added slot safety guard (ignore mismatched `manifest.slot`).
- Added warning telemetry callback for import/validation failures.
- Added docs for authoring and integrating custom plugins.

## Core implementation

### Config + type surface

- `OrchestratorConfig.plugins` supports per-slot arrays of plugin entries.
- Plugin entry accepts either string module or object form with `module` and optional `config`.
- Config schema validates declarations and rejects invalid object entries.

Files:

- `packages/core/src/types.ts`
- `packages/core/src/config.ts`

### Registry behavior

`plugin-registry` now loads plugins from config after built-ins and enforces:

- module normalization (`default` or direct export),
- graceful continuation on import errors,
- skip on invalid module shape,
- skip on declared-slot/manifest-slot mismatch.

Files:

- `packages/core/src/plugin-registry.ts`

### Warning telemetry

Registry exposes optional warnings callback with structured codes:

- `builtin-import-failed`
- `builtin-invalid-module`
- `configured-import-failed`
- `configured-invalid-module`
- `configured-slot-mismatch`

CLI now surfaces these warnings for operator visibility during registry init.

File:

- `packages/cli/src/lib/create-session-manager.ts`

## Documentation

- Added plugin examples in `agent-orchestrator.yaml.example`.
- Updated `docs/DEVELOPMENT.md` for config-based plugin loading.
- Added `docs/PLUGIN_AUTHORING.md`.
- Linked guide from `README.md`.

## Validation

- `pnpm --filter @composio/ao-core test -- plugin-registry config-validation` ✅
- `pnpm --filter @composio/ao-core test` ✅
- `pnpm --filter @composio/ao-cli build` ✅
- `pnpm --filter @composio/ao-cli test -- __tests__/lib/plugins.test.ts` ✅

Note: full CLI test suite can fail in local environments when `init` tests encounter occupied port `3000` (`EADDRINUSE`), unrelated to this epic.
