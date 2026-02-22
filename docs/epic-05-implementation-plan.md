# Epic 5 — plan implementacji (v1.5 scheduler reliability)

## 1. Cel Epica 5

Dowieźć podstawy scheduler reliability po v1.0:
- queue lookahead z anti-starvation,
- persistence stanu schedulera i recovery po restarcie,
- deterministyczne retry semantics (`retry_after`) dla braku slotów,
- testy i runbook pod operacyjne awarie schedulerowe.

Źródła:
- `docs/roadmap.md` (R-001, R-006),
- obserwacje operacyjne po Epic 4 (DX i preflight ustabilizowane, czas na scheduler core).

---

## 2. Delta względem stanu po Epic 4

### Już jest
- Typy hostów/modeli i walidacja budżetu VRAM (Epic 3).
- Stabilna ścieżka CLI + preflight + smoke (Epic 4).

### Brakuje (scope Epic 5)
1. Brak dedykowanego komponentu schedulera z lookahead.
2. Brak persistence stanu slotów/skipów między restartami.
3. Brak konfigurowalnych parametrów kolejki (`queueLookahead`, `maxSkipsPerTask`, `retryBackoff`).
4. Brak testów scheduler core pod starvation i restore.

---

## 3. Plan wykonania (kolejność)

## Etap A — Scheduler Core (must-have)
1. Dodać `VramScheduler` do core z:
   - alokacją slotów po modelu/hoście,
   - queue lookahead,
   - anti-starvation (max skip count).
2. Dodać kontrakty typów i snapshot stanu.

**DoD A**
- Scheduler wybiera zadania z lookahead, ale nie zagłodzi stale pomijanych tasków.

## Etap B — Persistence + Recovery (must-have)
1. Persistować `usedSlots`, `activeAgentCounts`, `skipCounts` do pliku stanu.
2. Odtwarzać stan przy starcie schedulera.
3. Ignorować uszkodzony state file (safe fallback do clean state).

**DoD B**
- Restart nie zeruje stanu slotów/skipów dla poprawnego state file.

## Etap C — Config Surface (must-have)
1. Rozszerzyć `OrchestratorConfig` o `concurrency`:
   - `queueLookahead`,
   - `maxSkipsPerTask`,
   - `retryBackoff`.
2. Dodać walidację i bezpieczne domyślne wartości.

**DoD C**
- Konfiguracja concurrency jest walidowana i dostępna w runtime core.

## Etap D — Testy i operacyjność (should-have)
1. Testy unit schedulera: lookahead, no-slots, persistence/restore.
2. Testy config validation dla `concurrency`.
3. Uzupełnienie runbooka i release notes.

**DoD D**
- Testy scheduler core przechodzą deterministycznie.

---

## 4. Proponowane taski implementacyjne (do issue board)

1. core: `vram-scheduler.ts` + export z `index.ts`.
2. core: `concurrency` w types/config.
3. core-tests: `vram-scheduler.test.ts`.
4. core-tests: rozszerzenie `config-validation.test.ts`.
5. docs: runbook/release notes Epic 5.

---

## 5. Test plan (komendy + oczekiwany status)

```sh
cd /home/rascal/agent-weaver

pnpm --filter @composio/ao-core test -- vram-scheduler config-validation
# expected: exit 0

pnpm --filter @composio/ao-core test
# expected: exit 0
```

---

## 6. Kryteria zamknięcia Epica 5

Epic 5 uznajemy za zakończony, gdy:
1. Scheduler core obsługuje lookahead i anti-starvation.
2. Stan schedulera przetrwa restart (persistence + restore).
3. Parametry kolejki i retry są konfigurowalne i zwalidowane.
4. Testy scheduler/config są zielone i powtarzalne.
