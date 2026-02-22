# Epic 5 Release Notes: VRAM Scheduler + Pipeline Integration

**Date**: 2026-02-22  
**Scope**: Scheduler reliability (v1.5 foundation)  
**Breaking Change**: No

## Summary

Epic 5 introduces scheduler primitives for host/model slot allocation and wires them into full workflow execution.

Delivered capabilities:

- queue lookahead with anti-starvation,
- scheduler state persistence and restore,
- configurable queue/retry parameters,
- runtime pipeline events for slot acquire/wait/release.

## What Changed

### 1) New core scheduler

Added `VramScheduler` with:

- model-aware host selection,
- queue lookahead (`queueLookahead`),
- starvation prevention (`maxSkipsPerTask`),
- `retryAfter` semantics for no-slot conditions,
- JSON state snapshot persistence and restore.

Files:

- `packages/core/src/vram-scheduler.ts`
- `packages/core/src/index.ts` (exports)

### 2) Config surface for scheduler tuning

`OrchestratorConfig` now supports:

- `concurrency.queueLookahead`
- `concurrency.maxSkipsPerTask`
- `concurrency.retryBackoff`

with validation defaults in config loader.

Files:

- `packages/core/src/types.ts`
- `packages/core/src/config.ts`
- `packages/core/src/__tests__/config-validation.test.ts`

### 3) Full-workflow integration

`SessionManager` full pipeline now uses `VramScheduler` when `hosts` and `agentTypes` are configured:

- emits `vram.slot.acquired` on allocation,
- emits `vram.slot.waiting` when no slot is available,
- emits `vram.slot.released` after subtask completion/retry paths.

File:

- `packages/core/src/session-manager.ts`

### 4) Tests and runbook updates

- scheduler unit tests for lookahead / no-slot / persistence,
- session manager tests for VRAM events and failure path (`vram.slot.waiting` + `pipeline.failed`),
- troubleshooting guidance for slot contention and model mapping errors.

Files:

- `packages/core/src/__tests__/vram-scheduler.test.ts`
- `packages/core/src/__tests__/session-manager.test.ts`
- `TROUBLESHOOTING.md`
- `docs/epic-05-implementation-plan.md`

## Validation Performed

- `pnpm --filter @composio/ao-core test -- vram-scheduler config-validation`
- `pnpm --filter @composio/ao-core test -- session-manager vram-scheduler`
- `pnpm --filter @composio/ao-core test`

All checks passed for this scope.
