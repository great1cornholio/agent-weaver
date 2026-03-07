# Roadmap --- opcje do przemyślenia

Dokument zbiera pomysły i kierunki rozwoju wykraczające poza scope v1.0.
Każda pozycja ma ocenę złożoności, zysku i sugerowaną wersję.

---

## R-001: Queue lookahead --- inteligentne grupowanie tasków

**Wersja:** v1.5
**Złożoność:** Średnia
**Zysk:** Lepsze wykorzystanie GPU gdy w kolejce czekają taski na różne modele

Scheduler analizuje N następnych tasków w kolejce i grupuje te, które
mogą iść równolegle na **już załadowanych** modelach. Bez model
swappingu --- operuje tylko na wolnych slotach istniejących serwerów.

**Przykład:** Kolejka `coordinator(80B) → coder(30B) → coder(30B)`.
Slot 80B zajęty, ale 2 sloty 30B wolne → scheduler przeskakuje
coordinator, uruchamia obu coderów.

**Wymagania:**

- Mechanizm anti-starvation: max N przeskoków per task (np. 2),
  potem task dostaje priorytet absolutny
- Scheduler musi znać zależności między taskami (subtask od coordinatora
  nie może przeskoczyć swojego coordinatora)
- Konfigurowalny w YAML: `concurrency.queueLookahead: 5` (ile pozycji
  do przodu analizować)

**Ryzyka:**

- Naruszenie kolejności tasków z zależnościami
- Starvation dużych modeli przez ciągły napływ małych tasków

---

## R-002: Dynamic model swapping

**Wersja:** v2.0
**Złożoność:** Wysoka
**Zysk:** Pełne dynamiczne wykorzystanie VRAM --- system sam decyduje
jakie modele załadować w danym momencie

Scheduler zyskuje kontrolę nad procesami llama-server: może stopować
serwer z jednym modelem i startować z innym, dynamicznie
przeorganizowując VRAM.

**Przykład:** Nocą nie ma tasków planistycznych → scheduler wyłącza
serwer 80B (zwalnia ~60 GB), startuje 3× serwer 30B. Rano odwraca.

**Wymagania:**

- Graceful shutdown llama-server (poczekaj na zakończenie inference)
- Model loading time budget (~30-60s na załadowanie 80B z dysku)
- Process manager w schedulerze (start/stop/restart llama-server)
- Tryby pracy (Normalny/Burst/Batch) jako automatyczne polityki
  zamiast ręcznej konfiguracji

**Ryzyka:**

- Czas swapowania modeli (30-60s downtime per operacja)
- Złożoność zarządzania procesami GPU
- Potencjalne leaki VRAM przy częstym ładowaniu/wyładowywaniu

---

## R-003: Multi-instance federation (Opcja B)

**Wersja:** v2.0+
**Złożoność:** Bardzo wysoka
**Zysk:** Dwie lub więcej maszyn z pełną instancją ao, koordynatorzy
współpracują ze sobą --- pełna kontrola nad każdym hostem

Zamiast prostych remote endpointów (Opcja A, zaimplementowana w v1.0),
każdy host uruchamia własną instancję agent-orchestrator. Koordynatorzy
z obu instancji komunikują się i mogą delegować taski między sobą.

**Co daje vs Opcja A (remote endpoint):**

| Aspekt              | Opcja A (v1.0)             | Opcja B (federation)     |
| ------------------- | -------------------------- | ------------------------ |
| Kontrola nad hostem | Brak (zakładasz że działa) | Pełna (ao zarządza)      |
| Failure recovery    | Ręczna                     | Automatyczna             |
| Task delegation     | Brak (tylko inference)     | Pełna (task → remote ao) |
| Dashboard           | Jeden (centralny)          | Federowany widok         |
| Złożoność           | Niska                      | Bardzo wysoka            |

**Wymagania:**

- Protokół discovery: jak instancje się znajdują (static peers w YAML /
  mDNS / registry)
- Protokół negocjacji: REST API / message queue (NATS) / webhooks
  między instancjami
- Federowany VRAM Scheduler: każda instancja zarządza swoim hostem,
  ale udostępnia status innym
