# Epic 3 — plan implementacji (v1.0)

## 1. Cel Epica 3

Dowieźć fazę v1.0 po Epic 2:
- Profile VRAM + walidacja budżetu przy starcie.
- testCmd z YAML oraz AGENTS.md override (realnie używane w runtime/pipeline).
- Stabilizacja edge-case'ów i E2E-V1.0 smoke test.

Źródła:
- docs/roadmap.md (R-007, Faza 3)
- docs/master-spec-agent-weaver-v1.2.md (sekcje harmonogramu v1.0, testCmd/AGENTS, VRAM)

---

## 2. Delta względem aktualnego stanu

### Już jest
- workflow full/auto + bootstrap pipeline w SessionManager.
- TaskPipelineManager + checkpoint/resume + testy.
- pluginy coordinator/reviewer (podstawowe) + wiring built-in.
- config parsuje pola workflow/tddMode/testCmd.

### Brakuje (Epic 3 scope)
1. Brak runtime walidacji profilu VRAM i host budget (`totalVramGb`, suma modeli, sloty).
2. Brak realnego użycia `testCmd` z projektu w egzekucji guard/runtime (obecnie tylko schema/config).
3. Brak AGENTS.md override w ścieżce wykonawczej pipeline/agentów dla full workflow.
4. Brak dedykowanego smoke testu E2E-V1.0 (review + stabilizacja).

---

## 3. Plan wykonania (kolejność)

## Etap A — VRAM validation (must-have)
1. Rozszerzyć model konfiguracji o `hosts` i `agentTypes` (typed w core, jeśli brakuje).
2. Dodać walidator `validateVramBudget(config)`:
   - per host: suma `(vramGb * maxSlots)` <= `totalVramGb`,
   - błąd fail-fast przy starcie.
3. Podpiąć walidację do bootstrapa configu/startu.

**DoD A**
- Konfiguracja z przekroczonym budżetem failuje deterministycznie.
- Konfiguracja poprawna przechodzi bez warningów krytycznych.

## Etap B — testCmd + AGENTS override (must-have)
1. Zaimplementować resolver komendy testów:
   - priorytet 1: AGENTS.md (jeśli zawiera `Test command:`),
   - priorytet 2: `projects.<id>.testCmd`,
   - fallback: sensowny default.
2. Podpiąć resolver do TDD Guard / wykonania pipeline full.
3. Dodać parser helper dla AGENTS.md (bezpieczny, odporny na brak pliku).

**DoD B**
- Przy obecnym AGENTS.md komenda testów jest nadpisywana.
- Bez AGENTS.md używane jest `testCmd` z YAML.

## Etap C — Stabilizacja full flow
1. Ujednolicić eventy pipeline z lifecycle (brak duplikacji i spójne typy).
2. Dopiąć handling błędów reviewer/coordinator (czytelny fallback i status sesji).
3. Dodać retry/backoff dla krytycznych kroków pipeline (gdzie sensowne).

**DoD C**
- Brak nieobsłużonych wyjątków przy typowych awariach pluginów.
- Status sesji i event log pozostają spójne po błędach.

## Etap D — E2E-V1.0
1. Dodać test integracyjny v1.0:
   - full workflow,
   - reviewer decision path,
   - testCmd resolution (AGENTS override > YAML),
   - stabilny wynik logów/eventów.
2. Dodać checklistę manual smoke (krótką, deterministyczną).

**DoD D**
- E2E-V1.0 przechodzi lokalnie i jest powtarzalny.

---

## 4. Proponowane taski implementacyjne (do issue board)

1. core: dodać typed `hosts` i `agentTypes` do config/types.
2. core: `validateVramBudget` + testy walidacji.
3. core: resolver `resolveTestCommand(projectPath, projectConfig)` + parser AGENTS.
4. core: podpiąć resolver do TaskPipelineManager/TDD Guard.
5. core: ujednolicić event names i payloady pipeline.
6. integration-tests: dodać scenariusz E2E-V1.0.

---

## 5. Test plan (komendy + oczekiwany status)

```sh
cd /home/rascal/agent-weaver

pnpm --filter @composio/ao-core test -- config-validation pipeline-manager session-manager
# expected: exit 0

pnpm --filter @composio/ao-integration-tests test:integration
# expected: exit 0 dla scenariuszy v1.0

pnpm --filter @composio/ao-core test
# expected: exit 0, pełny core green
```

---

## 6. Kryteria zamknięcia Epica 3

Epic 3 uznajemy za zakończony, gdy:
1. VRAM budget jest walidowany przy starcie i blokuje błędną konfigurację.
2. `testCmd` jest realnie używany, a AGENTS.md ma wyższy priorytet.
3. Full workflow działa stabilnie z reviewer path.
4. E2E-V1.0 przechodzi (automatycznie + manual smoke checklist).
5. Dokumentacja runbook v1.0 jest aktualna.
