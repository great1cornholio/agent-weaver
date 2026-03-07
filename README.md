<div align="center">

# Agent Weaver

### Local-first agent orchestration for coding agents running on your own LLMs and GPUs

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square)](package.json)
[![pnpm](https://img.shields.io/badge/package_manager-pnpm-ffb300?style=flat-square)](package.json)

</div>

---

Agent Weaver is a fork of Agent Orchestrator focused on a narrower problem: **running a small team of coding agents on local infrastructure**.

Instead of treating agents as unlimited cloud workers, Agent Weaver treats them as workloads competing for real resources: GPU memory, loaded models, runtime slots, worktrees, review bandwidth, and human attention.

It gives you a control plane for that environment.

- **Local LLM / GPU aware**: define hosts, models, VRAM budgets, and slot limits
- **Role-oriented**: orchestrator, coordinator, developer, tester, reviewer
- **Autonomous by default**: route CI failures and review comments back to the right session
- **Still practical**: isolated worktrees, tmux sessions, web dashboard, CLI, GitHub/GitLab/Jira/Linear integrations

The philosophy is simple: **spawn agents, allocate resources deliberately, and only interrupt the human when judgment is needed**.

## Why this exists

Running one coding agent in one terminal is easy.

Running multiple local agents is not.

If you use self-hosted models, you quickly hit operational constraints:

- one model may occupy most of a GPU or unified memory pool
- another model may allow more concurrency but weaker review quality
- some tasks should be handled by a planner or reviewer, not just a generic coder
- CI failures, review comments, and stuck sessions create coordination overhead

Agent Weaver exists to make that setup workable.

It is designed for a local-first loop where you may have one or more inference hosts, a limited number of model slots, and several agents competing for them at the same time.

## Core concepts

### `host`
A machine that serves one or more local models. A host has a total VRAM budget, health checks, and one or more model endpoints.

### `model`
A concrete model deployment with known constraints such as VRAM cost, context window, and slot count.

### `slot`
A schedulable unit of model capacity. If a model exposes `maxSlots: 2`, at most two agents can use it concurrently.

### `agent role`
The job a session performs. Agent Weaver distinguishes between roles like `coordinator`, `developer`, `tester`, and `reviewer` rather than treating every worker as the same kind of agent.

### `session`
An isolated unit of work with its own branch, workspace, runtime, metadata, and lifecycle.

### `workspace`
Usually a git worktree, though clone-based workflows are also supported.

### `reaction`
An automatic response to system events such as CI failures, review comments, approvals, merge conflicts, or stuck agents.

## What Agent Weaver does

When you spawn work, Agent Weaver can:

1. create an isolated workspace
2. assign the work to an agent role
3. allocate model capacity on a host with free slots
4. launch the runtime and agent session
5. track PR/MR, CI, and review state
6. send routine feedback back to the session automatically

This is the project’s core operating model:

> **Push, not pull.** Spawn agents, walk away, and get notified when your judgment is needed.

## Role-based workflow

Agent Weaver supports two useful modes of operation.

### 1. Simple mode
One coding agent handles the task end to end.

Example:

```bash
ao spawn my-app 123
```

That session gets its own workspace, its own branch, its own runtime, and the task context from your tracker.

### 2. Role-based mode
Work can be split across specialized roles:

- **Orchestrator**: the human-facing coordinating session
- **Coordinator**: an inline planner that produces a structured subtask plan
- **Developer**: the implementation worker
- **Tester**: the test-writing worker
- **Reviewer**: an inline reviewer that evaluates diffs and can post review feedback

A realistic flow looks like this:

```text
Orchestrator
  -> Coordinator plans the work
  -> Tester writes or hardens tests
  -> Developer implements the change
  -> Reviewer evaluates the diff and feedback
```

This role model is what makes Agent Weaver different from a generic “spawn N identical agents” tool.

## Resource planning and local GPU orchestration

Agent Weaver treats local inference capacity as a first-class scheduling problem.

You can define:

- multiple inference hosts
- multiple models per host
- VRAM requirements per model
- maximum concurrent slots per model
- agent types mapped to preferred models
- queue and concurrency policy

This lets you express decisions like:

- reviewers should use a larger, higher-quality model
- developers should use a faster coding model with more available slots
- testers can share lower-cost capacity
- planners should be rare and expensive

In other words, Agent Weaver is not just orchestrating *tasks* — it is orchestrating **task placement on constrained local model capacity**.

## Features available today

- isolated sessions with dedicated worktrees and branches
- tmux- and process-based runtimes
- agent plugins for `claude-code`, `codex`, `aider`, and `opencode`
- role-oriented agent plugins including `coordinator` and `reviewer`
- VRAM-aware host/model/slot configuration
- CLI and web dashboard workflows
- automatic routing for CI failures, review comments, approvals, and merge-state events
- GitHub and GitLab SCM support
- GitHub, GitLab, Jira, and Linear tracker support
- notifier plugins including desktop, Slack, Telegram, webhook, and Composio

## What is roadmap, not marketing

Agent Weaver has an opinionated direction around local-first orchestration. Some parts are already implemented, while others remain roadmap items.

Examples of forward-looking areas include:

- dynamic model swapping
- broader multi-host federation patterns
- deeper scheduler optimization and placement policy
- richer role pipelines beyond the current built-in roles

See [docs/roadmap.md](docs/roadmap.md) for the direction of travel.

## Quick start

### 1. Install prerequisites

- Node.js 20+
- pnpm
- Git 2.25+
- tmux
- `gh` for GitHub workflows and/or `glab` for GitLab workflows
- optional: local inference endpoints for your preferred models

### 2. Install and build

```bash
pnpm install
pnpm build
```

### 3. Create your config

Copy [agent-orchestrator.yaml.example](agent-orchestrator.yaml.example) to `agent-orchestrator.yaml` and adjust it for your hardware and projects.

### 4. Start the dashboard and orchestrator flow

```bash
ao start
ao status
```

### 5. Spawn work

```bash
ao spawn my-app 123
ao spawn my-app "stabilize flaky tests in the auth flow"
```

The dashboard defaults to `http://localhost:3000`.

## Example configuration

This example shows the intended local-first shape: hosts, models, roles, and one project.

```yaml
port: 3000

defaults:
  runtime: tmux
  agent: aider
  workspace: worktree
  notifiers: [desktop]

hosts:
  local:
    address: localhost
    totalVramGb: 128
    healthCheck: http://localhost:8080/health
    models:
      gpt-oss-120:
        endpoint: http://localhost:8082/v1
        vramGb: 60
        maxSlots: 1
        contextWindow: 65536
      qwen3-coder-30b-a3b:
        endpoint: http://localhost:8081/v1
        vramGb: 18
        maxSlots: 2
        contextWindow: 32768

agentTypes:
  coordinator:
    model: gpt-oss-120
    maxConcurrentPerHost: 1
  developer:
    model: qwen3-coder-30b-a3b
    maxConcurrentPerHost: 1
  tester:
    model: qwen3-coder-30b-a3b
    maxConcurrentPerHost: 1

concurrency:
  mode: parallel
  queueSize: 20
  queueStrategy: priority

projects:
  my-app:
    name: My App
    repo: org/my-app
    path: ~/src/my-app
    defaultBranch: main
    sessionPrefix: app
    tracker:
      plugin: github
    agentRules: |
      Always run tests before pushing.
      Prefer small, reviewable commits.
    orchestratorRules: |
      Batch related work when the same model family is already warm.
```

For the full reference, see [agent-orchestrator.yaml.example](agent-orchestrator.yaml.example).

## Supported plugin slots

Agent Weaver keeps the upstream plugin-slot architecture, but uses it in a more local-infrastructure-aware way.

| Slot | Typical choices |
| --- | --- |
| Runtime | `tmux`, `process` |
| Agent | `claude-code`, `codex`, `aider`, `opencode`, `coordinator`, `reviewer` |
| Workspace | `worktree`, `clone` |
| Tracker | `github`, `gitlab`, `jira`, `linear` |
| SCM | `github`, `gitlab` |
| Notifier | `desktop`, `slack`, `telegram`, `webhook`, `composio` |
| Terminal | `iterm2`, `web` |
| Lifecycle | core |

The core interfaces live in [packages/core/src/types.ts](packages/core/src/types.ts).

## CLI and dashboard

Common commands:

```bash
ao start
ao status
ao spawn <project> [issue-or-prompt]
ao send <session> "Address the review comments"
ao session ls
ao session attach <session>
ao session kill <session>
ao session restore <session>
```

The dashboard gives you a single place to inspect sessions, status, PR/MR state, and terminal activity.

## Philosophy

Agent Weaver is built around a few principles:

1. **Local-first over cloud-first**  
   Treat your inference hosts and models as real infrastructure, not an infinite API.

2. **Resource-aware scheduling over blind parallelism**  
   More agents is not better if they exhaust the same model capacity.

3. **Roles over undifferentiated workers**  
   Planning, implementation, testing, and review should not always be handled by the same role.

4. **Push, not pull**  
   The system should route routine failures and feedback without forcing the human to babysit every session.

5. **Simple usable loop first**  
   An end-to-end workflow that actually runs beats a grand architecture that is hard to operate.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

For local web development:

```bash
pnpm dev
```

See [CLAUDE.md](CLAUDE.md) for conventions and [ARCHITECTURE.md](ARCHITECTURE.md) for the system model.

## Documentation

- [Setup Guide](SETUP.md)
- [Architecture](ARCHITECTURE.md)
- [Roadmap](docs/roadmap.md)
- [Development Guide](docs/guides/DEVELOPMENT.md)
- [Plugin Authoring](docs/guides/PLUGIN_AUTHORING.md)
- [GitLab Setup Guide](docs/guides/GITLAB_SETUP.md)
- [Rebase Strategy](docs/guides/REBASE_STRATEGY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
