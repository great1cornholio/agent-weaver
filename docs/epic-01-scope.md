# Epic 1 — Scope: Simple Workflow E2E

**Title:** Simple workflow end-to-end — `ao spawn` → developer → MR → Telegram HITL

**Goal:** Deliver a working pipeline for a single developer: from `ao spawn` on a GitLab Issue through MR creation to user decision in Telegram, using **simple** workflow (2-pass TDD, no coordinator).

**Phase (per master spec):** Faza 1 — alpha  
**Estimate:** ~3–4 weeks (depending on whether GitLab integration effort is counted in this Epic)

---

## 1. Scope — In Scope

### 1.1 Core setup
- Fork and setup of agent-orchestrator (ao) with configuration for **1 host**
- Single-host alpha setup: **Qwen3-30B × 2 slots** (no coordinator model; GPT-OSS-120 not required)
- `workflow: simple` only (no coordinator, no separate tester/reviewer agents)

### 1.2 Plugins and components

| Component | Description | Spec reference |
|-----------|-------------|----------------|
| **agent-aider plugin** | Developer-only; drives Aider subprocess for simple workflow: PASS 1 (Red — write failing tests), PASS 2 (Green — implement). | §6.2 |
| **VRAM Scheduler** | Python sidecar (port 9090); host-aware slot allocation for 1 host; API contract for plugins. | §8, §8.3 |
| **tracker-gitlab** | GitLab Issues ↔ ao sessions; source of truth for tasks. | §6E.1 |
| **scm-gitlab** | MR creation, branch management, "Closes #N", glab CLI. | §6E.2 |
| **Reactions adapter** | GitLab Webhooks → ao reactions engine (e.g. CI events, MR state). | §6E.3 |
| **notifier-telegram** | Notifications + HITL: Merge / Reject / Redirect. | §7 |
| **CompletionDetector** | Multi-signal completion detection for Aider (marker, diff, timeout). | §6D |
| **Structured logging** | JSONL event log (e.g. `ao-events.jsonl`) for session, TDD, VRAM events. | §12A |

### 1.3 Behavioural scope
- **Simple workflow:** One developer run in two passes: Red (tests only) → TDD Guard `assertRed()` → Green (implementation) → TDD Guard `assertGreen()` → MR → Telegram HITL.
- **Single project:** One test repo; multi-project is out of scope for this Epic.
- **Single host:** No remote inference hosts; local only.

---

## 2. Scope — Out of Scope (Epic 1)

- Coordinator plugin and SubtaskPlan (Epic 2)
- Reviewer plugin (Epic 3 / v1.0)
- Separate tester agent and TaskPipelineManager (Epic 2)
- Multi-host / remote inference endpoints (Epic 2)
- TDD Guard integration with coordinator-driven pipeline (Epic 2)
- Pipeline checkpoint / crash recovery (Epic 2)
- Profile VRAM validation at startup (Epic 3)
- AGENTS.md override and testCmd from YAML (Epic 3)

---

## 3. Definition of Done — E2E-ALPHA

Epic 1 is **done** when the following smoke test passes. The test is manual but deterministic (same steps every time).

### 3.1 Test: "Add /health endpoint"

**Preconditions**
- Repo: `test-project` (Python/FastAPI, has pytest, has AGENTS.md)
- GitLab Issue #1: *"Add GET /health endpoint returning {status: ok}"*
- 1 host (local), **Qwen3-30B × 2 slots**, `workflow: simple`
- Telegram bot configured; VRAM Scheduler running

**Scenario**
1. Run `ao spawn test-project 1`
2. System creates worktree and branch `feature/issue-1`
3. Developer (Aider, Qwen3-30B):
   - PASS 1 (Red): writes `test_health.py` with failing test
   - TDD Guard `assertRed()` → test exit ≠ 0 → OK
   - PASS 2 (Green): implements `/health` endpoint
   - TDD Guard `assertGreen()` → test exit = 0 → OK
   - CompletionDetector: marker + diff → COMPLETED
4. MR "Closes #1" created on GitLab
5. Telegram: notification with [Merge ✅] [Reject ❌]
6. User clicks Merge → MR merged → Issue #1 closed

### 3.2 Acceptance criteria (measurable)

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | MR contains test + implementation (at least 2 commits) | Inspect MR on GitLab |
| 2 | `pytest` passes on branch `feature/issue-1` | Run `pytest` in worktree |
| 3 | Telegram notification received &lt; 30 s after MR creation | Timestamp in log / notification |
| 4 | VRAM slot released after session end | Scheduler log/API: `vram.slot.released` |
| 5 | Structured log contains: `session.started`, `tdd.red.result`, `tdd.green.result`, `session.completed` | Query `ao-events.jsonl` (e.g. with `jq`) |
| 6 | End-to-end time &lt; 15 minutes | Time from `ao spawn` to Merge in Telegram |

---

## 4. Deliverables (summary)

- Fork/setup of ao with alpha configuration
- agent-aider plugin (developer, simple workflow)
- VRAM Scheduler (Python, 1 host) + API contract
- tracker-gitlab, scm-gitlab, reactions adapter
- notifier-telegram (HITL)
- CompletionDetector + structured logging
- Test repo and GitLab Issue setup for E2E-ALPHA
- Documentation/runbook to execute E2E-ALPHA and confirm all acceptance criteria

---

## 5. References

- **Master spec:** `docs/master-spec-agent-weaver-v1.2.md` — §10 (Harmonogram), §10.1 (E2E-ALPHA), §6, §6E, §7, §8, §12A
- **Roadmap:** `docs/roadmap.md` — R-007 (implementation phases)

---

*Document version: 1.0 · Epic 1 scope · Agent-Weaver*
