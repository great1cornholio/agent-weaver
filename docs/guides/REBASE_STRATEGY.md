# Strategia Rebase'owania Nadrzędnego Projektu (Upstream Rebase Strategy)

Ten dokument stanowi restrykcyjny zbiór zasad regulujących sposób, w jaki kolejne Agenty powinny podchodzić do synchronizacji (rebase/merge) odgałęzienia "Agent Weaver" z głównym nurtem (upstream) repozytorium `ComposioHQ/agent-orchestrator`.

Procesy aktualizacji nie powinny być uruchamiane przy każdym nowym commicie upstreama, ale wyłącznie po osiągnięciu ważnych kamieni milowych przez oryginalnego wydawcę.

---

## 1. Mapowanie Różnic i Ochrona Terytorium

Zanim zaczniesz cokolwiek, Agent musi zrozumieć i zinwentaryzować "terytorium".
Nasz fork (Weaver) wprowadził unikalne, niezaadoptowane jeszcze do rdzenia komponenty, w szczególności opierające się o modele sprzętowe i procesy GitLab. Stanowią one **absolutny priorytet przetrwania** w trakcie rozwiązywania konfliktów:

- **Zarządzanie Zapasami (VRAM Scheduler):** Integracje związane z planowaniem zasobów lokalnych układów graficznych / LLMs (np. `packages/core/src/vram-client.ts`, struktury sprzętowe uwzględniające `hosts`, `slots` oraz wstrzymywanie `session-manager.ts`).
- **Wsparcie dla Ekosystemu GitLab:** Kompletne implementacje SCM i Trackerów umiejscowione w `packages/plugins/scm-gitlab` oraz `packages/plugins/tracker-gitlab`.
- **Kaganiec na Lokalne LLMs:** Zmodyfikowane pod kątem testów wtyczki dla Agenta Aidera (`packages/plugins/agent-aider`) chroniące przed nieskończonym zapętleniem powłoki przez modele takie jak _Qwen3 Coder_.

Gdy napotkasz konflikt związany bezpośrednio z tą logiką – faworyzujesz i bronisz implementacji po stronie _Weavera_.

## 2. Metodyka "Squash and Go"

Nigdy nie podejmujemy rebase'a z długą listą dziesiątek historycznych commitów z naszej strony. Próba parowania 25 naszych małych poprawek rzuconych przeciwko 80 nadchodzącym zmianom to przepis na katastrofę deweloperską. Preferowany proces:

1. Spłaszczenie (Squash) naszych dokonanych poprawek w pojedyncze logiczne filary (np. "Feature: VRAM Controller Core", "Feature: Complete Gitlab Integration").
2. Rebase wykonuj podkładając upstream pod te masywne, ujednolicone klocki, a nie poszarpaną historię.

## 3. Konflikty Komponentów Bazowych (Core Conflict Resolutions)

W plikach ogólnych interfejsów i architektury (`packages/core/`) prawdopodobieństwo ostrych konfliktów tekstowych jest największe.
**Złota Zasada:** W mechanikach platformy akceptuj napływający kod od oryginalnych twórców (`Accept Both` lub używaj Upstream), o ile **nie zdejmuje on blokady VRAM** ani **nie niszczy systemu wstrzykiwania lokalnych wtyczek**.

## 4. Testuj, Ufaj Błędom i Wycofuj W Razie Regresji

Rebase to dopiero początek integracji. Jeśli projekt utraci zdolność kompilacji po synchronizacji plików, operacja scalania staje się nieudana.  
Po rebase'owaniu obowiązkowo przepuszczasz:

1. `pnpm build && pnpm check` (Weryfikujemy strukturę i ewentualnie zgubione typy w Typescript).
2. Spuszczasz obciążenie E2E poprzez _Gitlab Real Integration Test_: `pnpm vitest run packages/integration-tests/src/e2e/scenarios/gitlab-real.integration.test.ts` w środowisku z aktywnym Llama.cpp / wirtualizatorem Aidera.