- Consensus / leader election: kto jest master coordinator?
- Distributed state: shared knowledge o sesjach i taskach
- Network partition tolerance: co gdy hosty chwilowo się nie widzą?

**Warianty:**

- **Peer-to-peer:** Oba koordynatorzy równorzędni, oba mogą inicjować
  i delegować taski. Bardziej elastyczne, trudniejsze w implementacji.
- **Hub-spoke:** Jeden master coordinator deleguje do remote workerów.
  Prostsze, ale single point of failure.

**Podejście przyrostowe:**

1. v1.0 --- Opcja A: remote endpointy, prosty host-aware scheduler
2. v1.5 --- Dodaj remote health monitoring i auto-failover
3. v2.0 --- Federacja: remote ao instancja jako "managed worker"
4. v2.5 --- Peer-to-peer cooperation między koordynatorami

**Ryzyka:**

- Distributed systems are fundamentally hard
- +4-6 tygodni nad harmonogramem v1.0
- Git worktrees są lokalne --- remote host potrzebuje własnego clone
- Reactions engine (CI, review) --- która instancja nasłuchuje?
- Merge conflicts między taskami na różnych hostach

---

## R-006: Scheduler persistence i crash recovery

**Wersja:** v1.5
**Złożoność:** Średnia
**Zysk:** Bezpieczne restartowanie VRAM Scheduler bez utraty stanu slotów

VRAM Scheduler trzyma stan (used_slots, agent_counts) wyłącznie
w pamięci RAM. Restart sidecar = utrata informacji o tym, ile slotów
jest zajętych → potencjalne over-allocation lub slot leaks.

**Opcje:**

- **SQLite file:** `state.db` obok YAML config. Prosty, atomiczny zapis.
- **Redis:** Jeśli w przyszłości będzie federation (R-003), Redis daje
  shared state out of the box.
- **Reconciliation at startup:** Scheduler przy starcie pyta llama-server
  `/v1/models` i `/slots` (jeśli dostępne), porównuje z persystentnym
  stanem i naprawia rozbieżności.

**Wymagania:**

- Minimum: SQLite z WAL mode
- Opcjonalnie: periodic snapshot (co 30s) + replay at startup
- Graceful shutdown: flush state → DB przy SIGTERM
- Health endpoint raportuje czas od ostatniego snapshotu

**Ryzyka:**

- Dodatkowy I/O (minimalne przy SQLite WAL)
- Rozbieżność stan DB vs rzeczywistość (rozwiązuje reconciliation)

---

## R-004: Plugin discovery i developer API

**Wersja:** v1.5
**Złożoność:** Średnia
**Zysk:** System naprawdę plugin-friendly --- łatwo dodawać nowe pluginy
bez modyfikacji core

Obecny system ma interfejsy dla 2 z 8 typów pluginów (AgentPlugin,
NotifierPlugin). Brakuje:

- Interfejsy dla pozostałych slotów (Runtime, Workspace, Tracker, SCM,
  Terminal, Lifecycle)
- Mechanizm discovery: jak ao znajduje i ładuje pluginy
- Plugin lifecycle hooks: onInit, onDestroy, healthCheck
- Typed config per plugin (Zod schema zamiast `cfg: any`)
- Event bus: komunikacja między pluginami

**Deliverable:** Plugin Developer Guide --- "jak napisać plugin w 30 min"

---

## R-005: Nowe typy agentów

**Wersja:** v1.5+
**Złożoność:** Niska--Średnia per typ
**Zysk:** Specjalizacja agentów pod konkretne zadania

Potencjalne nowe typy:

- **devops** --- konfiguracja CI/CD, Dockerfile, infrastruktura
- **documenter** --- generowanie/aktualizacja dokumentacji, README,
  API docs
- **refactorer** --- refaktoring istniejącego kodu bez zmiany
  zachowania (z zachowaniem testów)
- **security** --- analiza bezpieczeństwa, dependency audit, SAST

Każdy nowy typ = nowy system prompt + opcjonalnie dedykowany model

- wpis w `agentTypes` YAML.

---

---

## R-008: `ao session attach` --- szybkie podłączanie do tmux po Session ID

