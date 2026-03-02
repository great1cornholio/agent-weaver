# GitLab Standalone Setup Guide

This guide will walk you through setting up Agent Weaver to communicate seamlessly with GitLab repositories and issues.

## Prerequisites

Agent Weaver leverages the `glab` CLI for most GitLab tracker and source-control interactions.

1. Install the `glab` CLI from your package manager (e.g., `brew install glab` on macOS, or download the binary from GitLab).
2. Authenticate the CLI using `glab auth login`. Choose your preferred method (Web or Personal Access Token).

## 1. Configure Global Identifiers

If your primary focus will be interacting with GitLab projects, ensure that your overarching `agent-orchestrator.yaml` defines appropriate aliases or identifiers matching your `.git` remotes.

## 2. Setting Up `ProjectConfig`

Inside `agent-orchestrator.yaml`, configure your project blocks using the GitLab plugin identifiers. Each project that interacts with GitLab needs to declare `tracker` and `scm` as `"gitlab"`.

```yaml
projects:
  my-gitlab-project:
    path: /path/to/local/gitlab/repo
    tracker: gitlab
    scm: gitlab
```

### Advanced Repository Configuration

If your system path does not explicitly match the naming structure required by GitOps interactions via the tool, you can provide override properties in `trackerConfig` and `scmConfig` options. Note that the core plugin generally determines the target repository dynamically using `git remote -v`.

## 3. Working With Merge Requests

The `scm-gitlab` plugin can automatically resolve MR diff summaries, link to pipelines, and attach comments.
Make sure your API scopes are correctly enabled (api, read_repository, write_repository) if using a Personal Access Token setup so the `glab` binary can perform these actions seamlessly.

## 4. Run Tests

To verify your configuration, use the dedicated smoke test provided:

```bash
./scripts/ao-smoke-gitlab my-gitlab-project
```

This ensures your tracker setup fetches open issues successfully, resolves state, and the core node processes behave symmetrically as they would using the GitHub equivalent.

## Troubleshooting

- **`glab` not found in PATH**: Ensure the CLI binary is executable by the same shell instance starting Agent Weaver.
- **JSON safe parse errors in CI**: Ensure you are on v0.1+ where `glab` outputs are wrapped in try-catch blocks to prevent crashes on non-JSON outputs or errors.
