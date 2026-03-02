# Epic 2 — dane wejściowe do implementacji (v1.0-beta)

## 1) Cel Epica 2

Dowieźć pełny workflow `full`:
- `coordinator -> tester -> developer -> reviewer`
- wykonanie planu subtasków przez `TaskPipelineManager`
- egzekwowanie TDD między warstwami (`assertRed`, `assertGreen`)
- wsparcie multi-host (host-aware model routing)
- checkpoint + restore pipeline po crashu (`ao session restore`)

Źródła wymagań:
- `docs/master-spec-agent-weaver-v1.2.md` (sekcje: 4.3, 5.1, 5A, 6.3, 6A, 6B, 6C)
- `docs/roadmap.md` (R-007, Faza 2)
- `docs/epic-01-scope.md` (elementy out-of-scope przeniesione do Epic 2)

---

## 2) Zakres Epica 2 (scope)

### In scope
1. `workflow: full` jako produkcyjny przebieg sesji.
2. `CoordinatorPlugin` generujący `SubtaskPlan` (JSON + walidacja).
3. `TaskPipelineManager`:
   - topologiczne sortowanie (`dependsOn`),
   - grupowanie warstw,
   - uruchamianie podsesji per subtask,
   - przekazanie `tddResults` do review.
4. Integracja `TddGuard` w pipeline:
   - po warstwie tester -> `assertRed()`,
   - po warstwie developer -> `assertGreen()`.
5. Retry flow przy `strict` (`tdd-red-failed`, `tdd-green-failed`).
6. Multi-host scheduling po modelu i limicie `maxConcurrentPerHost`.
7. Checkpoint pipeline (`.ao/pipeline-<session>.json`) + resume.

### Out of scope (dla Epica 2)
- Federacja wielu instancji AO (roadmap R-003, v2+).
- Dynamic model swapping (R-002, v2.0).
- Queue lookahead scheduler (R-001, v1.5).

---

## 3) Stan kodu vs wymagania (gap analysis)

## Już gotowe (reuse z Epica 1)
- `tracker-gitlab`, `scm-gitlab`, `notifier-telegram` są w repo i testach.
- Strukturalne eventy sesji są logowane (`session.started`, `session.completed`).
- Parsowanie markerów TDD (`tdd.red.result`, `tdd.green.result`) jest w lifecycle.

## Luki do dowiezienia w Epic 2
1. Brak implementacji `CoordinatorPlugin` jako pluginu AO (slot `agent` dla typu `coordinator`).
2. Brak implementacji `ReviewerPlugin` zgodnej z flow `APPROVE/REQUEST_CHANGES`.
3. Brak `TaskPipelineManager` w core.
4. Brak `TddGuard` używanego przez pipeline warstwowy.
5. Brak mechanizmu `SubtaskPlan` (schema + walidacja + topologia zależności).
6. Brak checkpoint managera i resume warstw pipeline po crashu.
7. Brak spójnego przełączania `workflow: simple|full|auto` w managerze sesji.
8. Brak testów integracyjnych dla pełnego 4-agentowego przepływu i restore.

---

## 4) Wymagania funkcjonalne (implementacyjne)

### E2-FR-01 — Planner
- Wejście: issue + kontekst projektu.
- Wyjście: `SubtaskPlan` JSON (`strategy`, `subtasks[]`, `dependsOn`, `files[]`).
- Walidacja: schema + wykrywanie cykli + unknown dependencies.
- Fallback: minimalny plan 1x `developer` gdy parse/walidacja nie przejdzie.

### E2-FR-02 — Pipeline execution
- `TaskPipelineManager.executePlan(plan, parentSession)`.
- Wykonanie warstwami (`Promise.all` w obrębie warstwy).
- Kolejność warstw wynikająca wyłącznie z DAG zależności.