**Wersja:** v1.5
**Złożoność:** Niska
**Zysk:** Lepszy UX operacyjny --- użytkownik nie musi znać wewnętrznej nazwy tmux (`<prefix>-<sessionId>`)

Obecnie podłączenie do sesji wymaga ręcznego mapowania `sessionId` (np. `sbx-1`)
na rzeczywisty target tmux (np. `8a31b19174a0-sbx-1`).
Dodanie komendy `ao session attach <sessionId>` powinno rozwiązać ten problem
przez odczyt `runtimeHandle.id` z metadanych sesji i automatyczne
`tmux attach -t <target>`.

**Zakres MVP:**

- `ao session attach <sessionId>` dla runtime `tmux`
- Czytelny błąd, gdy sesja nie istnieje lub nie ma aktywnego tmux target
- Fallback do `sessionId`, jeśli `runtimeHandle.id` nie jest dostępne

**Zakres rozszerzony (opcjonalny):**

- `ao session attach --project <id> <sessionId>` (walidacja jednoznaczności)
- `ao session logs <sessionId>` (capture-pane bez attach)

**Wymagania:**

- Spójne zachowanie z istniejącym `session ls` i `session kill`
- Testy CLI dla happy-path + error-path
- Brak regresji dla innych runtime'ów (process/docker)

**Ryzyka:**

- Rozbieżność metadanych vs rzeczywisty stan tmux (sesja ubita ręcznie)
- Niejednoznaczność nazw, jeśli użytkownik ręcznie zmienia nazwy tmux

---

## R-007: Harmonogram implementacji --- rekomendacja

**Kluczowa zasada:** Zbuduj "simple workflow" end-to-end, potem
rozbudowuj do "full workflow" z wieloma agentami.

**Faza 1 (v1.0-alpha, ~3 tygodnie):**

- agent-aider plugin (developer only) + VRAM Scheduler (1 host)
- workflow: simple --- ao spawn → developer → PR → Telegram HITL
- Cel: działający pipeline dla jednego developera

**Faza 2 (v1.0-beta, +2 tygodnie):**

- coordinator-plugin + reviewer-plugin
- TaskPipelineManager (topologiczne sortowanie, warstwy)
- workflow: full --- coordinator → tester → developer → reviewer
- multi-host (remote endpoints)
- Cel: pełny multi-agent flow z 2+ hostami

**Faza 3 (v1.0, +1 tydzień):**

- Profile VRAM (walidacja budżetu przy starcie)
- testCmd z YAML + AGENTS.md override
- Stabilizacja, edge-case'y, dokumentacja AGENTS.md per projekt

**Post v1.0:** Roadmap items R-001 → R-008.

---

## R-009: Skills roadmap --- kandydaci do wyboru

Poniższa tabela zbiera kandydatów na "skille" dla Agent Weavera.
To nie jest backlog do ślepej realizacji 1:1 --- celem jest ułatwienie wyboru,
co naprawdę wzmacnia przewagę projektu jako:

- orchestratora dla **lokalnych LLM/GPU**,
- systemu z **planowaniem zasobów**,
- platformy z **rolami agentów**.

### Skala rekomendacji

- **Build now** --- mocny kandydat do najbliższych wersji
- **Build later** --- wartościowe, ale po ustabilizowaniu fundamentów
- **Explore** --- kierunek badawczy / eksperymentalny
- **Avoid for now** --- ciekawe, ale nieopłacalne na tym etapie

### Skala priorytetu

- **P0** --- krytyczne dla przewagi produktu
- **P1** --- bardzo ważne po fundamencie
- **P2** --- przydatne, ale nieblokujące
- **P3** --- eksperymentalne lub niszowe

