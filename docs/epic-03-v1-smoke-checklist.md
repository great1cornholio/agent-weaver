# Epic 3 — manual smoke checklist (E2E-V1.0)

Cel: szybka, powtarzalna walidacja ścieżki v1.0 (`workflow: full`) po zmianach w core/pipeline.

## Preconditions

1. Zbudowane pakiety:

```sh
cd /home/rascal/agent-weaver
pnpm build
```

2. W `agent-orchestrator.yaml` dla testowego projektu ustawione:
- `workflow: full`
- `tddMode: strict`
- opcjonalnie `testCmd`, np. `pnpm test`

3. (Opcjonalnie) w worktree dodany `AGENTS.md` z linią:

```md
Test command: pnpm test:agents
```

## Kroki

1. Uruchom sesję:

```sh
pnpm exec ao spawn my-app INT-42
```

2. Odszukaj log eventów i sprawdź kluczowe typy:

```sh
LOG=$(find ~/.agent-orchestrator -name ao-events.jsonl -type f | head -n1)
tail -n 300 "$LOG" | jq -r '.type' | grep -E 'session.started|pipeline.test.command.selected|pipeline.layer.started|pipeline.subtask.executed|pipeline.layer.completed|pipeline.completed'
```

3. Zweryfikuj, że subtask reviewera wystąpił:

```sh
tail -n 300 "$LOG" | jq -c 'select(.type=="pipeline.subtask.executed") | .data.agentType'
```

4. Zweryfikuj źródło komendy testów:

```sh
tail -n 300 "$LOG" | jq -c 'select(.type=="pipeline.test.command.selected") | {source: .data.source, command: .data.command}'
```

## Expected result

- Log zawiera pełny ciąg eventów pipeline (`started` -> warstwy -> `completed`).
- W `pipeline.subtask.executed` występuje `"reviewer"`.
- `pipeline.test.command.selected` ma:
  - `source: "agents"` gdy obecny `AGENTS.md` z `Test command:`,
  - `source: "project"` gdy brak `AGENTS.md`, ale ustawione `testCmd` w YAML,
  - `source: "default"` gdy brak obu źródeł.
