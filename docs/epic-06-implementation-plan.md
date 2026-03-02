# Epic 6 — plan implementacji (plugin discovery + developer API)

## 1. Cel Epica 6

Dowieźć fundament plugin-first po Epic 5:
- konfiguracja i ładowanie zewnętrznych pluginów z YAML,
- bezpieczny kontrakt ładowania (slot-match, graceful failure),
- testowalny i przewidywalny mechanizm discovery dla developerów pluginów.

Źródła:
- `docs/roadmap.md` (R-004),
- aktualny stan `plugin-registry` po Epic 5.

---

## 2. Delta względem stanu po Epic 5

### Już jest
- Registry ładuje built-in plugins.
- Interfejsy slotów są zdefiniowane i stabilne.

### Brakuje
1. Brak deklaratywnego ładowania pluginów z `agent-orchestrator.yaml`.
2. Brak obsługi wpisów pluginów z inline config.
3. Brak testów walidujących slot mismatch i object-form config.

---

## 3. Plan wykonania (kolejność)

## Etap A — Config surface + registry loading (must-have)
1. Rozszerzyć `OrchestratorConfig` o `plugins` per slot.
2. Dodać walidację configu dla string/object entries.
3. W `loadFromConfig` załadować i zarejestrować pluginy zewnętrzne.

**DoD A**
- `plugins.<slot>[]` działa dla wpisu string i `{ module, config }`.
- Plugin o niezgodnym slocie jest ignorowany.

## Etap B — Developer ergonomics (should-have)
1. Dodać przykłady konfiguracji i troubleshooting load failures.
2. Dodać minimalny guide dla authorów pluginów (manifest/create expectations).

**DoD B**
- Dev potrafi podpiąć custom plugin bez modyfikacji core source.

## Etap C — Optional quality hardening (nice-to-have)
1. Rozważyć ostrzeżenia telemetryczne dla failed importów pluginów.
2. Rozważyć hot-reload pluginów (future).

---

## 4. Test plan

```sh
cd /home/rascal/agent-weaver

pnpm --filter @composio/ao-core test -- plugin-registry config-validation
# expected: exit 0

pnpm --filter @composio/ao-core test
# expected: exit 0
```

---

## 5. Kryteria zamknięcia Epica 6

1. Plugin discovery z configu działa dla obu form wpisów.
2. Niezgodny slot jest bezpiecznie ignorowany.
3. Testy registry + config przechodzą deterministycznie.