| Skill | Obszar | Zysk | Złożoność | Priorytet | Rekomendacja |
| --- | --- | --- | --- | --- | --- |
| Semantic code navigation | Core coding | Dużo lepsze poruszanie się po repo, mniej halucynacji lokalnych modeli | Średnia | P0 | Build now |
| Intelligent repo search | Core coding | Lepsze trafianie w właściwe pliki i moduły | Średnia | P0 | Build now |
| Targeted file context packing | Core coding | Mniejsze zużycie kontekstu, lepsza precyzja | Średnia | P0 | Build now |
| Diff summarization | Core coding / review | Lepszy reviewer, lepsze statusy dla człowieka i orchestratora | Niska | P1 | Build now |
| Architecture-aware context | Core coding | Mniej przypadkowych naruszeń granic architektury | Średnia | P1 | Build later |
| Test runner skill | Quality | Fundament autonomicznej pracy agentów | Niska | P0 | Build now |
| Lint and formatter skill | Quality | Tanie zwycięstwa, mniej hałasu w feedback loop | Niska | P0 | Build now |
| Failing test triage | Quality | Szybsze rozróżnianie regresji, flaky, env i realnych błędów | Średnia | P1 | Build now |
| TDD guard skill | Quality / workflow | Wzmacnia role tester/developer i pipeline red → green | Średnia | P1 | Build now |
| Coverage-aware suggestions | Quality | Podnosi jakość testów, ale nie jest konieczne na start | Średnia | P2 | Build later |
| Reviewer skill | Review | Jeden z głównych wyróżników rolowego workflow | Średnia | P0 | Build now |
| Security review skill | Review | Wysoka wartość praktyczna dla PR/MR review | Średnia | P1 | Build later |
| Performance review skill | Review | Przydatne, ale trudniejsze do zrobienia dobrze | Średnia | P2 | Build later |
| Regression risk assessment | Review | Lepsze decyzje merge / release / escalation | Średnia | P1 | Build later |
| PR/MR comment responder | Review / SCM | Bardzo wysoki ROI operacyjny | Średnia | P0 | Build now |
| Task decomposition skill | Planning | Klucz do sensownej wieloagentowości | Średnia | P0 | Build now |
| Complexity classifier | Planning | Pozwala rozróżnić simple workflow vs full workflow | Niska | P1 | Build now |
| Role assignment skill | Planning | Łączy planowanie z systemem ról agentów | Średnia | P1 | Build now |
| Dependency graph builder | Planning | Umożliwia topologiczne wykonanie subtasków | Średnia | P1 | Build now |
| Escalation policy skill | Planning / UX | Mniej bezsensownych blokad i lepszy handoff do człowieka | Średnia | P1 | Build later |
| Model routing skill | Resource planning | Jedna z największych przewag lokalnego orchestratora | Średnia | P0 | Build now |
| VRAM placement skill | Resource planning | Core przewagi Agent Weavera wobec upstream | Średnia | P0 | Build now |
| Warm-model reuse | Resource planning | Lepsza latencja i mniejsze marnowanie zasobów | Średnia | P1 | Build later |
| Cost/latency aware scheduling | Resource planning | Lepszy trade-off jakość vs szybkość vs koszt | Wysoka | P2 | Build later |
| Queue prioritization skill | Resource planning | Lepsza przewidywalność kolejki i obsługa blockerów | Średnia | P1 | Build now |
| Capacity forecasting | Resource planning | Przydatne dla dashboardu i planowania pracy | Średnia | P2 | Build later |
| Issue understanding skill | Tracker | Lepsze wyciąganie acceptance criteria z ticketów | Niska | P1 | Build now |
| Issue enrichment skill | Tracker | Pomaga orchestratorowi i planowaniu, ale nie jest krytyczne | Niska | P2 | Build later |
| Branch/PR strategy skill | SCM | Lepszy porządek i reviewability zmian | Niska | P2 | Build later |
| Merge readiness skill | SCM | Praktyczne domknięcie workflow PR/MR | Średnia | P1 | Build later |
| Rebase / conflict triage skill | SCM | Bardzo cenne, ale trudne semantycznie | Wysoka | P2 | Explore |
| Browser verification skill | Frontend | Bardzo duży ROI dla UI i smoke verification | Średnia | P1 | Build later |
| Screenshot diff / visual validation | Frontend | Dobre uzupełnienie frontendu i review | Średnia | P2 | Build later |
| Figma/design context skill | Frontend | Przydatne dla frontend teams, ale wtórne wobec core | Średnia | P2 | Build later |
| Storybook/component inspection | Frontend | Wartościowe dla UI repos, ale nie uniwersalne | Średnia | P2 | Build later |
| Logs triage skill | Debugging | Bardzo praktyczne dla fix loops i CI | Średnia | P1 | Build now |
| Incident/debug skill | Debugging | Silne wsparcie dla production-like tasks | Wysoka | P1 | Build later |
| CI failure analyzer | Debugging / CI | Jeden z najlepszych skillów do automatyzacji feedbacku | Średnia | P0 | Build now |
| Flaky test detector | Debugging / Quality | Dobre, ale z natury trudne i podatne na false positive | Wysoka | P2 | Explore |
| Project memory skill | Memory | Długofalowa poprawa jakości agentów i ciągłości pracy | Średnia | P1 | Build later |
| Session continuity skill | Memory | Bardzo przydatne dla długich tasków i restartów | Średnia | P1 | Build later |
| Decision log skill | Memory / governance | Dobre dla review i architektury, ale nie krytyczne | Niska | P2 | Build later |
| Clarification question skill | Human interaction | Ogromny wpływ na UX przy małym koszcie | Niska | P1 | Build now |
| Status summarization skill | Human interaction | Bardzo przydatne dla orchestratora i dashboardu | Niska | P1 | Build now |
| Decision handoff skill | Human interaction | Czytelniejsze proszenie człowieka o decyzję | Niska | P1 | Build later |
| Multi-agent debate | Experimental | Potencjalnie wysoka jakość, ale wysoki koszt i złożoność | Wysoka | P3 | Avoid for now |
| Self-critique skill | Experimental | Może poprawić słabsze modele lokalne | Średnia | P2 | Explore |
| Dynamic model swapping | Experimental / resources | Strategicznie ważne dla local-first, ale trudne operacyjnie | Wysoka | P1 | Explore |
| Federation skill | Experimental / distributed | Silnie zgodne z wizją multi-host, ale bardzo drogie implementacyjnie | Bardzo wysoka | P3 | Explore |
| Skill marketplace / external bundles | Platform | Dobre dopiero po ustabilizowaniu rdzenia | Wysoka | P3 | Avoid for now |

