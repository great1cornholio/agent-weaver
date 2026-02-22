# Troubleshooting

## DirectTerminal: posix_spawnp failed error

**Symptom**: Terminal in browser shows "Connected" but blank. WebSocket logs show:

```
[DirectTerminal] Failed to spawn PTY: Error: posix_spawnp failed.
```

**Root Cause**: node-pty prebuilt binaries are incompatible with your system.

**Fix**: Rebuild node-pty from source:

```bash
# From the repository root
cd node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
npx node-gyp rebuild
```

**Verification**:

```bash
# Test node-pty works
node -e "const pty = require('./node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty'); \
  const shell = pty.spawn('/bin/zsh', [], {name: 'xterm-256color', cols: 80, rows: 24, \
  cwd: process.env.HOME, env: process.env}); \
  shell.onData((d) => console.log('✅ OK')); \
  setTimeout(() => process.exit(0), 1000);"
```

**When this happens**:

- After `pnpm install` (uses cached prebuilts)
- After copying the repo to a new location
- On some macOS configurations with Homebrew Node

**Permanent fix**: The postinstall hook automatically rebuilds node-pty:

```bash
pnpm install  # Automatically rebuilds node-pty via postinstall hook
```

If you need to manually rebuild:

```bash
cd node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
npx node-gyp rebuild
```

## Other Issues

### Config file not found

**Symptom**: API returns 500 with "No agent-orchestrator.yaml found"

**Fix**: Ensure config exists in the directory where you run `ao start`, or symlink it:

```bash
ln -s /path/to/agent-orchestrator.yaml packages/web/agent-orchestrator.yaml
```

### `pnpm exec ao` not found

**Symptom**: `pnpm exec ao --help` returns `Command "ao" not found`.

**Fix**: Use the repository wrapper script (works deterministically in this workspace):

```bash
pnpm build
pnpm run ao -- --help
```

Alternative direct invocation:

```bash
node packages/cli/dist/index.js --help
```

### `ao spawn` fails immediately with preflight errors

Epic 4 adds fail-fast preflight checks before session creation.

Common examples:

- `binary.tmux` → install `tmux` and ensure it's on `PATH`.
- `binary.gh` / `binary.glab` → install GitHub/GitLab CLI.
- `tracker.linear.auth` → set `LINEAR_API_KEY` or `COMPOSIO_API_KEY`.

If you need to bypass checks only for diagnostics:

```bash
pnpm run ao -- spawn <project> [issue] --no-preflight
```

### Spawn preflight quick matrix

| Symptom | Probable Cause | Fix |
| --- | --- | --- |
| `Unknown project: <id>` | Wrong project key in config | `pnpm run ao -- status` and use key from `agent-orchestrator.yaml` |
| `binary.tmux` | tmux missing | Install tmux (`sudo apt install tmux` / `brew install tmux`) |
| `binary.gh` / `binary.glab` | CLI missing for selected tracker/SCM | Install `gh` or `glab` and relaunch terminal |
| `tracker.linear.auth` | Missing Linear auth | `export LINEAR_API_KEY=...` (or `COMPOSIO_API_KEY`) |

### Smoke verification (single command)

Run:

```bash
pnpm run ao:smoke -- <project-id> [issue-id]
```

This command builds CLI, runs spawn, and validates required pipeline events in `ao-events.jsonl`.
