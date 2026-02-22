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

| Aspekt               | Opcja A (v1.0)           | Opcja B (federation)        |
|----------------------|--------------------------|------------------------------|
| Kontrola nad hostem  | Brak (zakładasz że działa)| Pełna (ao zarządza)          |
| Failure recovery     | Ręczna                   | Automatyczna                 |
| Task delegation      | Brak (tylko inference)   | Pełna (task → remote ao)     |
| Dashboard            | Jeden (centralny)        | Federowany widok             |
| Złożoność            | Niska                    | Bardzo wysoka                |

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
+ wpis w `agentTypes` YAML.

---

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

**Post v1.0:** Roadmap items R-001 → R-006.

---

*Ostatnia aktualizacja: Luty 2026*