### Rekomendowany pakiet startowy (najmocniejszy fit do Agent Weavera)

Jeśli trzeba wybrać **mały zestaw skilli o najwyższym ROI**, rekomendacja jest taka:

#### Pakiet A --- "core local orchestrator"

- Semantic code navigation
- Targeted file context packing
- Test runner skill
- Lint and formatter skill
- Reviewer skill
- Task decomposition skill
- Model routing skill
- VRAM placement skill
- CI failure analyzer

**Dlaczego:** ten zestaw najmocniej wzmacnia to, co odróżnia projekt od upstream:
lokalne modele, planowanie zasobów, role agentów i autonomiczne pętle naprawcze.

#### Pakiet B --- "role-based workflow"

- PR/MR comment responder
- Complexity classifier
- Role assignment skill
- Dependency graph builder
- TDD guard skill
- Status summarization skill

**Dlaczego:** ten pakiet naturalnie rozwija orchestratora, coordinatora, testera,
developera i reviewera w spójny workflow.

#### Pakiet C --- "next wave"

- Logs triage skill
- Project memory skill
- Session continuity skill
- Warm-model reuse
- Browser verification skill

**Dlaczego:** to bardzo wartościowe rozszerzenia po ustabilizowaniu rdzenia.

### Krótka rekomendacja produktowa

Jeśli roadmapa ma wspierać pozycjonowanie projektu jako:

> "agent-orchestrator dla lokalnych LLM/GPU, z planowaniem zasobów i rolami agentów"

to najbezpieczniejsza kolejność inwestycji wygląda tak:

1. **Najpierw skille wzmacniające local-first i resource planning**
2. **Potem skille wzmacniające role i workflow orchestration**
3. **Dopiero później skille frontendowe, federacyjne i platformowe**

Inaczej łatwo rozmyć przewagę projektu w stronę ogólnej platformy agentowej,
gdzie upstream porusza się szybciej.

---

_Ostatnia aktualizacja: Luty 2026_
