<div align="center">

# Agent Weaver (Agent Orchestrator)

Spawn parallel AI coding agents. Monitor from one dashboard. Merge their MRs/PRs.

[![GitHub stars](https://img.shields.io/github/stars/ComposioHQ/agent-orchestrator?style=flat-square)](https://github.com/ComposioHQ/agent-orchestrator/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![PRs merged](https://img.shields.io/badge/PRs_merged-61-brightgreen?style=flat-square)](https://github.com/ComposioHQ/agent-orchestrator/pulls?q=is%3Amerged)
[![Tests](https://img.shields.io/badge/test_cases-3%2C288-blue?style=flat-square)](https://github.com/ComposioHQ/agent-orchestrator/releases/tag/metrics-v1)

</div>

---

Agent Weaver (formerly Agent Orchestrator) manages fleets of AI coding agents working in parallel on your codebase. Each agent gets its own git worktree, its own branch, and its own PR/MR. When CI fails, the agent fixes it. When reviewers leave comments, the agent addresses them. You only get pulled in when human judgment is needed.

**Agent-agnostic** (Claude Code, Codex, Aider) · **Runtime-agnostic** (tmux, Docker) · **Tracker/SCM-agnostic** (GitHub, GitLab, Linear)

<div align="center">

## See it in action

<a href="https://x.com/agent_wrapper/status/2026329204405723180">
  <img src="docs/assets/demo-video-tweet.png" alt="Agent Orchestrator demo — AI agents building their own orchestrator" width="560">
</a>
<br><br>
<a href="https://x.com/agent_wrapper/status/2026329204405723180"><img src="docs/assets/btn-watch-demo.png" alt="Watch the Demo on X" height="48"></a>
<br><br><br>
<a href="https://x.com/agent_wrapper/status/2025986105485733945">
  <img src="docs/assets/article-tweet.png" alt="The Self-Improving AI System That Built Itself" width="560">
</a>
<br><br>
<a href="https://x.com/agent_wrapper/status/2025986105485733945"><img src="docs/assets/btn-read-article.png" alt="Read the Full Article on X" height="48"></a>

</div>

## Key Features

- **Local LLMs & Aider Automation**: Deep support for Local LLMs (tested on Qwen3 Coder Next) combined with **Aider** in a fully autonomous, zero-intervention loop.
- **VRAM Scheduling & Host Management**: Built-in orchestration to dynamically manage local hardware resources, GPU slots, and context window limits across multiple parallel agents.
- **GitLab & GitHub Integration**: First-class native GitLab SCM (Merge Requests) and Tracker plugins utilizing the `glab` CLI under the hood, alongside standard `gh` CLI support.

## Quick Start

```bash
# Install
git clone https://github.com/ComposioHQ/agent-orchestrator.git
cd agent-orchestrator && bash scripts/setup.sh

# Configure your project
cd ~/your-project && ao init --auto

# Launch and spawn an agent
ao start
ao spawn my-project 123    # GitHub/GitLab issue, Linear ticket, or ad-hoc
```

Dashboard opens at `http://localhost:3000`. Run `ao status` for the CLI view.

## How It Works

```bash
ao spawn my-project 123
```

1. **Workspace** creates an isolated git worktree with a feature branch
2. **Runtime** starts a tmux session (or Docker container)
3. **Agent** launches Aider (or Claude Code, or Codex) with issue context
4. Agent works autonomously — reads code, writes tests, creates PR/MR
5. **Reactions** auto-handle CI failures and review comments
6. **Notifier** pings you only when judgment is needed

### Plugin Architecture

Eight slots. Every abstraction is swappable.

| Slot      | Default     | Alternatives             |
| --------- | ----------- | ------------------------ |
| Runtime   | tmux        | docker, k8s, process     |
| Agent     | claude-code | codex, aider, opencode   |
| Workspace | worktree    | clone                    |
| Tracker   | github      | gitlab, linear           |
| SCM       | github      | gitlab                   |
| Notifier  | desktop     | slack, composio, webhook |
| Terminal  | iterm2      | web                      |
| Lifecycle | core        | —                        |

All interfaces defined in [`packages/core/src/types.ts`](packages/core/src/types.ts). A plugin implements one interface and exports a `PluginModule`. That's it.

## Configuration

```yaml
# agent-orchestrator.yaml
port: 3000

defaults:
  runtime: tmux
  agent: aider
  workspace: worktree
  notifiers: [desktop]

# Hardware Resource & VRAM Management
hosts:
  local-gpu:
    type: local
    vram: 80GB
    slots: 2

models:
  qwen3-80b:
    host: local-gpu
    contextWindow: 128k

plugins:
  notifier:
    - module: "@acme/ao-plugin-notifier-teams"
      config:
        channel: eng-alerts

projects:
  my-app:
    repo: owner/my-app
    path: ~/my-app
    defaultBranch: main
    sessionPrefix: app
    scm: gitlab # Utilize GitLab Merge Requests
    tracker: gitlab # Track via GitLab Issues

reactions:
  ci-failed:
    auto: true
    action: send-to-agent
    retries: 2
  changes-requested:
    auto: true
    action: send-to-agent
    escalateAfter: 30m
  approved-and-green:
    auto: false # flip to true for auto-merge
    action: notify
```

CI fails → agent gets the logs and fixes it. Reviewer requests changes → agent addresses them. PR/MR approved with green CI → you get a notification to merge.

See [`agent-orchestrator.yaml.example`](agent-orchestrator.yaml.example) for the full reference.
For custom plugin authoring and loading, see [`docs/PLUGIN_AUTHORING.md`](docs/PLUGIN_AUTHORING.md).

## CLI

```bash
ao status                              # Overview of all sessions and VRAM
ao spawn <project> [issue]             # Spawn an agent
ao send <session> "Fix the tests"      # Send instructions
ao session ls                          # List sessions
ao session kill <session>              # Kill a session and free VRAM
ao session restore <session>           # Revive a crashed agent
ao dashboard                           # Open web dashboard
```

## Why Agent Weaver?

Running one AI agent in a terminal is easy. Running 30 across different issues, branches, and PRs, constrained by VRAM limits, is a complex coordination problem.

**Without orchestration**, you manually: create branches, start agents, manage local GPU memory, check if they're stuck, read CI failures, forward review comments, track which MRs are ready to merge, and clean up when done.

**With Agent Weaver**, you: `ao spawn` and walk away. The system handles isolation, VRAM scheduling, feedback routing, and status tracking cross-platform. You review MRs and make decisions — the rest is automated.

## Prerequisites

- Node.js 20+
- Git 2.25+
- tmux (for default runtime)
- `gh` CLI (for GitHub) or `glab` CLI (for GitLab)
- _Optional_: GPU with local VRAM for local models

## Development

```bash
pnpm install && pnpm build     # Install and build all packages
pnpm test                      # Run tests (3,288 test cases)
pnpm dev                       # Start web dashboard dev server
```

See [`CLAUDE.md`](CLAUDE.md) for code conventions and architecture details.

## Documentation

- [Setup Guide](SETUP.md)
- [Plugin Authoring](docs/guides/PLUGIN_AUTHORING.md)
- [GitLab Setup Guide](docs/guides/GITLAB_SETUP.md)
- [Development Guide](docs/guides/DEVELOPMENT.md)
- [Rebase Strategy](docs/guides/REBASE_STRATEGY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
