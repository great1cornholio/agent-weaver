# Epic 4 — plan implementacji (post-v1.0)

## 1. Cel Epica 4

Podnieść niezawodność operacyjną i developer experience po domknięciu v1.0:
- stabilne uruchamianie CLI (`ao`) bez obejść środowiskowych,
- preflight walidujący wymagane sekrety i konfigurację przed `spawn`,
- powtarzalny smoke issue-based (lokalnie/CI) bez zależności od ręcznego debugowania,
- twarde zasady runbooka dla reakcji na błędy.

Źródła:
- `docs/roadmap.md` (post-v1.0: R-001 → R-006; szczególnie DX/operacyjność przed większym schedulerem),
- wnioski z domknięcia Epic 3 (niestabilne `pnpm exec ao`, env-gating dla trackera).

---

## 2. Delta względem stanu po Epic 3

### Już jest
- Full workflow (`simple/full/auto`) + eventy pipeline działają.
- E2E v1.0 i smoke checklist istnieją.
- Alias shell (`ao`) działa jako fallback.

### Brakuje (scope Epic 4)
1. Deterministyczny sposób uruchamiania `ao` przez `pnpm exec`/workspace scripts.
2. Jednolity preflight przed `spawn` (sekrety, plugin dependencies, binarki).
3. Zautomatyzowany smoke issue-based z jasnym wynikiem PASS/FAIL i diagnozą.
4. Runbook operacyjny dla najczęstszych awarii (tracker auth, missing bins, command discovery).

---

## 3. Plan wykonania (kolejność)

## Etap A — CLI Invocation Reliability (must-have)
1. Dodać oficjalny workspace script uruchamiający CLI entrypoint (bez zależności od aliasu).
2. Ujednolicić dokumentację i testy tak, by używały jednej ścieżki (`pnpm ao:*` albo równoważny wrapper).
3. Dodać integracyjny test komendy help/version uruchamianej „jak użytkownik”.

**DoD A**
- `ao --help` działa deterministycznie przez oficjalny skrypt workspace.
- Brak wymogu ręcznego aliasu w krytycznym flow testowym.

## Etap B — Spawn Preflight (must-have)
1. Dodać preflight w CLI przed `spawn`:
   - walidacja `projectId`,
   - walidacja wymaganych env dla pluginów (`LINEAR_API_KEY`, webhooki itp.),
   - walidacja dostępności wymaganych binarek (np. `tmux`, `glab` gdy aktywne pluginy ich używają).
2. Zwracać czytelny błąd wieloliniowy z „How to fix”.
3. Dodać flagę `--no-preflight` tylko do scenariuszy diagnostycznych.

**DoD B**
- Brak „ciemnych” failure po wejściu w runtime dla typowych braków konfiguracyjnych.
- Użytkownik dostaje natychmiastową diagnozę i checklistę naprawy.

## Etap C — Smoke Automation (must-have)
1. Dodać skrypt smoke (`scripts/ao-smoke` lub analogiczny) obejmujący:
   - build CLI,
   - spawn dla projektu testowego,
   - walidację eventów pipeline,
   - raport PASS/FAIL.
2. Dodać tryb issue-based i no-issue (fallback gdy brak sekretów trackera).
3. Dodać integrację z CI jako job non-blocking (na start) + artefakt logów.

**DoD C**
- Jedna komenda uruchamia smoke end-to-end i zwraca binarny wynik.
- W przypadku fail dostępny jest skrócony raport diagnostyczny.

## Etap D — Operability Runbook (should-have)
1. Uzupełnić `TROUBLESHOOTING.md` o sekcję „CLI/spawn preflight failures”.
2. Dodać matrix: symptom → probable cause → fix command.
3. Dopisać minimalny playbook eskalacji (kiedy restart, kiedy cleanup session, kiedy restore).

**DoD D**
- Najczęstsze błędy z Epica 3 są opisane z gotowymi komendami naprawczymi.

---

## 4. Proponowane taski implementacyjne (do issue board)

1. cli: dodać oficjalny wrapper uruchomienia `ao` w root scripts.
2. cli: preflight validator (project/env/binaries) + formatter błędów.
3. integration-tests: scenariusz „spawn fails fast with missing env”.
4. scripts: smoke runner z walidacją eventów JSONL.
5. ci: job smoke (non-blocking) z uploadem logów.
6. docs: update `TROUBLESHOOTING.md` + quickstart uruchamiania CLI.

---

## 5. Test plan (komendy + oczekiwany status)

```sh
cd /home/rascal/agent-weaver

pnpm --filter @composio/ao-cli test
# expected: exit 0

pnpm --filter @composio/ao-integration-tests test:integration -- cli-spawn
# expected: exit 0 (w tym preflight-fail testy)

./scripts/ao-smoke
# expected: PASS + eventy pipeline w raporcie
```

---

## 6. Kryteria zamknięcia Epica 4

Epic 4 uznajemy za zakończony, gdy:
1. Istnieje oficjalna i stabilna ścieżka uruchamiania CLI bez aliasu shell.
2. `spawn` ma preflight i fail-fast dla braków env/deps.
3. Smoke end-to-end działa jedną komendą i daje jednoznaczny wynik.
4. Dokumentacja operacyjna pokrywa najczęstsze awarie oraz recovery kroki.