### E2-FR-03 — TDD Guard integration
- `assertRed` po warstwie z testerem, jeśli następna warstwa ma developera.
- `assertGreen` po warstwie developera.
- `strict`: retry + fail pipeline przy wyczerpaniu retry.
- `warn`: log + kontynuacja.
- `off`: brak blokady.

### E2-FR-04 — Reviewer handoff
- Reviewer dostaje `tddResults` i MR context.
- Wynik review steruje reakcjami (`REQUEST_CHANGES` -> developer loop).

### E2-FR-05 — Checkpoint & restore
- Zapis checkpointu przed każdą warstwą.
- Resume od `currentLayer` po `ao session restore` jeśli `planHash` zgodny.
- Cleanup checkpointu po sukcesie/kill.

### E2-FR-06 — Multi-host routing
- Alokacja modelu na zdrowym hoście z wolnym slotem.
- Egzekwowanie `maxConcurrentPerHost`.
- Brak dostępności -> kolejka + `retry_after`.

---

## 5) Proponowany podział prac (kolejność)

### Etap A — typy i kontrakty (core)
1. Dodać typy `Subtask`, `SubtaskPlan`, `TddGuardResult` do core.
2. Dodać walidator planu + topo sort utils.

### Etap B — silnik pipeline
1. Dodać `tdd-guard.ts`.
2. Dodać `pipeline-manager.ts`.
3. Wpiąć pipeline do `SessionManager` dla `workflow: full`.

### Etap C — pluginy agentowe full flow
1. Dodać `plugins/agent-coordinator`.
2. Dodać `plugins/agent-reviewer`.
3. Zarejestrować built-ins i zależności CLI/integration-tests.

### Etap D — odporność i recovery
1. Dodać `pipeline-checkpoint.ts`.
2. Wpiąć restore path do `ao session restore`.
3. Dodać eventy: `pipeline.resumed`, `pipeline.layer.started/completed`.

### Etap E — testy
1. Unit: topo sort, cycle detection, TDD guard modes, checkpoint load/save/clear.
2. Integration: full flow happy path + red retry + green retry + review reject.
3. Integration: crash pomiędzy warstwami i poprawny resume.

---

## 6) Kryteria akceptacji (DoD Epica 2)

1. `workflow: full` działa end-to-end na issue testowym.
2. Plan z `dependsOn` wykonuje się warstwami zgodnie z DAG.
3. `strict` zatrzymuje pipeline przy niespełnieniu Red/Green po retry.
4. `warn` loguje i przepuszcza.
5. Checkpoint jest zapisywany i używany przez restore.
6. Resume nie powtarza ukończonych warstw.
7. Multi-host routing wybiera host z wolnym slotem i respektuje limity per-host.
8. Testy integracyjne Epica 2 przechodzą deterministycznie.

---

## 7) Minimalny zestaw test-data/fixture do implementacji

1. Fixture planu `SubtaskPlan`:
   - wariant poprawny (tester->developer->reviewer),
   - wariant z cyklem,
   - wariant z `dependsOn` do nieistniejącego subtaska.
2. Fixture sesji z `workflow: full`, `tddMode: strict|warn|off`.
3. Fixture schedulera z hostami `local` + `gpu-server`.
4. Fixture checkpointu dla stanu: po warstwie 0, przed warstwą 1.

---

## 8) Ryzyka implementacyjne

1. Niejednoznaczna semantyka retry (ile retry per warstwa vs per sesja).
2. Błędna obsługa idempotencji przy resume może duplikować commity/MR actions.
3. Rozjazd eventów lifecycle vs pipeline może psuć telemetry i reakcje.
4. Integracja reviewer -> reactions wymaga spójnego kontraktu statusów.

---

## 9) Gotowość do startu

Epic 2 można rozpocząć od razu. Najpierw warto dowieźć rdzeń w core (`SubtaskPlan`, `TaskPipelineManager`, `TddGuard`, checkpoint), dopiero potem domknąć pluginy `coordinator/reviewer` i testy E2E restore.
