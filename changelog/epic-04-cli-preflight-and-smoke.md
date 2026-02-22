# Epic 4 Release Notes: CLI Preflight + Deterministic Smoke

**Date**: 2026-02-22  
**Scope**: Developer experience and operational reliability after v1.0  
**Breaking Change**: No

## Summary

Epic 4 improves day-to-day operability of Agent Orchestrator by adding:

- fail-fast spawn preflight checks,
- a deterministic CLI invocation path that does not depend on shell aliases,
- one-command smoke verification with event validation,
- troubleshooting guidance for the most common spawn/CLI failures.

## What Changed

### 1) Spawn preflight checks (`ao spawn`, `ao batch-spawn`)

Before session creation, CLI now validates:

- required binaries for the selected path (e.g. `tmux`, tracker-specific CLIs when issue-based flow is used),
- required environment for Linear issue mode (`LINEAR_API_KEY` or `COMPOSIO_API_KEY`),
- project validity and clear fix guidance.

New flag:

- `--no-preflight` to bypass checks for diagnostics.

Files:

- `packages/cli/src/lib/preflight.ts`
- `packages/cli/src/commands/spawn.ts`

### 2) Deterministic CLI invocation from repository

Official root scripts now provide a stable invocation path:

- `pnpm run ao -- <args>`
- `pnpm run ao:help`

Plus helper wrapper script:

- `scripts/ao`

Files:

- `package.json`
- `scripts/ao`

### 3) One-command smoke runner

New smoke script validates end-to-end path:

1. builds CLI,
2. runs help,
3. spawns a session,
4. checks required structured pipeline events in `ao-events.jsonl`.

Command:

- `pnpm run ao:smoke -- <project-id> [issue-id]`

File:

- `scripts/ao-smoke`

### 4) Test coverage and docs

Added tests for new behavior:

- spawn command unit tests (preflight fail-fast + `--no-preflight`),
- integration test for missing Linear auth in issue-based spawn.

Updated troubleshooting docs with symptom → cause → fix matrix and preflight guidance.

Files:

- `packages/cli/__tests__/commands/spawn.test.ts`
- `packages/integration-tests/src/cli-spawn-preflight.integration.test.ts`
- `TROUBLESHOOTING.md`
- `docs/epic-04-implementation-plan.md`

## Validation Performed

- `pnpm --filter @composio/ao-cli test -- __tests__/commands/spawn.test.ts`
- `pnpm exec vitest run --config vitest.config.ts src/cli-spawn-preflight.integration.test.ts` (in `packages/integration-tests`)
- `bash scripts/ao-smoke ao`

All checks passed in local execution for this epic scope.

## Operator Notes

- If `spawn` is run with issue + Linear tracker and no auth key, CLI now fails immediately with actionable output.
- For shell environments where `pnpm exec ao` is inconsistent, use `pnpm run ao -- ...`.
- Local runtime/project secrets are still environment-specific and intentionally not committed.
