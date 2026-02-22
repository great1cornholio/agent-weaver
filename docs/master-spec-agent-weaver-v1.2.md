**MASTER SPEC**

**System Multiagentowy do Autonomicznego Kodowania**

AMD Strix Halo · 128 GB Unified RAM · Qwen3-Coder · fork
ComposioHQ/agent-orchestrator

  ----------------- -----------------------------------------------------
  **Platforma**     AMD Strix Halo · 128 GB Unified RAM ·
                    Vulkan/llama.cpp

  **Modele LLM**    Konfigurowalne per typ agenta (sekcja 5A).
                    Domyślnie: GPT-OSS-120 (Coordinator) +
                    Qwen3-Coder-Next 80B (Reviewer) +
                    Qwen3-Coder 30B-A3B (Developer/Tester).
                    Profile VRAM w sekcji 3.2.

  **Baza projektu** Fork: github.com/ComposioHQ/agent-orchestrator (MIT)
                    · TypeScript · 40K LOC · 3288 testów

  **Task tracker**  GitLab Issues → tracker-gitlab plugin (nowy) ·
                    bez Trello

  **HITL / UX**     Telegram Bot + Web Dashboard (Next.js 15 · SSE) + CLI
                    (ao status)

  **Język           TypeScript (pluginy ao) + Python (VRAM Scheduler
  implementacji**   sidecar)

  **Licencja**      MIT --- pełna swoboda forkowania, użytku prywatnego i
                    komercyjnego

  **Data**          Luty 2026 · Wersja 1.1
  ----------------- -----------------------------------------------------

**1. Kontekst i cel projektu**

Projekt ma na celu zbudowanie w pełni autonomicznego systemu, który
przejmuje cykl życia tasków deweloperskich: od momentu stworzenia GitLab
Issue --- przez planowanie, implementację TDD, code review, CI/CD --- aż
do merge\'a MR bez bezpośredniej interwencji człowieka. Człowiek jest
angażowany wyłącznie w decyzje wymagające oceny (HITL).

**1.1 Problem który rozwiązujemy**

Prowadzenie wielu projektów jednocześnie przy ograniczonej uwadze
jednego dewelopera. Obecne podejście: agenty AI mogą kodować, ale
zarządzanie nimi (śledzenie statusów, routowanie feedbacku CI, obsługa
review comments, koordynacja między projektami) pochłania więcej uwagi
niż samo kodowanie.

**1.2 Mierniki sukcesu**

  ------------------------------- ------------------- --------------------
            **Metryka**                 **Cel**        **Akceptowalnie**

   **GitLab Issue → MR merged**     \>70% bez HITL           \>50%

   **CI self-correction (jak ao          \>80%               \>60%
            baseline)**                               

   **Równoległe sesje bez OOM**       3 workerów           2 workerów
                                       stabilnie      

  **Czas setup nowego projektu**      \<10 minut           \<30 minut
  ------------------------------- ------------------- --------------------

**2. Architektura systemu**

**2.1 Schemat warstwowy**

+-----------------------------------------------------------------------+
| ┌────────────────────────────────────────────────────────────────┐    |
|                                                                       |
| │ WARSTWA 0 --- INTERFEJS UŻYTKOWNIKA │                               |
|                                                                       |
| │ Telegram Bot (HITL) · Web Dashboard (http://localhost:3000) │       |
|                                                                       |
| │ ao CLI (ao status / ao spawn / ao send) │                           |
|                                                                       |
| ├────────────────────────────────────────────────────────────────┤    |
|                                                                       |
| │ WARSTWA 1 --- ORCHESTRATOR (ao core) │                              |
|                                                                       |
| │ Session Manager · Reactions Engine · Priority Queue │               |
|                                                                       |
| │ GitLab Issues tracker-plugin (nowy, sekcja 6E) │                    |
|                                                                       |
| │ VRAM Scheduler (Python sidecar, port 9090) │                        |
|                                                                       |
| ├────────────────────────────────────────────────────────────────┤    |
|                                                                       |
| │ WARSTWA 2 --- AGENT POOL (3 pluginy agentowe) │                     |
|                                                                       |
| │ coordinator-plugin · agent-aider · reviewer-plugin │               |
| │ 4 typy: coordinator · developer · reviewer · tester │              |
|                                                                       |
| │ TaskPipelineManager orkiestruje subtaski z planu coordinatora │    |
|                                                                       |
| │ Każda sesja: osobny worktree + branch + agentType + model │        |
|                                                                       |
| ├────────────────────────────────────────────────────────────────┤    |
|                                                                       |
| │ WARSTWA 3 --- INFERENCE (multi-host, llama.cpp Vulkan) │            |
|                                                                       |
| │ Hosty: local (localhost) + remote (np. 192.168.1.50) │             |
|                                                                       |
| │ Modele per host z `hosts` w YAML · profile VRAM (sek. 3.2) │      |
|                                                                       |
| └────────────────────────────────────────────────────────────────┘    |
+-----------------------------------------------------------------------+

**2.2 Pluginy ao i ich mapowanie na wymagania**

agent-orchestrator operuje na 8 wymiennych slotach. Poniżej mapowanie
każdego slotu na konkretną implementację w naszym systemie.

  --------------- ----------------- ------------------- ------------------------
     **Slot**      **Plugin (ao)**        **Nasza              **Uwagi**
                                      implementacja**   

    **Runtime**    tmux (default)     tmux → docelowo    Docker runtime plugin
                                          docker           już istnieje w ao

     **Agent**       claude-code     3 pluginy agentowe:     Każdy typ agenta ma
                      (default)     · agent-aider          dedykowany plugin
                                      (developer, tester)  (sekcja 6):
                                    · coordinator-plugin   · Aider = edycja kodu
                                      (coordinator)        · Coordinator = direct
                                    · reviewer-plugin        LLM + JSON planning
                                      (reviewer)           · Reviewer = diff
                                                             analysis + glab CLI

   **Workspace**      worktree         worktree (bez     git worktree per sesja
                                          zmian)          --- izolacja plików

    **Tracker**   github (natywny)  tracker-gitlab       GitLab Issues = source
                                       (nowy plugin)      of truth, glab CLI

      **SCM**          github       scm-gitlab           MR creation, enrichment,
                                       (nowy plugin)      auto-link do Issue

   **Notifier**        desktop       notifier-telegram   Telegram + HITL inline
                                       (nowy plugin)            keyboard

   **Terminal**     web / iterm2      web (bez zmian)   xterm.js w przeglądarce

   **Lifecycle**   core reactions    core (dostosowany     CI → agent, review →
                                     do GitLab webhooks)  agent, approve → notify
  --------------- ----------------- ------------------- ------------------------

+-----------------------------------------------------------------------+
| **Ważne --- co NIE wymaga pisania**                                   |
|                                                                       |
| Workspace worktree, Terminal web --- to działa out-of-the-box.        |
|                                                                       |
| **Piszemy:**                                                          |
| · agent-aider plugin (developer + tester)                             |
| · coordinator-plugin (direct LLM call + JSON planning)                |
| · reviewer-plugin (diff analysis + glab CLI comments)                 |
| · notifier-telegram plugin                                            |
| · tracker-gitlab plugin (GitLab Issues ↔ ao sessions)                |
| · scm-gitlab plugin (MR creation, branch mgmt, glab CLI)             |
| · reactions adapter (GitLab Webhooks → ao reactions engine)           |
| · VRAM Scheduler sidecar (Python)                                     |
| · Task Pipeline Manager (orkiestracja subtasków, sekcja 6A)          |
+-----------------------------------------------------------------------+

**3. Zarządzanie VRAM --- profile i budżetowanie**

**3.1 Słownik modeli i zużycie VRAM**

Każdy model ma stałe zużycie VRAM zależne od kwantyzacji. Do tego
dochodzi KV cache per slot inference (zależy od ctx-size i kwantyzacji
cache). `hosts.*.models.*.vramGb` powinno odzwierciedlać **łączne**
zużycie: model + KV cache × maxSlots.

  -------------------- ------------- --------- ---------- ------- ----------
     **Model**          **Kwant.**   **Model   **KV/slot  **Tok/s  **Łącznie
                                      VRAM**    (32K,       (est.)  1 slot**
                                               q4_1)**
  GPT-OSS-120            Q4_K_XL      ~58 GB    ~2 GB    ~30 t/s   **~60 GB**
  Qwen3-Coder-Next 80B   Q4_K_XL     ~45 GB    ~2 GB    ~54 t/s   **~47 GB**
  Qwen3-Coder 30B-A3B    Q4_K_M      ~16 GB    ~2 GB    ~85 t/s   **~18 GB**
  -------------------- ------------- --------- ---------- ------- ----------

**3.2 Profile --- predefiniowane zestawy modeli**

Profile to gotowe kombinacje modeli, które mieszczą się w VRAM danego
hosta. `hosts.*.models` w YAML musi odpowiadać jednemu z profili (lub
custom --- ale suma vramGb musi zmieścić się w totalnym VRAM hosta).

  ---------------- ------------------------------ ------- ---------- --------
    **Profil**           **Modele**                **VRAM   **Kiedy**  **Host
                                                   suma**              128 GB**

  **full-stack**    GPT-OSS-120 + Qwen3-30B×2     ~96 GB  Coordinator  Mieści
                                                           + 2 workery  się

  **full-planning** GPT-OSS-120 + Qwen3-80B       ~107 GB Coordinator  Mieści
   (Strix Halo)    (oba na jednym hoście)                  + reviewer   się

  **dev-heavy**     Qwen3-80B + Qwen3-30B×2       ~83 GB  Dev/review   Mieści
                                                           + 2 testery  się

  **batch**         Qwen3-30B×3                    ~54 GB  Masowe       Mieści
                                                           execution    się

  **coordinator     GPT-OSS-120 + Qwen3-30B       ~78 GB  Planning +   Mieści
   +dev**                                                  1 worker     się

  **review-only**   Qwen3-30B×1                    ~18 GB  Code review  Mieści
                                                           w tle        się
  ---------------- ------------------------------ ------- ---------- --------

**Ważne:** Na AMD Strix Halo (128 GB) GPT-OSS-120 (60 GB) i Qwen3-80B
(47 GB) **mieszczą się razem** (107 GB) --- profil `full-planning`.
Na hostach z mniejszą VRAM (<108 GB) profil musi wybrać jedno z nich;
gdy potrzebujesz obu, drugi model na remote hoście.

**3.3 Walidacja budżetu VRAM**

Reguła: suma `vramGb` wszystkich modeli w `hosts.*.models` musi być
≤ total VRAM hosta. System powinien walidować to przy starcie:

+-----------------------------------------------------------------------+
| # Walidacja w VRAM Scheduler przy starcie:                            |
| for host_name, h in HOSTS.items():                                    |
|     total_vram = sum(m["vram_gb"] * m["max_slots"]                    |
|                      for m in h["models"].values())                   |
|     host_limit = h.get("totalVramGb", 128)   # domyślnie Strix Halo  |
|     if total_vram > host_limit:                                       |
|         raise ConfigError(                                            |
|             f"Host {host_name}: {total_vram}GB > {host_limit}GB")    |
+-----------------------------------------------------------------------+

Do YAML hosta dodaj pole `totalVramGb`:

+-----------------------------------------------------------------------+
| hosts:                                                                |
|   local:                                                              |
|     address: localhost                                                |
|     totalVramGb: 128       # AMD Strix Halo (128 GB Unified RAM)     |
|     healthCheck: http://localhost:8080/health                         |
|     models: ...            # suma vramGb <= 128                       |
+-----------------------------------------------------------------------+

**3.4 Uruchomienie llama.cpp serwerów (przykład: profil full-stack)**

+-----------------------------------------------------------------------+
| # GPT-OSS-120 (coordinator) --- port 8082, 1 slot                    |
| ./llama-server -m gpt-oss-120-q4_k_xl.gguf \                         |
|   --n-gpu-layers 99 --port 8082 --ctx-size 65536 \                   |
|   --cache-type-k q4_1 --cache-type-v q4_1 --threads 8                |
|                                                                       |
| # Qwen3-Coder 30B (developer/tester) --- port 8081, 2 sloty          |
| ./llama-server -m qwen3-coder-30b-a3b-q4_k_m.gguf \                  |
|   --n-gpu-layers 99 --port 8081 --ctx-size 32768 \                   |
|   --cache-type-k q4_1 --parallel 2 --threads 8                       |
+-----------------------------------------------------------------------+

**3.5 Zarządzanie context window --- strategia i limity**

Qwen3-Coder 30B ma 32K tokenów context window. Przy typowej sesji
Aidera zużycie kontekstu składa się z wielu elementów, które łatwo
mogą przekroczyć budżet:

+-----------------------------------------------------------------------+
| Budżet context window (32K tokenów, Qwen3-30B):                      |
|                                                                       |
| Komponent                    | Tokeny (est.)  | Źródło               |
| ────────────────────────── | ────────────── | ──────────────────── |
| System prompt (prompts/*.md) | ~500-1000      | Stały per agent type  |
| AGENTS.md (projekt)          | ~300-800       | Stały per projekt     |
| Issue body + metadata        | ~200-2000      | Zmienny per Issue     |
| Repo map (Aider)             | ~2000-8000     | Zależy od rozmiaru    |
| Edytowane pliki              | ~2000-15000    | Główne zużycie        |
| Testy (istniejące + nowe)    | ~1000-5000     | Rośnie w trakcie      |
| Aider conversation history   | ~1000-5000     | Rośnie w trakcie      |
| ────────────────────────── | ────────────── |                       |
| RAZEM (typowy case)          | ~10K-25K       | Mieści się            |
| RAZEM (worst case)           | ~30K-40K       | ⚠️ Przekroczenie     |
+-----------------------------------------------------------------------+

**Strategie zarządzania:**

1. **Aider repo map budget:** Aider automatycznie ogranicza repo map
   do ~25% context window. Konfiguracja:
   `--map-tokens 8000` (jawny limit zamiast domyślnego).

2. **File scoping:** Coordinator w SubtaskPlan podaje `files[]` ---
   listę plików w scope subtaska. agent-aider przekazuje je do Aidera
   jako `--file`, ograniczając kontekst do relevantnych plików.
   **Bez `files[]` Aider może załadować cały repo.**

3. **Issue body truncation:** Jeśli Issue body > 3000 znaków,
   agent-aider obcina do pierwszych 3000 znaków + dodaje note
   "Pełny opis w Issue #{number}". Coordinator dostaje pełny body
   (GPT-OSS-120 ma 64K ctx).

4. **Context overflow detection:** agent-aider monitoruje output
   Aidera. Jeśli pojawi się warning "Token limit exceeded" lub
   "Context window full":
   - Log warning + emit event `context.overflow`
   - Aider automatycznie kompresuje historię (wbudowane)
   - Jeśli mimo kompresji overflow: ESCALATE → Telegram HITL

5. **Duże repo (>500 plików):** Aider `--subtree-only` ogranicza
   repo map do podkatalogu wskazanego w `files[]`.

+-----------------------------------------------------------------------+
| # Konfiguracja context w agent-aider:                                 |
| const aiderArgs = [                                                   |
|   "--model", `openai/${model}`,                                       |
|   "--map-tokens", "8000",            // max 8K na repo map            |
|   "--openai-api-base", endpoint,                                      |
|   ...session.subtask?.files?.flatMap(f => ["--file", f]) ?? [],       |
| ];                                                                    |
|                                                                       |
| # Dla dużych repo dodaj:                                              |
| if (repoFileCount > 500) {                                            |
|   aiderArgs.push("--subtree-only");                                   |
| }                                                                     |
+-----------------------------------------------------------------------+

**4. Agent-Orchestrator (ao) --- dokumentacja bazowa**

Poniższa sekcja opisuje ao z perspektywy naszego projektu. Źródło:
github.com/ComposioHQ/agent-orchestrator (MIT, 533★, 70 forków,
publiczny od 20.02.2026).

**4.1 Podstawowe komendy CLI**

+-----------------------------------------------------------------------+
| \# Instalacja (Node.js 20+ wymagany)                                  |
|                                                                       |
| git clone https://github.com/ComposioHQ/agent-orchestrator.git        |
|                                                                       |
| cd agent-orchestrator && bash scripts/setup.sh                        |
|                                                                       |
| \# Konfiguracja projektu                                              |
|                                                                       |
| cd \~/twoj-projekt && ao init \--auto                                 |
|                                                                       |
| \# Start systemu                                                      |
|                                                                       |
| ao start \# uruchamia orchestrator + dashboard                        |
|                                                                       |
| ao spawn my-project 123 \# spawn agenta na GitLab Issue #123          |
|                                                                       |
| ao send \<session\> \"Fix the tests\" \# wyślij instrukcję do sesji   |
|                                                                       |
| ao status \# CLI overview wszystkich sesji                            |
|                                                                       |
| ao session ls \# lista aktywnych sesji                                |
|                                                                       |
| ao session kill \<session\> \# zatrzymaj sesję                        |
|                                                                       |
| ao session restore \<session\> \# wznów po crashu                     |
|                                                                       |
| ao dashboard \# otwórz Web UI                                         |
+-----------------------------------------------------------------------+

**4.2 Pełna konfiguracja agent-orchestrator.yaml**

+-----------------------------------------------------------------------+
| # agent-orchestrator.yaml --- konfiguracja dla naszego projektu       |
|                                                                       |
| port: 3000                                                            |
|                                                                       |
| defaults:                                                             |
|   runtime: tmux               # lub docker gdy gotowy                 |
|   agents:                     # pluginy agentowe (sekcja 6)           |
|     developer: aider          # agent-aider plugin                    |
|     tester: aider             # agent-aider plugin                    |
|     coordinator: coordinator  # coordinator-plugin                    |
|     reviewer: reviewer        # reviewer-plugin                       |
|   workspace: worktree         # git worktree per sesja               |
|   notifiers: [telegram]       # nasz plugin (sekcja 7)               |
|                                                                       |
| # ── Hosty inference (sekcja 5A.4) ──                                |
| # Każdy host to maszyna z GPU i llama-server.                        |
| # Limity slotów obowiązują PER HOST --- nie globalnie.               |
| hosts:                                                               |
|   local:                       # ── profil "full-stack" ──            |
|     address: localhost                                                |
|     totalVramGb: 128          # AMD Strix Halo (128 GB Unified RAM)  |
|     healthCheck: http://localhost:8080/health                        |
|     models:                   # 60 + 18×2 = 96 GB (zapas 32 GB)      |
|       gpt-oss-120:                                                   |
|         file: gpt-oss-120-q4_k_xl.gguf                              |
|         endpoint: http://localhost:8082/v1                            |
|         vramGb: 60                                                   |
|         maxSlots: 1                                                  |
|         contextWindow: 65536                                         |
|       qwen3-coder-30b-a3b:                                           |
|         file: qwen3-coder-30b-a3b-q4_k_m.gguf                       |
|         endpoint: http://localhost:8081/v1                            |
|         vramGb: 18                                                   |
|         maxSlots: 2                                                  |
|         contextWindow: 32768                                         |
|                                                                      |
|   gpu-server:                  # ── profil "dev-heavy" ──             |
|     address: 192.168.1.50                                            |
|     totalVramGb: 128          # drugi Strix Halo (128 GB)             |
|     healthCheck: http://192.168.1.50:8080/health                     |
|     auth:                                                            |
|       type: bearer                                                   |
|       token: ${GPU_SERVER_TOKEN}                                     |
|     models:                   # 47 + 18×2 = 83 GB                    |
|       qwen3-coder-next-80b:                                          |
|         endpoint: http://192.168.1.50:8080/v1                        |
|         vramGb: 47                                                   |
|         maxSlots: 1                                                  |
|         contextWindow: 32768                                         |
|       qwen3-coder-30b-a3b:                                           |
|         endpoint: http://192.168.1.50:8081/v1                        |
|         vramGb: 18                                                   |
|         maxSlots: 2                                                  |
|         contextWindow: 32768                                         |
|                                                                       |
| # ── Typy agentów i przypisanie modeli (sekcja 5A) ──                |
| # model = nazwa modelu; scheduler znajdzie host z wolnym slotem      |
| agentTypes:                                                           |
|   coordinator:                                                        |
|     model: gpt-oss-120          # local: 1 slot                       |
|     maxConcurrentPerHost: 1                                           |
|   developer:                                                          |
|     model: qwen3-coder-30b-a3b  # local: 2, gpu-server: 2 = 4 total  |
|     maxConcurrentPerHost: 1     # = max 2 jednocześnie (1 per host)   |
|   reviewer:                                                           |
|     model: qwen3-coder-next-80b # gpu-server: 1 slot                  |
|     maxConcurrentPerHost: 1                                           |
|   tester:                                                             |
|     model: qwen3-coder-30b-a3b  # local: 2, gpu-server: 2 = 4 total  |
|     maxConcurrentPerHost: 1                                           |
|                                                                       |
| # ── Concurrency (sekcja 5A.3) ──                                    |
| concurrency:                                                          |
|   mode: parallel              # parallel | serial | auto             |
|   queueSize: 20               # max tasków w kolejce                  |
|   queueStrategy: priority     # priority | fifo                      |
|   # Max agentów wynika z sumy slotów per host. Opcjonalny cap:       |
|   # maxParallelAgentsOverride: 4  # ręczny limit globalny            |
|                                                                       |
| # ── Projekty ──                                                      |
| projects:                                                             |
|   projekt-alfa:                                                       |
|     repo: twoj-user/projekt-alfa                                      |
|     path: ~/projekty/projekt-alfa                                     |
|     defaultBranch: main                                               |
|     sessionPrefix: alfa                                               |
|     workflow: auto             # simple | full | auto                 |
|     testCmd: "pytest -x --tb=short"  # AGENTS.md w repo może nadpisać|
|     tddMode: strict           # strict | warn | off                  |
|   projekt-beta:                                                       |
|     repo: twoj-user/projekt-beta                                      |
|     path: ~/projekty/projekt-beta                                     |
|     defaultBranch: main                                               |
|     sessionPrefix: beta                                               |
|     workflow: full                                                    |
|     testCmd: "npm test"        # JS projekt                           |
|     tddMode: warn             # łagodniejszy dla legacy projektów    |
|                                                                       |
| # ── Reactions ──                                                     |
| reactions:                                                            |
|   ci-failed:                                                          |
|     auto: true                                                        |
|     action: send-to-agent                                             |
|     targetAgentType: developer  # CI fix idzie do developera          |
|     retries: 3                                                        |
|     prompt: "CI failed. Read failure logs at {ci_url} and fix."       |
|   changes-requested:                                                  |
|     auto: true                                                        |
|     action: send-to-agent                                             |
|     targetAgentType: developer  # review comments → developer         |
|     escalateAfter: 30m                                                |
|     prompt: "Reviewer requested changes: {comments}"                  |
|   tdd-red-failed:              # TDD Guard: testy nie failują po Red  |
|     auto: true                                                        |
|     action: send-to-agent                                             |
|     targetAgentType: tester                                           |
|     retries: 2                                                        |
|     prompt: "Testy przechodzą. Napisz FAILING testy."                |
|   tdd-green-failed:            # TDD Guard: testy nie pass po Green   |
|     auto: true                                                        |
|     action: send-to-agent                                             |
|     targetAgentType: developer                                        |
|     retries: 3                                                        |
|     prompt: "Testy nadal failują. Dokończ implementację."            |
|   approved-and-green:                                                 |
|     auto: false                # true = auto-merge, false = HITL      |
|     action: notify                                                    |
|                                                                       |
| # ── Timeouty (sekcja 11A.3) ──                                     |
| timeouts:                                                             |
|   agent:                                                              |
|     maxSessionDuration: 3600    # 60 min (sekundy)                    |
|     idleTimeout: 600            # 10 min bez stdout → kill            |
|     warningAt: 2700             # 45 min → log warning                |
|   inference:                                                          |
|     requestTimeout: 300         # 5 min per LLM request              |
|     healthCheckInterval: 30     # sekundy                             |
|   tddGuard:                                                          |
|     testTimeout: 120            # 2 min per test run                  |
|   hitl:                                                               |
|     approvalTimeout: 600        # 10 min na odpowiedź Telegram       |
|   scheduler:                                                          |
|     connectTimeout: 5           # sekundy                             |
|     maxRetries: 10                                                    |
|     retryBackoff: 30            # sekundy (domyślny retry_after)      |
+-----------------------------------------------------------------------+

**4.3 Cykl życia sesji ao**

**Tryb full (workflow: full):**

+-----------------------------------------------------------------------+
| ao spawn projekt-alfa 123                                             |
| │                                                                     |
| ▼ Workspace plugin: git worktree create → feature/issue-123           |
| ▼ Runtime plugin: tmux new-session (lub Docker)                       |
| │                                                                     |
| ▼ CoordinatorPlugin (direct LLM, GPT-OSS-120)                        |
| │  → SubtaskPlan JSON (lista subtasków + dependsOn + strategy)        |
| │                                                                     |
| ▼ TaskPipelineManager.executePlan(plan)                               |
| │  ├── warstwa 0: Tester (agent-aider, Qwen3-30B)                    |
| │  │     → pisze testy na podstawie opisu subtaska                    |
| │  ├── warstwa 1: Developer (agent-aider, Qwen3-30B)                 |
| │  │     → TDD: czyta testy, implementuje, pytest, commit            |
| │  └── warstwa 2: SCM plugin → MR "Closes #123"                      |
| │       → ReviewerPlugin (Qwen3-80B) → glab mr review                 |
| │                                                                     |
| ▼ Reactions Engine monitoruje GitLab Webhooks:                        |
| │  ├── CI failed → Developer re-spawn (logi + "fix it", max 3)       |
| │  ├── REQUEST_CHANGES → Developer re-spawn (komentarze)              |
| │  └── APPROVE + green CI → Telegram notification                     |
| │                                                                     |
| ▼ HITL: Telegram inline keyboard → Merge / Reject / Redirect          |
+-----------------------------------------------------------------------+

**Tryb simple (workflow: simple) --- 2-pass TDD:**

W simple nie ma osobnego testera, ale developer wykonuje 2 przebiegi
Aidera w jednej sesji, wymuszając cykl Red → Green.

+-----------------------------------------------------------------------+
| ao spawn projekt-alfa 123 (workflow: simple, tddMode: strict)         |
| │                                                                     |
| ▼ Workspace + Runtime (jak wyżej)                                     |
| │                                                                     |
| ▼ PASS 1 --- Red: Developer pisze testy                               |
| │  Aider z promptem: "Napisz FAILING testy dla Issue #123.            |
| │  NIE pisz implementacji."                                           |
| │  → Developer (agent-aider, Qwen3-30B) commituje testy              |
| │                                                                     |
| ▼ 🔴 TDD Guard: assertRed()                                         |
| │  testCmd exit != 0 → OK (testy failują)                            |
| │  testCmd exit == 0 → strict: re-spawn PASS 1                        |
| │                                                                     |
| ▼ PASS 2 --- Green: Developer implementuje                            |
| │  Aider z promptem: "Zaimplementuj MINIMALNY kod żeby                |
| │  testy przeszły. Red → Green → Refactor."                           |
| │  → Developer (agent-aider, Qwen3-30B) + --auto-test                |
| │  → implementuje → pytest → commit → MR "Closes #123"               |
| │                                                                     |
| ▼ 🟢 TDD Guard: assertGreen()                                       |
| │  testCmd exit == 0 → OK (testy przechodzą)                         |
| │                                                                     |
| ▼ Reactions + HITL                                                     |
+-----------------------------------------------------------------------+

**Tryb auto (workflow: auto, domyślny):**
ao ocenia Issue → "full" gdy labels zawierają `epic|complex`
lub body > 500 znaków. W pozostałych przypadkach → "simple".

**5. Przepływ pracy --- TDD i wieloprojektowość**

**5.1 Pełny cykl: GitLab Issue → merge**

**Workflow: full** (coordinator → tester → developer → reviewer):

  ------- ------------------------------------------------------------------
   **1**  **ao spawn projekt-alfa 123** → Worktree + sesja start

   **2**  **CoordinatorPlugin** (direct LLM call) → plan subtasków (JSON)

   **3**  **TaskPipelineManager** wykonuje plan warstwami:
          warstwa 0: tester pisze testy
          warstwa 1: developer implementuje (czeka na testera)
          warstwa 2: reviewer robi code review MR

   **4**  Developer: ao SCM plugin → GitLab MR "Closes #123"

   **5**  CI failure? → reactions: ci-failed → developer dostaje logi,
          pushuje fix. Max 3 retries.

   **6**  Reviewer: REQUEST_CHANGES → developer poprawia.
          APPROVE → Telegram HITL.

   **7**  Telegram: \[Merge ✅\] \[Reject ❌\] \[Redirect 🔄\].
          Człowiek decyduje.
  ------- ------------------------------------------------------------------

**Workflow: simple** (developer 2-pass TDD):

  ------- ------------------------------------------------------------------
   **1**  **ao spawn projekt-alfa 123** → Worktree + developer start

   **2**  **PASS 1 (Red):** Developer pisze FAILING testy dla Issue.
          Nie pisze implementacji. Commit: "test: #123 ..."

   **3**  **TDD Guard assertRed()** --- testy muszą failować

   **4**  **PASS 2 (Green):** Developer implementuje minimalny kod.
          --auto-test uruchamia testy po każdej edycji.
          Green → Refactor → commit → MR "Closes #123"

   **5**  **TDD Guard assertGreen()** --- testy muszą przechodzić

   **6**  CI/review reactions + Telegram HITL
  ------- ------------------------------------------------------------------

**5.2 Równoległość i izolacja**

-   Każda sesja = osobny git worktree + osobna gałąź
    (feature/issue-{id})

-   VRAM Scheduler alokuje slot modelu przed startem sesji, zwalnia po
    zakończeniu

-   Brak shared state między sesjami --- każdy Aider subprocess działa
    na swoim katalogu

-   Race conditions na MR: GitLab SCM plugin zarządza kolejnością merge
    przez draft MR → ready

**5.3 Multi-project --- natywne ao**

ao natywnie obsługuje wiele projektów przez sekcję projects: w YAML.
Każdy projekt ma własny repo, path i sessionPrefix. Dashboard pokazuje
sesje ze wszystkich projektów na jednym widoku.

+-----------------------------------------------------------------------+
| \# Praca z wieloma projektami                                         |
|                                                                       |
| ao spawn projekt-alfa 42 \# Issue #42 z repo projekt-alfa             |
|                                                                       |
| ao spawn projekt-beta 17 \# Issue #17 z repo projekt-beta             |
| (równolegle)                                                          |
|                                                                       |
| ao status \# widok obu projektów naraz                                |
+-----------------------------------------------------------------------+

**5A. Typy agentów, przypisanie modeli i concurrency**

System definiuje 4 typy agentów. Każdy typ ma przypisany model LLM
(konfigurowalny w YAML), dedykowany system prompt i wyspecjalizowaną
rolę w cyklu życia taska.

**5A.1 Typy agentów**

  -------------- ------------- ------------- ---------------------------------
    **Typ**        **Model**     **Plugin**             **Rola**

  **coordinator** GPT-OSS-120   coordinator   Dekompozycja Issue → SubtaskPlan
                                -plugin       JSON. Direct LLM call. Nie pisze
                                              kodu --- planuje i zarządza.

  **developer**   Qwen3-Coder   agent-aider   Implementacja kodu: TDD, edycja
                  30B-A3B                     plików, git commit, pytest.
                                              Główny „koń roboczy" systemu.

  **reviewer**    Qwen3-Coder   reviewer      Code review MR-a: fetch diff z
                  -Next 80B     -plugin       GitLab → LLM analiza → glab mr
                                              review comments. Nie edytuje.

  **tester**      Qwen3-Coder   agent-aider   Pisze brakujące testy, uruchamia
                  30B-A3B                     test suite, analizuje failures.
                                              Lżejszy model → szybszy.
  -------------- ------------- ------------- ---------------------------------

Każdy typ agenta ma **dedykowany plugin** (sekcja 6):
- `coordinator` → CoordinatorPlugin (direct LLM call, JSON plan)
- `developer`, `tester` → AiderAgentPlugin (Aider subprocess, edycja kodu)
- `reviewer` → ReviewerPlugin (diff analysis, glab CLI review)

Mapowanie typ → plugin jest w `defaults.agents` w YAML.

**5A.2 Mapowanie agent type → model LLM**

Przypisanie modelu do typu agenta jest **konfiguracyjne**, nie
hardcoded. Definiuje się je w sekcji `agentTypes` pliku
`agent-orchestrator.yaml`. Typ agenta wskazuje **nazwę modelu**, a nie
konkretny endpoint --- VRAM Scheduler sam wybiera host z wolnym slotem.

+-----------------------------------------------------------------------+
| agentTypes:                                                           |
|   coordinator:                                                        |
|     model: gpt-oss-120          # local only (1 slot)                 |
|     maxConcurrentPerHost: 1     # egzekwowane przez Scheduler         |
|   developer:                                                          |
|     model: qwen3-coder-30b-a3b  # local (2) + gpu-server (2) = 4     |
|     maxConcurrentPerHost: 1     # = max 2 jednocześnie (1 per host)   |
|   reviewer:                                                           |
|     model: qwen3-coder-next-80b # gpu-server only (1 slot)            |
|     maxConcurrentPerHost: 1                                           |
|   tester:                                                             |
|     model: qwen3-coder-30b-a3b  # local (2) + gpu-server (2) = 4     |
|     maxConcurrentPerHost: 1                                           |
+-----------------------------------------------------------------------+

**Jak działa routing do hosta (ze sprawdzeniem concurrency):**

1.  Agent typu `developer` potrzebuje modelu `qwen3-coder-30b-a3b`.
2.  Scheduler sprawdza: na których hostach ten model jest dostępny?
    → `local` (maxSlots: 2), `gpu-server` (maxSlots: 2).
3.  Scheduler sprawdza: wolny slot **i** `maxConcurrentPerHost` dla
    agentType=developer nie przekroczony?
    → `local`: 1 developer aktywny (limit: 1) --- **blokada**.
    → `gpu-server`: 0 developerów --- **OK**.
4.  Scheduler zwraca `gpu-server` endpoint.

Zmiana modelu dla typu agenta = edycja jednej linii YAML.
Dodanie nowego hosta z tym samym modelem = automatyczne zwiększenie
efektywnej pojemności (limit jest per host).

**5A.3 Concurrency --- per host, nie globalnie**

Ilość jednocześnie pracujących agentów **wynika z sumy dostępnych
slotów na wszystkich hostach**, a nie ze sztywnego globalnego limitu.

+-----------------------------------------------------------------------+
| concurrency:                                                          |
|   mode: parallel              # parallel | serial | auto             |
|   queueSize: 20               # max tasków w kolejce                  |
|   queueStrategy: priority     # priority | fifo                      |
|   # maxParallelAgentsOverride: 4  # opcjonalny ręczny cap globalny   |
+-----------------------------------------------------------------------+

**Kluczowa zasada: limit jest per host.**

Jeśli `developer.maxConcurrentPerHost: 1`, to:

-   z 1 hostem (local) → max 1 developer jednocześnie
-   z 2 hostami (local + gpu-server) → max 2 developery jednocześnie
-   z 3 hostami → max 3 developery jednocześnie

Dodanie nowego hosta z kompatybilnym modelem **automatycznie zwiększa**
pulę dostępnych agentów bez zmiany konfiguracji `agentTypes`.

**Tryby wykonywania:**

-   `mode: serial` --- taski jeden po drugim, niezależnie od hostów.
    Prosty, przewidywalny. Kolejny task startuje po zakończeniu
    poprzedniego.

-   `mode: parallel` --- system uruchamia taski na wszystkich dostępnych
    hostach jednocześnie. Każdy task dostaje osobny worktree, branch i
    slot na konkretnym hoście. Gdy brak wolnych slotów na żadnym hoście
    → task trafia do kolejki.

-   `mode: auto` --- coordinator analizuje zależności między taskami i
    sam decyduje, które mogą iść równolegle, a które muszą czekać
    (np. task zależny od wyniku innego taska → serial).

**Limit per typ agenta per host:** Pole `maxConcurrentPerHost` w
`agentTypes` ogranicza ile instancji danego typu może działać
jednocześnie **na jednym hoście**. Np. `coordinator.maxConcurrentPerHost: 1`
gwarantuje max 1 koordynator per host. Jeśli `gpt-oss-120` jest
dostępny tylko na `local` → max 1 koordynator globalnie. Jeśli byłby
na 2 hostach → max 2.

**Opcjonalny globalny cap:** Jeśli mimo wielu hostów chcesz ograniczyć
łączną liczbę agentów (np. żeby nie zalewać GitLab API), ustaw
`maxParallelAgentsOverride`. Bez tego pola system sam oblicza limit
jako sumę slotów.

**Interakcja z VRAM Scheduler:** Scheduler zarządza slotami per host.
Gdy agent prosi o slot, scheduler:
1. Szuka hostów z danym modelem i wolnymi slotami
2. Sprawdza health check hosta (czy jest osiągalny)
3. Wybiera host z najlepszą dostępnością
4. Jeśli brak wolnych hostów → `retry_after: 30`, task czeka w kolejce

**5A.3a TDD Mode --- konfiguracja per projekt**

System wymusza TDD na poziomie pipeline (sekcja 6A.1 --- TDD Guard).
Tryb TDD jest konfigurowalny per projekt:

+-----------------------------------------------------------------------+
| projects:                                                             |
|   projekt-alfa:                                                       |
|     tddMode: strict     # strict | warn | off                        |
|     testCmd: "pytest -x --tb=short"                                   |
+-----------------------------------------------------------------------+

  ---------- ----------------------------------------------------------------
  **Tryb**                          **Zachowanie**

  **strict**  TDD Guard BLOKUJE pipeline gdy:
              · Red phase: testy przechodzą (re-spawn tester, max 2 retries)
              · Green phase: testy failują (re-spawn developer, max 3 retries)
              Reviewer automatycznie `REQUEST_CHANGES` gdy `tddCompliance`
              ≠ "pass". Domyślny dla nowych projektów.

  **warn**    TDD Guard LOGUJE ostrzeżenie, ale kontynuuje pipeline.
              Reviewer dostaje warn w metadata --- może eskalować lub
              zignorować. Przydatny dla legacy projektów z niekompletnym
              test suite.

  **off**     TDD Guard wyłączony. Tester nadal może pisać testy, ale
              pipeline nie waliduje Red/Green. Reviewer nie sprawdza
              tddCompliance. Używaj tymczasowo (np. hotfix, prototyp).
  ---------- ----------------------------------------------------------------

**Interakcja z workflow:**

  ------------ ------------ -----------------------------------------------
  **Workflow**  **tddMode**                  **Efekt**

    full        strict      Tester → Red Guard → Developer → Green Guard →
                            Reviewer (z tddResults)

    full        warn        Tester → Developer → Reviewer (guard loguje,
                            nie blokuje)

    full        off         Tester → Developer → Reviewer (bez guard)

    simple      strict      PASS 1 (testy) → Red Guard → PASS 2 (impl) →
                            Green Guard

    simple      warn        PASS 1 → PASS 2 (guard loguje)

    simple      off         Jeden przebieg (legacy: developer robi wszystko)
  ------------ ------------ -----------------------------------------------

**5A.4 Rejestr hostów i modeli**

Modele definiuje się **per host** w sekcji `hosts` pliku YAML.
Ten sam model (np. `qwen3-coder-next-80b`) może występować na wielu
hostach --- każdy host ma własne sloty, endpoint i VRAM.

Każdy host deklaruje `totalVramGb` --- scheduler przy starcie
waliduje, że suma `vramGb` modeli ≤ total (sekcja 3.3). Zestawy
modeli powinny pasować do jednego z profili (sekcja 3.2).

+-----------------------------------------------------------------------+
| hosts:                                                                |
|                                                                       |
|   local:                        # ── host lokalny ──                  |
|     address: localhost                                                |
|     totalVramGb: 128           # AMD Strix Halo (sekcja 3.3)          |
|     healthCheck: http://localhost:8080/health                         |
|     # Profil "full-stack": GPT-OSS-120 (60) + 30B×2 (36) = 96 GB     |
|     models:                                                           |
|       gpt-oss-120:              # coordinator                         |
|         file: gpt-oss-120-q4_k_xl.gguf                               |
|         endpoint: http://localhost:8082/v1                             |
|         vramGb: 60                                                    |
|         maxSlots: 1                                                   |
|         contextWindow: 65536                                          |
|       qwen3-coder-30b-a3b:      # developer + tester                  |
|         file: qwen3-coder-30b-a3b-q4_k_m.gguf                        |
|         endpoint: http://localhost:8081/v1                             |
|         vramGb: 18                                                    |
|         maxSlots: 2             # 18×2 = 36 GB                        |
|         contextWindow: 32768                                          |
|                                                                       |
|   gpu-server:                   # ── remote host ──                   |
|     address: 192.168.1.50                                             |
|     totalVramGb: 128           # np. drugi Strix Halo (128 GB)        |
|     healthCheck: http://192.168.1.50:8080/health                      |
|     auth:                                                             |
|       type: bearer                                                    |
|       token: ${GPU_SERVER_TOKEN}                                      |
|     # Profil "dev-heavy": 80B (47) + 30B×2 (36) = 83 GB              |
|     models:                                                           |
|       qwen3-coder-next-80b:     # ciężki developer/reviewer           |
|         endpoint: http://192.168.1.50:8080/v1                         |
|         vramGb: 47                                                    |
|         maxSlots: 1                                                   |
|         contextWindow: 32768                                          |
|       qwen3-coder-30b-a3b:      # tester + lżejszy developer          |
|         endpoint: http://192.168.1.50:8081/v1                         |
|         vramGb: 18                                                    |
|         maxSlots: 2                                                   |
|         contextWindow: 32768                                          |
+-----------------------------------------------------------------------+

**Przykład --- jak hosty wpływają na efektywny limit:**

  -------------- --------------------------------- -------------------------
    **Model**        **Hosty z tym modelem**         **Suma slotów**

  gpt-oss-120     local (1 slot)                    **1** (tylko local)

  qwen3-coder     gpu-server (1 slot)               **1** (tylko gpu-server)
  -next-80b

  qwen3-coder     local (2 sloty) + gpu-server      **4** (2+2)
  -30b-a3b        (2 sloty)
  -------------- --------------------------------- -------------------------

Dodanie nowego hosta z modelem `qwen3-coder-next-80b` automatycznie
zwiększa pulę slotów dla developer i reviewer --- bez zmiany
`agentTypes`. VRAM Scheduler (sekcja 8) korzysta z tej struktury do
host-aware slot management.

**5A.5 Przepływ taska z wieloma typami agentów**

Przykładowy cykl życia taska (workflow: full) z Pipeline Manager:

+-----------------------------------------------------------------------+
| GitLab Issue #42: "Dodaj endpoint /api/users/:id/avatar"              |
|                                                                       |
| ▼ [1] CoordinatorPlugin.start() → direct LLM (GPT-OSS-120)          |
| │  System prompt z prompts/coordinator.md                             |
| │  → SubtaskPlan JSON:                                                |
| │  {                                                                  |
| │    "strategy": "tdd",                                               |
| │    "subtasks": [                                                    |
| │      { "agentType": "tester",                                       |
| │        "description": "Napisz testy endpoint /api/users/:id/avatar" |
| │        "files": ["tests/test_avatar.py"] },                         |
| │      { "agentType": "developer",                                    |
| │        "description": "Implementuj endpoint avatar",                |
| │        "dependsOn": ["subtask-0"],                                  |
| │        "files": ["src/routes/avatar.py"] },                         |
| │      { "agentType": "reviewer",                                     |
| │        "description": "Code review MR",                             |
| │        "dependsOn": ["subtask-1"] }                                 |
| │    ]                                                                |
| │  }                                                                  |
| │  Slot GPT-OSS-120 natychmiast zwolniony.                            |
| │                                                                     |
| ▼ [2] TaskPipelineManager.executePlan(plan)                           |
| │  Topologiczne sortowanie → 3 warstwy:                              |
| │                                                                     |
| │  ── warstwa 0 ──                                                    |
| │  Tester (agent-aider, Qwen3-30B)                                   |
| │    Pisze testy tests/test_avatar.py                                 |
| │    Commit: "test: #42 add avatar endpoint tests"                    |
| │    Output: TESTS_DONE                                               |
| │                                                                     |
| │  ── warstwa 1 (czeka na warstwa 0) ──                               |
| │  Developer (agent-aider, Qwen3-30B)                                 |
| │    Czyta testy → TDD → implementuje src/routes/avatar.py            |
| │    pytest → zielone → commit → MR "Closes #42"                      |
| │    Output: TASK_DONE                                                |
| │                                                                     |
| │  ── warstwa 2 (czeka na warstwa 1) ──                               |
| │  ReviewerPlugin (Qwen3-80B)                                         |
| │    glab mr diff → LLM analiza → glab mr review                          |
| │    Output: APPROVE lub REQUEST_CHANGES                              |
| │                                                                     |
| ▼ [3] Reactions Engine:                                               |
| │  ├── APPROVE → Telegram HITL: [Merge ✅] [Reject ❌]               |
| │  └── REQUEST_CHANGES → re-spawn Developer (warstwa 1)               |
+-----------------------------------------------------------------------+

**Tryb uproszczony:** Dla małych tasków coordinator może pominąć
decomposition i przydzielić Issue bezpośrednio do developer (zachowanie
identyczne z wersją 1.0 --- bez coordinator/tester/reviewer).

+-----------------------------------------------------------------------+
| # Wymuszenie trybu uproszczonego per project lub per task             |
|                                                                       |
| projects:                                                             |
|   maly-projekt:                                                       |
|     workflow: simple    # simple | full | auto                        |
|     # simple = developer only (brak coordinator/reviewer/tester)      |
|     # full   = coordinator → tester → developer → reviewer            |
|     # auto   = coordinator decyduje                                   |
+-----------------------------------------------------------------------+

**5A.6 System prompty per typ agenta**

Każdy typ agenta otrzymuje dedykowany system prompt definiujący jego
rolę, ograniczenia i format output:

+-----------------------------------------------------------------------+
| prompts/                                                              |
|   coordinator.md                                                      |
|   developer.md                                                        |
|   reviewer.md                                                         |
|   tester.md                                                           |
+-----------------------------------------------------------------------+

Prompty są konfigurowalne per projekt --- AGENTS.md w repo nadpisuje
domyślne prompty, dodając kontekst specyficzny dla projektu (stack,
konwencje, scope).

**prompts/coordinator.md:**

+-----------------------------------------------------------------------+
| # Coordinator System Prompt                                           |
|                                                                       |
| Jesteś koordynatorem projektu. Twoim zadaniem jest dekompozycja       |
| GitLab Issue na plan subtasków.                                       |
|                                                                       |
| ## Zasady TDD                                                         |
| Każdy plan MUSI zawierać subtask `tester` PRZED subtaskiem            |
| `developer`. Tester pisze FAILING testy, developer je implementuje.   |
| To jest WYMAGANE --- nie pomijaj testera.                             |
|                                                                       |
| Jedyny wyjątek: strategy "hotfix" (1-liniowa zmiana z istniejącymi    |
| testami, potwierdzona przez pipeline).                                |
|                                                                       |
| ## Format output                                                      |
| Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown, bez komentarzy):   |
|                                                                       |
| {                                                                     |
|   "strategy": "tdd" | "hotfix" | "refactor",                          |
|   "subtasks": [                                                       |
|     {                                                                 |
|       "agentType": "tester" | "developer" | "reviewer",               |
|       "description": "Co agent ma zrobić",                            |
|       "dependsOn": ["subtask-0"],                                     |
|       "files": ["path/to/file.py"]                                    |
|     }                                                                 |
|   ]                                                                   |
| }                                                                     |
|                                                                       |
| ## Zasady planowania                                                  |
| - Subtaski numeruj od subtask-0                                       |
| - Tester NIE zależy od nikogo (warstwa 0)                             |
| - Developer zależy od testera (dependsOn: ["subtask-tester"])         |
| - Reviewer zależy od developera (dependsOn: ["subtask-developer"])    |
| - Jeśli Issue jest duży, rozłóż na wiele par tester→developer        |
|   (mogą iść równolegle jeśli dotyczą różnych plików)                  |
+-----------------------------------------------------------------------+

**prompts/tester.md:**

+-----------------------------------------------------------------------+
| # Tester System Prompt                                                |
|                                                                       |
| Jesteś testerem. Twoim JEDYNYM zadaniem jest pisanie testów.          |
|                                                                       |
| ## Zasady (KRYTYCZNE)                                                 |
| 1. Napisz testy które FAILUJĄ na obecnym kodzie.                      |
| 2. NIE pisz implementacji --- TYLKO testy.                            |
| 3. Testy muszą sprawdzać zachowanie opisane w Issue.                  |
| 4. Po napisaniu testów uruchom je i potwierdź że FAILUJĄ.             |
| 5. Jeśli testy PRZECHODZĄ --- to znaczy że nie testują nic nowego.   |
|    Przepisz je tak, żeby testowały brakującą funkcjonalność.          |
|                                                                       |
| ## Cykl pracy                                                         |
| 1. Przeczytaj opis subtaska / Issue                                   |
| 2. Przeanalizuj istniejący kod i testy                                |
| 3. Napisz nowe testy w odpowiednim pliku                              |
| 4. Uruchom testy → MUSZĄ FAILOWAĆ (Red phase)                        |
| 5. Commit: "test: #<issue> <opis>"                                    |
| 6. Output: TESTS_DONE                                                |
|                                                                       |
| ## Czego NIE robić                                                    |
| - NIE pisz kodu produkcyjnego                                        |
| - NIE naprawiaj failujących testów (to zadanie developera)             |
| - NIE pisz trywialnych testów (assert True)                           |
| - NIE pisz testów które już przechodzą (to nie jest Red phase)        |
+-----------------------------------------------------------------------+

**prompts/developer.md:**

+-----------------------------------------------------------------------+
| # Developer System Prompt                                             |
|                                                                       |
| Jesteś programistą pracującym w stylu TDD (Test-Driven Development).  |
| Cykl: Red → Green → Refactor.                                         |
|                                                                       |
| ## Cykl pracy (ŚCIŚLE PRZESTRZEGAJ)                                   |
|                                                                       |
| ### Krok 1: Red --- zweryfikuj failing testy                          |
| ZANIM napiszesz JAKIKOLWIEK kod, uruchom istniejące testy.            |
| Potwierdź że FAILUJĄ. Jeśli wszystkie testy przechodzą,               |
| NIE pisz kodu --- output "NO_FAILING_TESTS" i zakończ.               |
|                                                                       |
| ### Krok 2: Green --- minimalna implementacja                         |
| Napisz MINIMALNY kod potrzebny żeby testy przeszły.                   |
| Nie dodawaj funkcjonalności wykraczającej poza to, co testy           |
| sprawdzają. Po każdej zmianie uruchom testy.                          |
|                                                                       |
| ### Krok 3: Refactor --- uprzątnij                                    |
| Gdy testy są zielone, refaktoruj:                                     |
| - Usuń duplikację                                                     |
| - Popraw naming                                                       |
| - Wydziel funkcje/klasy                                               |
| Po KAŻDEJ zmianie refaktora uruchom testy ponownie.                   |
| Testy MUSZĄ nadal przechodzić.                                        |
|                                                                       |
| ### Krok 4: Commit i MR                                               |
| Commit: "feat: #<issue> <opis implementacji>"                         |
| Output: TASK_DONE                                                     |
|                                                                       |
| ## Czego NIE robić                                                    |
| - NIE pisz kodu bez failing testów (sprawdź Red phase)                |
| - NIE ignoruj failujących testów                                      |
| - NIE dodawaj kodu, którego testy nie sprawdzają                       |
| - NIE pisz testów (to zadanie testera, chyba że workflow: simple)     |
+-----------------------------------------------------------------------+

**prompts/reviewer.md:**

+-----------------------------------------------------------------------+
| # Reviewer System Prompt                                              |
|                                                                       |
| Jesteś code reviewerem. Analizujesz MR diff i piszesz review.        |
|                                                                       |
| ## Kryteria review                                                    |
|                                                                       |
| ### TDD Compliance (PRIORYTET)                                        |
| Sprawdź czy developer przestrzegał cyklu TDD:                         |
| - Czy testy zostały napisane PRZED implementacją? (patrz: commity)   |
| - Czy TDD Guard przeszedł Red i Green phase? (patrz: tddResults      |
|   w metadata sesji)                                                   |
| - Czy jest kod produkcyjny BEZ odpowiadających testów?               |
| - Jeśli TDD Guard raportował warn --- eskaluj jako REQUEST_CHANGES   |
|                                                                       |
| ### Jakość kodu                                                       |
| - Edge cases i error handling                                         |
| - Zgodność z konwencjami z AGENTS.md                                  |
| - Spójność z resztą codebase                                          |
| - Brak hardcoded values, magic numbers                                |
| - Poprawny naming                                                     |
|                                                                       |
| ## Format output                                                      |
| Odpowiedz JSON:                                                       |
| {                                                                     |
|   "decision": "APPROVE" | "REQUEST_CHANGES",                          |
|   "summary": "Krótkie podsumowanie",                                  |
|   "tddCompliance": "pass" | "warn" | "fail",                          |
|   "comments": [                                                       |
|     { "path": "file.py", "line": 42, "body": "Komentarz" }           |
|   ]                                                                   |
| }                                                                     |
|                                                                       |
| ## Zasady                                                             |
| - Jeśli tddCompliance = "fail" → zawsze REQUEST_CHANGES              |
| - Nie edytuj kodu --- tylko komentuj                                   |
| - Bądź konstruktywny: wskaż problem + zaproponuj rozwiązanie         |
+-----------------------------------------------------------------------+

**Konfiguracja testCmd (kaskada priorytetów):**

  ------------ ------------------- ----------------------------------------
  **Priorytet**   **Źródło**                     **Opis**

     1 (max)     `AGENTS.md`       Plik w repo projektu. Aider go czyta
                 w repo            automatycznie (--read). Może zawierać
                                   np. `Test command: npm test`.

     2           `projects.*.      W agent-orchestrator.yaml.
                 testCmd` YAML     Np. `testCmd: "pytest -x --tb=short"`.

     3 (min)     hardcoded         `pytest -x --tb=short` jako fallback
                 default           gdy nic nie skonfigurowane.
  ------------ ------------------- ----------------------------------------

**6. Pluginy agentowe (implementacja)**

System używa **3 osobnych pluginów** zamiast jednego uniwersalnego.
Każdy implementuje ten sam interfejs `AgentPlugin`, ale z innym
mechanizmem:

  -------------- ----------------------- -----------------------------------
    **Plugin**      **Typy agentów**               **Mechanizm**

  agent-aider     developer, tester      Aider subprocess + llama.cpp API

  coordinator     coordinator            Direct fetch do llama.cpp
  -plugin                                /v1/chat/completions → JSON plan

  reviewer        reviewer               Fetch diff z GitLab API → LLM
  -plugin                                analiza → glab CLI review comments
  -------------- ----------------------- -----------------------------------

**6.0 Wspólny interfejs --- bez zmian**

**6.1 Interfejs AgentPlugin (packages/core/src/types.ts)**

+-----------------------------------------------------------------------+
| // Typy agentów i konfiguracja modelu                                 |
|                                                                       |
| export type AgentType = "coordinator" | "developer"                   |
|                       | "reviewer"    | "tester";                     |
|                                                                       |
| export interface ModelConfig {                                        |
|   model: string;          // nazwa modelu (sekcja 5A.4)              |
|   host: string;           // nazwa hosta (np. "local", "gpu-server") |
|   endpoint: string;       // URL llama-server na tym hoście           |
|   contextWindow: number;                                              |
|   auth?: { type: string; token: string }; // opcjonalnie dla remote  |
| }                                                                     |
|                                                                       |
| // Interfejs który musimy zaimplementować                             |
|                                                                       |
| export interface AgentPlugin {                                        |
|   start(session: AgentSession): Promise\<AgentHandle\>;               |
|   send(handle: AgentHandle, message: string): Promise\<void\>;        |
|   getActivity(handle: AgentHandle): Promise\<ActivityStatus\>;        |
|   stop(handle: AgentHandle): Promise\<void\>;                         |
| }                                                                     |
|                                                                       |
| export interface AgentSession {                                       |
|   id: string;                                                         |
|   workspacePath: string;    // ścieżka do git worktree                |
|   issue: Issue;             // GitLab Issue z opisem                   |
|   agentType: AgentType;     // typ agenta → determinuje model+prompt  |
|   modelConfig: ModelConfig; // resolve z hosts + agentTypes w YAML    |
|                             // host + endpoint przydzielony przez      |
|                             // VRAM Scheduler (sekcja 8)              |
|   parentTaskId?: string;    // ID taska-rodzica (od coordinatora)     |
| }                                                                     |
+-----------------------------------------------------------------------+

**6.2 Plugin: agent-aider (developer + tester)**

Aider subprocess do edycji kodu. Obsługuje **wyłącznie** typy
`developer` i `tester`. Komunikuje się z llama.cpp przez
OpenAI-compatible API.

+-----------------------------------------------------------------------+
| // packages/agent-aider/src/index.ts (v3 --- host-aware)              |
|                                                                       |
| import { spawn } from "child_process";                                |
| import { readFileSync } from "fs";                                    |
| import { join } from "path";                                          |
| import type { AgentPlugin, AgentSession, AgentHandle,                 |
|   ActivityStatus, AgentType } from "@agent-orchestrator/core";        |
| import { acquireSlot, releaseSlot } from "../shared/vram-client";     |
| import { CompletionDetector } from "./completion-detector";           |
| import { structuredLog } from "../shared/logger";                     |
|                                                                       |
| interface SlotAllocation {                                            |
|   model: string; host: string; endpoint: string;                      |
|   auth?: { type: string; token: string };                             |
| }                                                                     |
|                                                                       |
| export class AiderAgentPlugin implements AgentPlugin {                |
|   private procs = new Map<string, any>();                             |
|   private buffers = new Map<string, string[]>();                      |
|   private allocations = new Map<string, SlotAllocation>();            |
|                                                                       |
|   async start(session: AgentSession): Promise<AgentHandle> {          |
|     const handle: AgentHandle = {                                     |
|       id: session.id,                                                 |
|       metadata: { agentType: session.agentType }                      |
|     };                                                                |
|                                                                       |
|     // Shared VRAM client z retry loop (sekcja 8.3)                   |
|     const slot = await acquireSlot(                                   |
|       session.modelConfig.model,                                      |
|       session.agentType,                                              |
|       session.id);                                                    |
|     this.allocations.set(handle.id, slot);                            |
|     const { endpoint, model, auth } = slot;
|                                                                       |
|     // System prompt z prompts/{agentType}.md (sekcja 5A.6)           |
|     const promptFile = this.resolvePromptFile(                        |
|       session.agentType, session.workspacePath);                      |
|                                                                       |
|     // testCmd: YAML project.testCmd → fallback "pytest -x --tb=short"|
|     const testCmd = session.projectConfig?.testCmd                    |
|       ?? "pytest -x --tb=short";                                      |
|                                                                       |
|     const proc = spawn("aider", [                                     |
|       "--model", `openai/${model}`,                                   |
|       "--openai-api-base", endpoint,                                  |
|       "--auto-commits", "--yes", "--no-pretty",                       |
|       "--read", promptFile,       // system prompt jako context file  |
|       "--test-cmd", testCmd,      // konfigurowalny per projekt       |
|       "--auto-test",             // uruchom testy po każdej edycji    |
|       "--message", this.buildPrompt(session),                         |
|     ], {                                                              |
|       cwd: session.workspacePath,                                     |
|       env: {                                                          |
|         ...process.env,                                               |
|         OPENAI_API_KEY: auth?.token ?? "local",                       |
|       }                                                               |
|     });                                                               |
|                                                                       |
|     this.procs.set(handle.id, proc);                                  |
|     this.buffers.set(handle.id, []);                                  |
|                                                                       |
|     // CompletionDetector (sekcja 6D) zastępuje prosty regex           |
|     const detector = new CompletionDetector(                          |
|       session.workspacePath, timeouts.agent.maxSessionDuration * 1000,|
|       session.agentType);                                             |
|                                                                       |
|     proc.stdout.on("data", d => {                                     |
|       const lines = d.toString().split("\n");                          |
|       this.buffers.get(handle.id)!.push(...lines);                    |
|       lines.forEach(l => detector.onStdoutLine(l));                   |
|     });                                                               |
|                                                                       |
|     proc.on("exit", async (code) => {                                 |
|       detector.onProcessExit(code ?? 1);                              |
|       await detector.checkGitDiff();                                  |
|       const result = detector.evaluate();                             |
|       handle.metadata.completed = result.status === "completed";      |
|       handle.metadata.completionResult = result;                      |
|       structuredLog("agent.completed", {                              |
|         sessionId: session.id, agentType: session.agentType,          |
|         ...result,                                                    |
|       });                                                             |
|     });                                                               |
|                                                                       |
|     return handle;                                                    |
|   }                                                                   |
|                                                                       |
|   async send(h: AgentHandle, msg: string) {                           |
|     this.procs.get(h.id)?.stdin.write(msg + "\n");                    |
|   }                                                                   |
|                                                                       |
|   async getActivity(h: AgentHandle): Promise<ActivityStatus> {        |
|     const recent = (this.buffers.get(h.id) ?? [])                     |
|       .slice(-5).join("\n");                                          |
|     return {                                                          |
|       status: h.metadata.completed ? "idle"                           |
|         : recent.match(/Thinking|Generating/) ? "working"             |
|         : "waiting",                                                  |
|       completed: h.metadata.completed ?? false,                       |
|       recentOutput: recent,                                           |
|     };                                                                |
|   }                                                                   |
|                                                                       |
|   async stop(h: AgentHandle) {                                        |
|     const p = this.procs.get(h.id);                                   |
|     if (p) { p.stdin.write("/quit\n"); await sleep(1000); p.kill(); } |
|     this.procs.delete(h.id); this.buffers.delete(h.id);              |
|     const alloc = this.allocations.get(h.id);                         |
|     if (alloc) {                                                      |
|       await releaseSlot(alloc.model, alloc.host, h.metadata.agentType);|
|       this.allocations.delete(h.id);                                  |
|     }                                                                 |
|   }                                                                   |
|                                                                       |
|   // resolvePromptFile, buildPrompt --- jak niżej                     |
|   // acquireVRAMSlot i releaseVRAMSlot USUNIĘTE ---                   |
|   // używamy shared vram-client (sekcja 8.3)                          |
|   }                                                                   |
|                                                                       |
|   private resolvePromptFile(agentType: AgentType, wsPath: string)     |
|     : string {                                                        |
|     const projectPrompt = join(wsPath, `prompts/${agentType}.md`);    |
|     try { accessSync(projectPrompt); return projectPrompt; }          |
|     catch { return join(__dirname, `../prompts/${agentType}.md`); }   |
|   }                                                                   |
|                                                                       |
|   private buildPrompt(session: AgentSession): string {                |
|     const { issue, agentType } = session;                             |
|     const base = `GitLab Issue #${issue.number}: ${issue.title}\n\n`  |
|       + `Description: ${issue.body}\n\n`;                             |
|     const instr = agentType === "tester"                              |
|       ? "Run tests, analyze failures, write missing tests. "          |
|         + "Output: TESTS_DONE"                                        |
|       : "Write tests first (TDD), then implement. "                   |
|         + "When done output: TASK_DONE";                              |
|     return base + instr;                                              |
|   }                                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export const plugin = { name: "aider", type: "agent" as const,       |
|   create: () => new AiderAgentPlugin() };                             |
+-----------------------------------------------------------------------+

**6.3 Plugin: coordinator-plugin (coordinator)**

Coordinator **nie jest Aiderem**. Robi direct fetch do llama-server
`/v1/chat/completions`, wysyła system prompt + Issue, parsuje
strukturalną odpowiedź JSON z planem subtasków.

+-----------------------------------------------------------------------+
| // packages/coordinator-plugin/src/index.ts                           |
|                                                                       |
| import { z } from "zod";                                              |
| import type { AgentPlugin, AgentSession, AgentHandle,                 |
|   ActivityStatus } from "@agent-orchestrator/core";                   |
| import { structuredLog } from "../shared/logger";                     |
|                                                                       |
| // ── Zod schema walidacji SubtaskPlan (Suggestion 7) ──             |
| const SubtaskSchema = z.object({                                      |
|   agentType: z.enum(["developer", "tester", "reviewer"]),             |
|   description: z.string().min(5, "Description too short"),            |
|   dependsOn: z.array(z.string()).optional(),                          |
|   files: z.array(z.string()).optional(),                              |
| });                                                                   |
|                                                                       |
| const SubtaskPlanSchema = z.object({                                  |
|   strategy: z.enum(["tdd", "hotfix", "refactor"]),                    |
|   subtasks: z.array(SubtaskSchema).min(1,                             |
|     "Plan must have at least 1 subtask"),                             |
| });                                                                   |
|                                                                       |
| type SubtaskPlan = z.infer<typeof SubtaskPlanSchema>;                 |
|                                                                       |
| export class CoordinatorPlugin implements AgentPlugin {               |
|                                                                       |
|   async start(session: AgentSession): Promise<AgentHandle> {          |
|     const handle: AgentHandle = {                                     |
|       id: session.id,                                                 |
|       metadata: { agentType: "coordinator" }                          |
|     };                                                                |
|                                                                       |
|     const slot = await this.acquireSlot(session.modelConfig.model);   |
|     const { endpoint, auth } = slot;                                  |
|                                                                       |
|     const systemPrompt = this.loadPrompt(session.workspacePath);      |
|     const userPrompt = this.buildPrompt(session.issue);               |
|                                                                       |
|     // Direct LLM call --- nie Aider subprocess                       |
|     const response = await fetch(`${endpoint}/chat/completions`, {    |
|       method: "POST",                                                 |
|       headers: {                                                      |
|         "Content-Type": "application/json",                           |
|         ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),   |
|       },                                                              |
|       body: JSON.stringify({                                          |
|         model: session.modelConfig.model,                             |
|         messages: [                                                    |
|           { role: "system", content: systemPrompt },                  |
|           { role: "user", content: userPrompt },                      |
|         ],                                                            |
|         temperature: 0.3,                                             |
|         response_format: { type: "json_object" },                     |
|       }),                                                             |
|     });                                                               |
|                                                                       |
|     const data = await response.json();                               |
|     const plan = this.parsePlan(                                      |
|       data.choices[0].message.content, session.id);                   |
|                                                                       |
|     handle.metadata.plan = plan;                                      |
|     handle.metadata.completed = true;                                 |
|                                                                       |
|     await this.releaseSlot(slot);                                     |
|     return handle;                                                    |
|   }                                                                   |
|                                                                       |
|   async send(h: AgentHandle, msg: string) { /* no-op */ }            |
|   async getActivity(h: AgentHandle): Promise<ActivityStatus> {        |
|     return {                                                          |
|       status: "idle",                                                 |
|       completed: h.metadata.completed ?? false,                       |
|       recentOutput: JSON.stringify(h.metadata.plan, null, 2),         |
|     };                                                                |
|   }                                                                   |
|   async stop(h: AgentHandle) { /* slot already released */ }          |
|                                                                       |
|   private parsePlan(raw: string, sessionId: string): SubtaskPlan {    |
|     try {                                                             |
|       const json = JSON.parse(raw);                                   |
|       const plan = SubtaskPlanSchema.parse(json);                     |
|                                                                       |
|       // Walidacja: circular dependencies                             |
|       this.validateDependencies(plan);                                |
|                                                                       |
|       structuredLog("coordinator.plan.valid", {                       |
|         sessionId, strategy: plan.strategy,                           |
|         subtaskCount: plan.subtasks.length,                           |
|       });                                                             |
|       return plan;                                                    |
|                                                                       |
|     } catch (err) {                                                   |
|       structuredLog("coordinator.plan.invalid", {                     |
|         sessionId, error: String(err),                                |
|         rawResponse: raw.slice(0, 500), // truncated for logs         |
|       });                                                             |
|       // Fallback: jeden subtask developer na cały Issue               |
|       return {                                                        |
|         strategy: "tdd",                                              |
|         subtasks: [{ agentType: "developer",                          |
|           description: "Implement the full issue" }],                 |
|       };                                                              |
|     }                                                                 |
|   }                                                                   |
|                                                                       |
|   private validateDependencies(plan: SubtaskPlan): void {             |
|     const ids = plan.subtasks.map((_, i) => `subtask-${i}`);          |
|     for (const [i, sub] of plan.subtasks.entries()) {                 |
|       for (const dep of sub.dependsOn ?? []) {                        |
|         if (!ids.includes(dep)) {                                     |
|           throw new Error(                                            |
|             `subtask-${i} depends on unknown "${dep}"`);              |
|         }                                                             |
|         if (dep === `subtask-${i}`) {                                 |
|           throw new Error(                                            |
|             `subtask-${i} has self-dependency`);                      |
|         }                                                             |
|       }                                                               |
|     }                                                                 |
|     // Detect cycles via topological sort attempt                     |
|     const visited = new Set<number>();                                |
|     const visiting = new Set<number>();                               |
|     const dfs = (idx: number) => {                                    |
|       if (visiting.has(idx))                                          |
|         throw new Error(`Circular dependency at subtask-${idx}`);     |
|       if (visited.has(idx)) return;                                   |
|       visiting.add(idx);                                              |
|       for (const dep of plan.subtasks[idx].dependsOn ?? []) {         |
|         dfs(ids.indexOf(dep));                                        |
|       }                                                               |
|       visiting.delete(idx);                                           |
|       visited.add(idx);                                               |
|     };                                                                |
|     plan.subtasks.forEach((_, i) => dfs(i));                          |
|   }                                                                   |
|                                                                       |
|   // ... acquireSlot / releaseSlot jak w AiderAgentPlugin              |
| }                                                                     |
|                                                                       |
| export const plugin = { name: "coordinator", type: "agent" as const,  |
|   create: () => new CoordinatorPlugin() };                            |
+-----------------------------------------------------------------------+

**Kluczowe różnice vs Aider:**
- Synchroniczny: jeden request → jeden response (nie long-running process)
- Nie edytuje plików, nie commituje, nie uruchamia testów
- Output: strukturalny JSON (SubtaskPlan), nie tekst
- Slot VRAM zwalniany natychmiast po odpowiedzi (nie trzymany przez sesję)
- **Zod walidacja:** Schema SubtaskPlanSchema gwarantuje poprawne typy,
  wymagane pola i waliduje graf zależności (circular deps, unknown refs)
- Fallback: jeśli walidacja zawiedzie → plan z jednym subtaskiem developer
- Structured log: błędy parsowania logowane z raw response (debugowanie)

**6.4 Plugin: reviewer-plugin (reviewer)**

Reviewer **nie jest Aiderem**. Pobiera diff MR z GitLab API, wysyła
go do LLM jako context, parsuje odpowiedź i postuje review comments
przez `glab` CLI.

+-----------------------------------------------------------------------+
| // packages/reviewer-plugin/src/index.ts                              |
|                                                                       |
| import { execFileSync } from "child_process";                         |
| import type { AgentPlugin, AgentSession, AgentHandle,                 |
|   ActivityStatus } from "@agent-orchestrator/core";                   |
| import { structuredLog } from "../shared/logger";                     |
|                                                                       |
| interface ReviewComment {                                             |
|   path: string;      // plik                                          |
|   line: number;      // linia w diff                                   |
|   body: string;      // treść komentarza                               |
| }                                                                     |
| interface ReviewResult {                                              |
|   decision: "APPROVE" | "REQUEST_CHANGES";                            |
|   summary: string;                                                    |
|   comments: ReviewComment[];                                          |
| }                                                                     |
|                                                                       |
| export class ReviewerPlugin implements AgentPlugin {                  |
|                                                                       |
|   async start(session: AgentSession): Promise<AgentHandle> {          |
|     const handle: AgentHandle = {                                     |
|       id: session.id,                                                 |
|       metadata: { agentType: "reviewer" }                             |
|     };                                                                |
|                                                                       |
|     const slot = await this.acquireSlot(session.modelConfig.model);   |
|                                                                       |
|     // 1. Pobierz diff MR z GitLab (execFileSync = no shell injection) |
|     const mrIid = String(session.issue.mrIid);                        |
|     const projectPath = session.issue.repo; // "group/project"        |
|     const diff = execFileSync("glab",                                 |
|       ["mr", "diff", mrIid, "--repo", projectPath],                   |
|       { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });           |
|                                                                       |
|     // 2. Wyślij diff + system prompt do LLM                          |
|     const { endpoint, auth } = slot;                                  |
|     const systemPrompt = this.loadPrompt(session.workspacePath);      |
|     const response = await fetch(`${endpoint}/chat/completions`, {    |
|       method: "POST",                                                 |
|       headers: {                                                      |
|         "Content-Type": "application/json",                           |
|         ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),   |
|       },                                                              |
|       body: JSON.stringify({                                          |
|         model: session.modelConfig.model,                             |
|         messages: [                                                    |
|           { role: "system", content: systemPrompt },                  |
|           { role: "user", content:                                     |
|             `Review this MR diff:\n\n${diff}` },                      |
|         ],                                                            |
|         temperature: 0.2,                                             |
|         response_format: { type: "json_object" },                     |
|       }),                                                             |
|     });                                                               |
|                                                                       |
|     const data = await response.json();                               |
|     const review: ReviewResult = JSON.parse(                          |
|       data.choices[0].message.content);                               |
|                                                                       |
|     // 3. Postuj review przez glab CLI (execFileSync --- no injection)  |
|     // GitLab: komentarze jako MR notes, approve/unapprove osobno     |
|     const projectPath = session.issue.repo; // "group/project"        |
|     for (const c of review.comments) {                                |
|       execFileSync("glab",                                            |
|         ["mr", "note", mrIid,                                         |
|          "--repo", projectPath,                                       |
|          "-m", `**${c.path}:${c.line}** — ${c.body}`]);              |
|     }                                                                 |
|     // Summary note z decyzją                                         |
|     execFileSync("glab",                                              |
|       ["mr", "note", mrIid,                                           |
|        "--repo", projectPath,                                         |
|        "-m", `**Review: ${review.decision}**\n${review.summary}`]);  |
|     // Approve jeśli APPROVE (GitLab nie ma "request changes" CLI)    |
|     if (review.decision === "APPROVE") {                              |
|       execFileSync("glab",                                            |
|         ["mr", "approve", mrIid, "--repo", projectPath]);             |
|     }                                                                 |
|     // REQUEST_CHANGES = note only (reviewer nie approves)            |
|     execFileSync("glab", reviewArgs);                                 |
|                                                                       |
|     handle.metadata.review = review;                                  |
|     handle.metadata.completed = true;                                 |
|     await this.releaseSlot(slot);                                     |
|     return handle;                                                    |
|   }                                                                   |
|                                                                       |
|   async send(h: AgentHandle, msg: string) { /* no-op */ }            |
|   async getActivity(h: AgentHandle): Promise<ActivityStatus> {        |
|     return {                                                          |
|       status: "idle",                                                 |
|       completed: h.metadata.completed ?? false,                       |
|       recentOutput: h.metadata.review?.summary ?? "",                 |
|     };                                                                |
|   }                                                                   |
|   async stop(h: AgentHandle) { /* slot already released */ }          |
|                                                                       |
|   // ... acquireSlot / releaseSlot jak w AiderAgentPlugin              |
| }                                                                     |
|                                                                       |
| export const plugin = { name: "reviewer", type: "agent" as const,    |
|   create: () => new ReviewerPlugin() };                               |
+-----------------------------------------------------------------------+

**Kluczowe różnice vs Aider:**
- Nie edytuje plików --- czyta diff i pisze komentarze na GitLab
- Synchroniczny: diff → LLM → review comments (nie long-running)
- Output: `APPROVE` lub `REQUEST_CHANGES` + inline comments
- Wymaga `glab` CLI zaautoryzowanego (`glab auth login`)
- **Security:** Używa `execFileSync` (tablica argumentów) zamiast
  `execSync` (string interpolation) --- eliminuje shell injection.
  LLM response body może zawierać cudzysłowy, backticki, `$(...)` ---
  `execFileSync` traktuje je jako literalne stringi, nie shell commands.

**6E. Integracja z GitLab --- tracker-gitlab + scm-gitlab + reactions**

ao natywnie obsługuje GitHub (tracker-github, scm-github). Dla GitLab
potrzebujemy **3 komponentów**: tracker plugin (Issues), SCM plugin
(Merge Requests) i adapter reactions engine na GitLab Webhooks.

**6E.1 tracker-gitlab plugin**

Plugin implementuje interfejs TrackerPlugin ao. Używa GitLab REST API
v4 (`/api/v4/projects/:id/issues`) lub `glab` CLI.

+-----------------------------------------------------------------------+
| Funkcja               | GitLab API / glab CLI                         |
| ───────────────────── | ───────────────────────────────────────────── |
| Pobierz Issue         | GET /projects/:id/issues/:iid                 |
|                       | glab issue view <iid>                         |
| Lista Issues          | GET /projects/:id/issues?state=opened          |
|                       | glab issue list --opened                      |
| Zamknij Issue         | PUT /projects/:id/issues/:iid (state: closed)  |
|                       | glab issue close <iid>                        |
| Labels                | GET/PUT labels na Issue                        |
| Auto-close na merge   | MR description: "Closes #<iid>" → auto-close  |
+-----------------------------------------------------------------------+

**Konfiguracja:**

+-----------------------------------------------------------------------+
| # W agent-orchestrator.yaml:                                          |
| defaults:                                                             |
|   tracker: gitlab              # zamiast domyślnego "github"          |
|                                                                       |
| gitlab:                                                               |
|   url: https://gitlab.example.com  # self-hosted lub gitlab.com      |
|   token: ${GITLAB_TOKEN}           # Personal Access Token (api)     |
|   # glab CLI musi być zalogowany: glab auth login                    |
+-----------------------------------------------------------------------+

**6E.2 scm-gitlab plugin**

Plugin implementuje interfejs SCMPlugin ao. Zarządza branchami i MR.

+-----------------------------------------------------------------------+
| Funkcja               | GitLab API / glab CLI                         |
| ───────────────────── | ───────────────────────────────────────────── |
| Utwórz branch         | POST /projects/:id/repository/branches         |
|                       | git checkout -b feature/issue-<iid>           |
| Utwórz MR             | glab mr create --title "Closes #<iid>"        |
|                       | --source feature/issue-<iid> --target main    |
| Merge MR              | glab mr merge <iid> --when-pipeline-succeeds  |
| Pobierz diff          | glab mr diff <iid>                             |
| Dodaj reviewer        | glab mr update <iid> --reviewer @user          |
+-----------------------------------------------------------------------+

**Różnice vs GitHub SCM:**
- GitLab używa IID (project-scoped) zamiast globalnych ID
- MR zamiast PR --- inny CLI (`glab mr` vs `gh pr`)
- GitLab CI/CD pipeline jest natywny (`.gitlab-ci.yml`), nie Actions
- Auto-merge: `--when-pipeline-succeeds` (GitLab) vs merge queue (GitHub)
- Approve flow: GitLab wymaga Approval Rules w settings projektu

**6E.3 Reactions adapter --- GitLab Webhooks**

ao core reactions engine nasłuchuje na eventy. Dla GitLab:

+-----------------------------------------------------------------------+
| Event ao (reactions)    | GitLab Webhook event          | Mapowanie    |
| ─────────────────────── | ───────────────────────────── | ──────────── |
| ci-failed               | Pipeline Hook                 | pipeline     |
|                         | (status: "failed")            | status !=    |
|                         |                               | "success"    |
| changes-requested       | Note Hook (MR comment         | noteable_type|
|                         | z "REQUEST_CHANGES")          | = MR, note   |
|                         |                               | body match   |
| approved-and-green      | Merge Request Hook            | MR action =  |
|                         | (action: "approved") +        | "approved" + |
|                         | Pipeline (status: "success")  | pipeline OK  |
| mr-merged               | Merge Request Hook            | MR action =  |
|                         | (action: "merge")             | "merge"      |
+-----------------------------------------------------------------------+

**Implementacja:** Webhook receiver (Express endpoint w ao) parsuje
GitLab webhook payload i emituje odpowiedni event do reactions engine.

+-----------------------------------------------------------------------+
| # W agent-orchestrator.yaml --- webhook endpoint:                     |
| gitlab:                                                               |
|   webhookSecret: ${GITLAB_WEBHOOK_SECRET}                             |
|   webhookPath: /api/gitlab/webhook  # ao nasłuchuje na tym URL       |
|   # GitLab Settings → Webhooks → URL: http://<ao-host>:3000/...     |
|   events: [pipeline, merge_request, note]  # subskrybowane eventy    |
+-----------------------------------------------------------------------+

**6E.4 Wpływ na harmonogram**

GitLab pluginy to ~1 tydzień dodatkowej pracy. Rozkład:
- tracker-gitlab: 2 dni (prosty CRUD wrapper na glab CLI)
- scm-gitlab: 2 dni (branch + MR + merge workflow)
- reactions adapter: 1-2 dni (webhook receiver + event mapping)

Pluginy są niezależne od siebie i mogą być rozwijane równolegle
z innymi komponentami. Wchodzą do **Fazy 1 (alpha)**, bo bez
trackera i SCM nie ma end-to-end workflow.

**6A. Task Pipeline Manager + TDD Guard**

Warstwa między coordinatorem a workerami. Odpowiada za wykonanie planu
subtasków z CoordinatorPlugin, **z wbudowanym egzekwowaniem cyklu TDD
Red → Green → Refactor**.

**6A.1 TDD Guard --- walidacja między warstwami**

TDD Guard to lekki krok walidacyjny uruchamiany między warstwami.
Nie jest agentem, nie potrzebuje LLM ani slotu VRAM --- uruchamia
`testCmd` i sprawdza exit code.

+-----------------------------------------------------------------------+
| // packages/core/src/tdd-guard.ts                                     |
|                                                                       |
| import { execSync } from "child_process";                             |
|                                                                       |
| type TddMode = "strict" | "warn" | "off";                            |
|                                                                       |
| interface TddGuardResult {                                            |
|   phase: "red" | "green";                                             |
|   passed: boolean;    // czy walidacja TDD przeszła                    |
|   testExit: number;   // exit code testCmd                             |
|   output: string;     // stdout/stderr (skrócony)                      |
|   failCount?: number; // ile testów failowało                          |
| }                                                                     |
|                                                                       |
| export class TddGuard {                                               |
|                                                                       |
|   constructor(                                                        |
|     private testCmd: string,                                          |
|     private mode: TddMode,                                            |
|     private workspacePath: string,                                     |
|   ) {}                                                                |
|                                                                       |
|   // Red phase: testy MUSZĄ failować (tester napisał nowe testy)      |
|   async assertRed(): Promise<TddGuardResult> {                        |
|     const { exitCode, output } = this.runTests();                     |
|     const passed = exitCode !== 0;  // fail = sukces Red phase        |
|     if (!passed) {                                                    |
|       const msg = "TDD Red Guard: testy przechodzą ale nie powinny. " |
|         + "Tester nie napisał failing testów.";                       |
|       if (this.mode === "strict") throw new TddGuardError(msg);      |
|       if (this.mode === "warn") console.warn(`[TDD-WARN] ${msg}`);   |
|     }                                                                 |
|     return { phase: "red", passed, testExit: exitCode, output };      |
|   }                                                                   |
|                                                                       |
|   // Green phase: testy MUSZĄ przechodzić (developer zaimplementował)  |
|   async assertGreen(): Promise<TddGuardResult> {                      |
|     const { exitCode, output } = this.runTests();                     |
|     const passed = exitCode === 0;  // pass = sukces Green phase      |
|     if (!passed) {                                                    |
|       const msg = "TDD Green Guard: testy nadal failują. "            |
|         + "Developer nie dokończył implementacji.";                    |
|       if (this.mode === "strict") throw new TddGuardError(msg);      |
|       if (this.mode === "warn") console.warn(`[TDD-WARN] ${msg}`);   |
|     }                                                                 |
|     return { phase: "green", passed, testExit: exitCode, output };    |
|   }                                                                   |
|                                                                       |
|   private runTests(): { exitCode: number; output: string } {          |
|     try {                                                             |
|       const out = execSync(this.testCmd, {                            |
|         cwd: this.workspacePath,                                      |
|         timeout: 120_000,  // 2 min max                               |
|         encoding: "utf-8",                                            |
|       });                                                             |
|       return { exitCode: 0, output: out.slice(-2000) };               |
|     } catch (e: any) {                                                |
|       return {                                                        |
|         exitCode: e.status ?? 1,                                      |
|         output: (e.stdout ?? "").slice(-2000),                        |
|       };                                                              |
|     }                                                                 |
|   }                                                                   |
| }                                                                     |
+-----------------------------------------------------------------------+

**6A.2 Pipeline Manager z TDD Guard**

+-----------------------------------------------------------------------+
| // packages/core/src/pipeline-manager.ts                              |
|                                                                       |
| import { TddGuard } from "./tdd-guard";                              |
| import type { SubtaskPlan, Subtask } from "./types";                  |
|                                                                       |
| export class TaskPipelineManager {                                    |
|   private guard: TddGuard;                                            |
|   private tddResults: TddGuardResult[] = [];                          |
|                                                                       |
|   constructor(                                                        |
|     testCmd: string,                                                  |
|     tddMode: TddMode,                                                |
|     workspacePath: string,                                             |
|   ) {                                                                 |
|     this.guard = new TddGuard(testCmd, tddMode, workspacePath);       |
|   }                                                                   |
|                                                                       |
|   async executePlan(                                                  |
|     plan: SubtaskPlan,                                                |
|     parentSession: AgentSession                                       |
|   ): Promise<void> {                                                  |
|                                                                       |
|     const sorted = this.topoSort(plan.subtasks);                      |
|     const layers = this.groupIntoLayers(sorted);                      |
|                                                                       |
|     for (const layer of layers) {                                     |
|       // Wykonaj subtaski warstwy                                      |
|       await Promise.all(layer.map(subtask =>                          |
|         this.spawnSubSession(subtask, parentSession)                  |
|       ));                                                              |
|                                                                       |
|       // TDD Guard między warstwami                                    |
|       const nextLayer = layers[layers.indexOf(layer) + 1];            |
|       if (nextLayer) {                                                |
|         const nextTypes = nextLayer.map(s => s.agentType);            |
|                                                                       |
|         // Po tester (przed developer) → assertRed                    |
|         if (layer.some(s => s.agentType === "tester")                 |
|             && nextTypes.includes("developer")) {                     |
|           const red = await this.guard.assertRed();                   |
|           this.tddResults.push(red);                                  |
|           if (!red.passed && this.guard.mode === "strict") {          |
|             await this.respawnWithFeedback(layer, parentSession,      |
|               "Testy przechodzą. Napisz FAILING testy.");             |
|             // Retry assertRed po re-spawnie testera                  |
|             const retry = await this.guard.assertRed();               |
|             this.tddResults.push(retry);                              |
|           }                                                           |
|         }                                                             |
|       }                                                               |
|                                                                       |
|       // Po developer (przed reviewer) → assertGreen                  |
|       if (layer.some(s => s.agentType === "developer")) {             |
|         const green = await this.guard.assertGreen();                 |
|         this.tddResults.push(green);                                  |
|         if (!green.passed && this.guard.mode === "strict") {          |
|           await this.respawnWithFeedback(layer, parentSession,        |
|             "Testy nadal failują. Dokończ implementację.");            |
|           const retry = await this.guard.assertGreen();               |
|           this.tddResults.push(retry);                                |
|         }                                                             |
|       }                                                               |
|     }                                                                 |
|                                                                       |
|     // Przekaż TDD wyniki do reviewer jako context                    |
|     parentSession.metadata.tddResults = this.tddResults;              |
|   }                                                                   |
|                                                                       |
|   // ... spawnSubSession, topoSort, groupIntoLayers jak wcześniej     |
|   // ... respawnWithFeedback: re-spawn agenta z dodatkowym message     |
| }                                                                     |
+-----------------------------------------------------------------------+

**6A.3 Przepływ z TDD Guard (workflow: full)**

+-----------------------------------------------------------------------+
| ao spawn projekt-alfa 123 (workflow: full, tddMode: strict)           |
| │                                                                     |
| ▼ [1] CoordinatorPlugin → SubtaskPlan (strategy: "tdd")              |
| │                                                                     |
| ▼ [2] TaskPipelineManager.executePlan(plan)                           |
| │                                                                     |
| │   ┌── Warstwa 0: [tester] ──────────────────────────────┐          |
| │   │  Tester pisze failing testy                          │          |
| │   └──────────────────────────────────────────────────────┘          |
| │   │                                                                 |
| │   ▼ 🔴 TDD Guard: assertRed()                                     |
| │   │  testCmd exit != 0? → OK, kontynuuj                            |
| │   │  testCmd exit == 0? → strict: re-spawn tester                   |
| │   │                       warn: log + kontynuuj                     |
| │   │                                                                 |
| │   ┌── Warstwa 1: [developer] ───────────────────────────┐          |
| │   │  Developer: Red → implement → Green                  │          |
| │   └──────────────────────────────────────────────────────┘          |
| │   │                                                                 |
| │   ▼ 🟢 TDD Guard: assertGreen()                                   |
| │   │  testCmd exit == 0? → OK, MR create                            |
| │   │  testCmd exit != 0? → strict: re-spawn developer                |
| │   │                       warn: log + kontynuuj                     |
| │   │                                                                 |
| │   ┌── Warstwa 2: [reviewer] ────────────────────────────┐          |
| │   │  Reviewer dostaje TDD results jako context           │          |
| │   │  (Red phase: 3 failures → Green phase: 0 failures)  │          |
| │   └──────────────────────────────────────────────────────┘          |
| │                                                                     |
| ▼ [3] Reactions Engine                                                |
+-----------------------------------------------------------------------+

**6B. TDD Metryki i feedback loop**

Pipeline Manager gromadzi `tddResults` podczas wykonania --- te dane
są wykorzystywane na kilku poziomach:

**1. Reviewer context:**
ReviewerPlugin dostaje `tddResults` w metadata sesji. Reviewer
sprawdza:
- Czy Red phase się powiodła (testy failowały)
- Czy Green phase się powiodła (testy przechodzą)
- Ile było retries (tester re-spawn lub developer re-spawn)
- Jeśli `tddCompliance = "fail"` → automatycznie `REQUEST_CHANGES`

**2. Reactions Engine --- TDD events:**

+-----------------------------------------------------------------------+
| reactions:                                                            |
|   # ... istniejące ci-failed, changes-requested ...                   |
|                                                                       |
|   tdd-red-failed:             # testy przechodzą po fazie Red         |
|     auto: true                                                        |
|     action: send-to-agent                                             |
|     targetAgentType: tester   # odesłij do testera                    |
|     retries: 2                                                        |
|     prompt: "Testy przechodzą ale nie powinny. Napisz failing testy." |
|                                                                       |
|   tdd-green-failed:           # testy failują po fazie Green          |
|     auto: true                                                        |
|     action: send-to-agent                                             |
|     targetAgentType: developer                                        |
|     retries: 3                                                        |
|     prompt: "Testy nadal failują. Dokończ implementację: {failures}"  |
+-----------------------------------------------------------------------+

**3. Telegram notifications (TDD digest):**
Po zakończeniu pipeline, Telegram notification zawiera TDD summary:

+-----------------------------------------------------------------------+
| 📊 TDD Report for Issue #42:                                         |
| ├── Red phase: ✅ (3 failing tests)                                  |
| ├── Green phase: ✅ (0 failures)                                     |
| ├── Retries: 0 (clean run)                                           |
| ├── Coverage delta: +12% (78% → 90%)                                 |
| └── Reviewer: APPROVE ✅ (tddCompliance: pass)                      |
+-----------------------------------------------------------------------+

**4. Langfuse tracking (sekcja 12):**
Każdy TDD Guard result jest logowany jako span w Langfuse trace:
- `tdd.red.exitCode`, `tdd.red.passed`, `tdd.red.failCount`
- `tdd.green.exitCode`, `tdd.green.passed`
- `tdd.retries.tester`, `tdd.retries.developer`
- Pozwala analizować: które typy Issue wymagają retries, które modele
  lepiej radzą sobie z TDD, jaka jest średnia coverage delta

**6C. Session Pipeline Persistence --- crash recovery**

Pipeline Manager wykonuje plan subtasków warstwami. Crash ao w trakcie
wykonania (np. między warstwą 0/tester a warstwą 1/developer) może
spowodować utratę stanu: testy są scommitowane, ale developer nie
ruszył. `ao session restore` musi wiedzieć na jakim etapie był pipeline.

**6C.1 Pipeline checkpoint --- persystencja stanu sesji**

+-----------------------------------------------------------------------+
| // packages/core/src/pipeline-checkpoint.ts                           |
|                                                                       |
| import { writeFileSync, readFileSync, existsSync } from "fs";        |
| import { join } from "path";                                          |
|                                                                       |
| interface PipelineCheckpoint {                                        |
|   sessionId: string;                                                  |
|   planHash: string;          // SHA256 planu (detect corruption)      |
|   completedLayers: number[]; // indeksy ukończonych warstw            |
|   currentLayer: number;      // aktualnie wykonywana warstwa          |
|   subtaskResults: Record<string, {                                    |
|     status: "pending" | "running" | "done" | "failed";               |
|     agentType: string;                                                |
|     startedAt?: string;      // ISO timestamp                         |
|     completedAt?: string;                                             |
|     output?: string;         // TASK_DONE / TESTS_DONE / error msg   |
|   }>;                                                                 |
|   tddResults: TddGuardResult[];                                      |
|   lastUpdated: string;       // ISO timestamp                         |
| }                                                                     |
|                                                                       |
| export class PipelineCheckpointManager {                              |
|   private path: string;                                               |
|                                                                       |
|   constructor(workspacePath: string, sessionId: string) {             |
|     // Checkpoint w worktree --- przetrwa restart ao                  |
|     this.path = join(workspacePath,                                   |
|       ".ao", `pipeline-${sessionId}.json`);                           |
|   }                                                                   |
|                                                                       |
|   save(checkpoint: PipelineCheckpoint): void {                        |
|     writeFileSync(this.path,                                          |
|       JSON.stringify(checkpoint, null, 2));                            |
|   }                                                                   |
|                                                                       |
|   load(): PipelineCheckpoint | null {                                 |
|     if (!existsSync(this.path)) return null;                          |
|     return JSON.parse(readFileSync(this.path, "utf-8"));              |
|   }                                                                   |
|                                                                       |
|   clear(): void {                                                     |
|     if (existsSync(this.path)) unlinkSync(this.path);                |
|   }                                                                   |
| }                                                                     |
+-----------------------------------------------------------------------+

**6C.2 Integracja z Pipeline Manager**

+-----------------------------------------------------------------------+
| // W TaskPipelineManager.executePlan():                                |
|                                                                       |
| async executePlan(plan: SubtaskPlan, session: AgentSession) {         |
|   const ckpt = new PipelineCheckpointManager(                         |
|     session.workspacePath, session.id);                                |
|                                                                       |
|   // Sprawdź czy jest checkpoint z poprzedniego uruchomienia          |
|   const existing = ckpt.load();                                       |
|   let startFromLayer = 0;                                             |
|   if (existing && existing.planHash === hashPlan(plan)) {             |
|     // Resume: pomiń ukończone warstwy                                |
|     startFromLayer = existing.currentLayer;                           |
|     this.tddResults = existing.tddResults;                            |
|     structuredLog("pipeline.resumed", {                               |
|       sessionId: session.id,                                          |
|       resumeFromLayer: startFromLayer,                                |
|     });                                                               |
|   }                                                                   |
|                                                                       |
|   const layers = this.groupIntoLayers(this.topoSort(plan.subtasks)); |
|   for (let i = startFromLayer; i < layers.length; i++) {             |
|     // Zapisz checkpoint PRZED wykonaniem warstwy                    |
|     ckpt.save({                                                       |
|       sessionId: session.id,                                          |
|       planHash: hashPlan(plan),                                       |
|       completedLayers: Array.from({length: i}, (_, k) => k),         |
|       currentLayer: i,                                                |
|       subtaskResults: this.subtaskResults,                            |
|       tddResults: this.tddResults,                                   |
|       lastUpdated: new Date().toISOString(),                          |
|     });                                                               |
|                                                                       |
|     await Promise.all(layers[i].map(sub =>                            |
|       this.spawnSubSession(sub, session)));                            |
|     // ... TDD Guard checks ...                                       |
|   }                                                                   |
|                                                                       |
|   // Sukces --- wyczyść checkpoint                                    |
|   ckpt.clear();                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**Dlaczego plik w worktree a nie DB:**
- Worktree przetrwa restart ao (jest na dysku, nie w pamięci)
- Jeden plik per sesja --- brak shared state, brak locków
- `ao session restore <id>` czyta checkpoint i wznawia od
  `currentLayer`
- Cleanup: checkpoint kasowany po sukcesie lub po `ao session kill`

**6D. Robust Completion Detection --- wykrywanie zakończenia agenta**

Parsowanie stdout Aidera w poszukiwaniu markerów `TASK_DONE` /
`TESTS_DONE` jest kruche: Aider może wygenerować te stringi
w komentarzu kodu, w wyjaśnieniu, lub nigdy ich nie wyemitować.

**6D.1 Multi-signal completion detection**

System używa **trzech sygnałów** do wykrycia zakończenia:

+-----------------------------------------------------------------------+
| Sygnał                | Waga  | Opis                                  |
| ───────────────────── | ───── | ──────────────────────────────────── |
| 1. Marker w stdout    | 40%   | TASK_DONE / TESTS_DONE w output      |
| 2. Git diff non-empty | 30%   | `git diff HEAD~1` ma zmiany w scope  |
| 3. Aider process exit | 30%   | Aider subprocess zakończył się        |
|                       |       | (exit code 0 = sukces)               |
+-----------------------------------------------------------------------+

**Completion = marker + (diff OR exit), z timeout safety net.**

+-----------------------------------------------------------------------+
| // packages/agent-aider/src/completion-detector.ts                    |
|                                                                       |
| interface CompletionSignals {                                         |
|   markerDetected: boolean;    // TASK_DONE w stdout                   |
|   gitDiffNonEmpty: boolean;   // nowe zmiany w worktree               |
|   processExited: boolean;     // Aider subprocess zakończony          |
|   processExitCode: number | null;                                     |
| }                                                                     |
|                                                                       |
| type CompletionResult =                                               |
|   | { status: "completed"; signals: CompletionSignals }               |
|   | { status: "timeout"; signals: CompletionSignals }                 |
|   | { status: "failed"; reason: string;                               |
|       signals: CompletionSignals };                                   |
|                                                                       |
| export class CompletionDetector {                                     |
|   private signals: CompletionSignals = {                              |
|     markerDetected: false,                                            |
|     gitDiffNonEmpty: false,                                           |
|     processExited: false,                                             |
|     processExitCode: null,                                            |
|   };                                                                  |
|                                                                       |
|   constructor(                                                        |
|     private workspacePath: string,                                    |
|     private timeoutMs: number = 60 * 60 * 1000, // 60 min            |
|     private agentType: AgentType,                                     |
|   ) {}                                                                |
|                                                                       |
|   onStdoutLine(line: string): void {                                  |
|     const marker = this.agentType === "tester"                        |
|       ? "TESTS_DONE" : "TASK_DONE";                                   |
|     // Marker musi być na osobnej linii (nie w kodzie/komentarzu)     |
|     if (line.trim() === marker                                        |
|         || line.trim().startsWith(`Output: ${marker}`)) {             |
|       this.signals.markerDetected = true;                             |
|     }                                                                 |
|   }                                                                   |
|                                                                       |
|   onProcessExit(code: number): void {                                 |
|     this.signals.processExited = true;                                |
|     this.signals.processExitCode = code;                              |
|   }                                                                   |
|                                                                       |
|   async checkGitDiff(): Promise<boolean> {                            |
|     try {                                                             |
|       const diff = execFileSync("git",                                |
|         ["diff", "--name-only", "HEAD~1"],                            |
|         { cwd: this.workspacePath, encoding: "utf-8" });              |
|       this.signals.gitDiffNonEmpty = diff.trim().length > 0;          |
|     } catch {                                                         |
|       this.signals.gitDiffNonEmpty = false;                           |
|     }                                                                 |
|     return this.signals.gitDiffNonEmpty;                              |
|   }                                                                   |
|                                                                       |
|   evaluate(): CompletionResult {                                      |
|     const s = this.signals;                                           |
|                                                                       |
|     // Sukces: marker + (diff lub exit)                               |
|     if (s.markerDetected && (s.gitDiffNonEmpty || s.processExited)) { |
|       return { status: "completed", signals: s };                     |
|     }                                                                 |
|                                                                       |
|     // Fallback: process exited z code 0 + diff (bez markera)         |
|     if (s.processExited && s.processExitCode === 0                    |
|         && s.gitDiffNonEmpty) {                                       |
|       return { status: "completed", signals: s };                     |
|     }                                                                 |
|                                                                       |
|     // Failure: process exited z error                                |
|     if (s.processExited && s.processExitCode !== 0) {                 |
|       return { status: "failed",                                      |
|         reason: `Exit code ${s.processExitCode}`, signals: s };       |
|     }                                                                 |
|                                                                       |
|     // Jeszcze nie zakończony                                         |
|     return { status: "timeout", signals: s };                         |
|   }                                                                   |
| }                                                                     |
+-----------------------------------------------------------------------+

**6D.2 Timeout escalation chain**

+-----------------------------------------------------------------------+
| Czas         | Akcja                                                  |
| ──────────── | ────────────────────────────────────────────────────── |
| 0-45 min     | Agent pracuje normalnie                                |
| 45 min       | Warning log + sprawdź git diff (jeśli pusty = problem) |
| 60 min       | Timeout: sprawdź wszystkie sygnały                     |
|              | → Jeśli marker + diff: COMPLETED (late finish)        |
|              | → Jeśli diff ale brak markera: COMPLETED (lenient)    |
|              | → Jeśli brak diff: FAILED → Telegram HITL escalation  |
| 60 min       | Kill Aider process, release VRAM slot                  |
+-----------------------------------------------------------------------+

**7. Plugin: notifier-telegram (implementacja)**

**7.1 Implementacja TelegramNotifierPlugin**

+-----------------------------------------------------------------------+
| // packages/notifier-telegram/src/index.ts                            |
|                                                                       |
| import TelegramBot from \"node-telegram-bot-api\";                    |
|                                                                       |
| import type { NotifierPlugin, OrchestratorEvent, ApprovalRequest,     |
|                                                                       |
| ApprovalResponse } from \"@agent-orchestrator/core\";                 |
|                                                                       |
| export class TelegramNotifierPlugin implements NotifierPlugin {       |
|                                                                       |
| private bot: TelegramBot;                                             |
|                                                                       |
| private pending = new Map\<string, { resolve: any; reject: any }\>(); |
|                                                                       |
| constructor(private config: { botToken: string; chatId: string }) {   |
|                                                                       |
| this.bot = new TelegramBot(config.botToken, { polling: true });       |
|                                                                       |
| this.bot.on(\"callback_query\", q =\> this.handleCallback(q));        |
|                                                                       |
| }                                                                     |
|                                                                       |
| async notify(event: OrchestratorEvent) {                              |
|                                                                       |
| const icons: Record\<string,string\> = {                              |
|                                                                       |
| \"session.started\": \"🚀\", \"session.done\": \"✅\",                |
|                                                                       |
| \"session.failed\": \"❌\", \"ci.failed\": \"🔴\",                    |
|                                                                       |
| \"mr.created\": \"📝\", \"mr.approved\": \"✅\", \"escalation\":      |
| \"⚠️\",                                                               |
|                                                                       |
| };                                                                    |
|                                                                       |
| const msg = \`\${icons\[event.type\]??\"\"} \*\${event.type}\*\\n\` + |
|                                                                       |
| \`Projekt: \`\${event.project}\`\\n\` +                               |
|                                                                       |
| (event.message ? \`\\n\${event.message}\` : \"\");                    |
|                                                                       |
| await this.bot.sendMessage(this.config.chatId, msg, { parse_mode:     |
| \"Markdown\" });                                                      |
|                                                                       |
| }                                                                     |
|                                                                       |
| async waitForApproval(req: ApprovalRequest):                          |
| Promise\<ApprovalResponse\> {                                         |
|                                                                       |
| const kb = { inline_keyboard: \[req.options.map(o =\> ({              |
|                                                                       |
| text: o.label, callback_data: \`\${req.id}:\${o.value}\` }))\] };     |
|                                                                       |
| await this.bot.sendMessage(this.config.chatId,                        |
|                                                                       |
| \`❓ \*\${req.message}\*\`, { parse_mode: \"Markdown\", reply_markup: |
| kb });                                                                |
|                                                                       |
| return new Promise((resolve, reject) =\> {                            |
|                                                                       |
| this.pending.set(req.id, { resolve, reject });                        |
|                                                                       |
| setTimeout(() =\> { this.pending.delete(req.id);                      |
|                                                                       |
| reject(new Error(\"timeout\")); }, 10 \* 60 \* 1000);                 |
|                                                                       |
| });                                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| private async handleCallback(q: any) {                                |
|                                                                       |
| const \[id, value\] = (q.data ?? \"\").split(\":\");                  |
|                                                                       |
| const p = this.pending.get(id);                                       |
|                                                                       |
| if (p) {                                                              |
|                                                                       |
| await this.bot.answerCallbackQuery(q.id, { text: \`✅ \${value}\` }); |
|                                                                       |
| this.pending.delete(id);                                              |
|                                                                       |
| p.resolve({ value, approvedBy: q.from.username ?? \"bot\" });         |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| export const plugin = { name: \"telegram\", type: \"notifier\" as     |
| const,                                                                |
|                                                                       |
| create: (cfg: any) =\> new TelegramNotifierPlugin(cfg) };             |
+-----------------------------------------------------------------------+

**8. VRAM Scheduler --- Python sidecar (host-aware)**

Mikroserwis (FastAPI, port 9090) zarządzający alokacją slotów GPU
**per host**. Scheduler czyta sekcję `hosts` z YAML, śledzi sloty
osobno dla każdego hosta i routuje requesty do hosta z wolną
pojemnością. Periodyczny health check wykrywa niedostępne hosty.

**8.1 Struktury danych**

+-----------------------------------------------------------------------+
| # Wewnętrzna reprezentacja w scheduler:                               |
| #                                                                     |
| # hosts_registry = {                                                  |
| #   "local": {                                                        |
| #     "address": "localhost",                                         |
| #     "health_url": "http://localhost:8080/health",                   |
| #     "healthy": True,                                                |
| #     "models": {                                                     |
| #       "qwen3-coder-next-80b": {                                     |
| #         "endpoint": "http://localhost:8080/v1",                      |
| #         "max_slots": 2,                                             |
| #         "used_slots": 1,  # <-- per host tracking                   |
| #       }, ...                                                        |
| #     }                                                               |
| #   },                                                                |
| #   "gpu-server": {                                                   |
| #     "address": "192.168.1.50",                                      |
| #     "healthy": True,                                                |
| #     "models": {                                                     |
| #       "qwen3-coder-next-80b": {                                     |
| #         "endpoint": "http://192.168.1.50:8080/v1",                   |
| #         "max_slots": 2,                                             |
| #         "used_slots": 0,  # <-- osobno od local                     |
| #       }, ...                                                        |
| #     }                                                               |
| #   }                                                                 |
| # }                                                                   |
+-----------------------------------------------------------------------+

**8.2 Implementacja**

+-----------------------------------------------------------------------+
| # vram_scheduler/scheduler.py (v3 --- host-aware)                    |
|                                                                       |
| from fastapi import FastAPI                                           |
| from asyncio import Lock                                              |
| import uvicorn, yaml, sys, httpx, asyncio                             |
|                                                                       |
| app = FastAPI()                                                       |
| lock = Lock()                                                         |
|                                                                       |
| def load_hosts(config_path: str) -> dict:                             |
|     with open(config_path) as f:                                      |
|         cfg = yaml.safe_load(f)                                       |
|     registry = {}                                                     |
|     for host_name, h in cfg.get("hosts", {}).items():                 |
|         registry[host_name] = {                                       |
|             "address": h["address"],                                  |
|             "health_url": h.get("healthCheck"),                       |
|             "auth": h.get("auth"),                                    |
|             "healthy": True,                                          |
|             "models": {}                                              |
|         }                                                             |
|         for model_name, m in h.get("models", {}).items():             |
|             registry[host_name]["models"][model_name] = {             |
|                 "endpoint": m["endpoint"],                            |
|                 "vram_gb": m.get("vramGb", 0),                        |
|                 "max_slots": m["maxSlots"],                           |
|                 "used_slots": 0,                                      |
|             }                                                         |
|     return registry                                                   |
|                                                                       |
| def load_agent_types(config_path: str) -> dict:                       |
|     with open(config_path) as f:                                      |
|         cfg = yaml.safe_load(f)                                       |
|     return cfg.get("agentTypes", {})                                  |
|                                                                       |
| def validate_vram(hosts: dict, config_path: str):                     |
|     with open(config_path) as f:                                      |
|         cfg = yaml.safe_load(f)                                       |
|     for name, h in cfg.get("hosts", {}).items():                      |
|         total = h.get("totalVramGb", 999)                             |
|         used = sum(m.get("vramGb",0) * m.get("maxSlots",1)           |
|                    for m in h.get("models",{}).values())              |
|         if used > total:                                              |
|             raise ValueError(                                         |
|                 f"Host {name}: VRAM {used}GB > {total}GB limit")      |
|                                                                       |
| CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1                       |
|   else "agent-orchestrator.yaml"                                      |
| validate_vram({}, CONFIG_PATH)    # fail-fast przy starcie            |
| HOSTS = load_hosts(CONFIG_PATH)                                       |
| AGENT_TYPES = load_agent_types(CONFIG_PATH)                           |
| # agent_counts[host][agentType] = ile aktywnych                       |
| agent_counts: dict[str, dict[str, int]] = {}                          |
|                                                                       |
| @app.post("/api/acquire")                                             |
| async def acquire(body: dict):                                        |
|     model = body.get("model")                                         |
|     agent_type = body.get("agentType")  # wymagany                    |
|     prefer_host = body.get("preferHost")                              |
|     async with lock:                                                  |
|         max_per_host = AGENT_TYPES.get(                               |
|             agent_type, {}).get("maxConcurrentPerHost", 999)           |
|         best_host, best_free = None, -1                               |
|         for hname, h in HOSTS.items():                                |
|             if not h["healthy"]:                                      |
|                 continue                                              |
|             m = h["models"].get(model)                                |
|             if not m:                                                 |
|                 continue                                              |
|             free = m["max_slots"] - m["used_slots"]                   |
|             type_count = agent_counts.get(                            |
|                 hname, {}).get(agent_type, 0)                         |
|             if free > 0 and type_count < max_per_host:                |
|                 if free > best_free:                                  |
|                     best_host, best_free = hname, free                |
|             if prefer_host == hname and free > 0:                     |
|                 best_host = hname                                     |
|                 break                                                 |
|         if best_host:                                                 |
|             slot = HOSTS[best_host]["models"][model]                  |
|             slot["used_slots"] += 1                                   |
|             agent_counts.setdefault(best_host, {})                    |
|             ac = agent_counts[best_host]                              |
|             ac[agent_type] = ac.get(agent_type, 0) + 1               |
|             return {                                                  |
|                 "model": model,                                       |
|                 "host": best_host,                                    |
|                 "endpoint": slot["endpoint"],                         |
|                 "auth": HOSTS[best_host].get("auth"),                 |
|             }                                                         |
|         return {"error": "no_slots", "retry_after": 30}              |
|                                                                       |
| @app.post("/api/release")                                             |
| async def release(body: dict):                                        |
|     model = body.get("model")                                         |
|     host = body.get("host")                                           |
|     agent_type = body.get("agentType")                                |
|     async with lock:                                                  |
|         if host in HOSTS and model in HOSTS[host]["models"]:          |
|             slot = HOSTS[host]["models"][model]                       |
|             slot["used_slots"] = max(0, slot["used_slots"] - 1)      |
|             if agent_type and host in agent_counts:                   |
|                 ac = agent_counts[host]                               |
|                 ac[agent_type] = max(0, ac.get(agent_type, 0) - 1)   |
|             return {"ok": True}                                       |
|         return {"error": "unknown_host_or_model"}                    |
|                                                                       |
| @app.get("/api/status")                                               |
| async def status():                                                   |
|     result = {}                                                       |
|     for hname, h in HOSTS.items():                                    |
|         result[hname] = {                                             |
|             "healthy": h["healthy"],                                  |
|             "address": h["address"],                                  |
|             "models": {                                               |
|                 mname: {                                              |
|                     "used": m["used_slots"],                          |
|                     "max": m["max_slots"],                            |
|                 } for mname, m in h["models"].items()                 |
|             }                                                         |
|         }                                                             |
|     return result                                                     |
|                                                                       |
| # ── Health check loop (co 30s) ──                                   |
| @app.on_event("startup")                                              |
| async def start_health_loop():                                        |
|     asyncio.create_task(health_loop())                                |
|                                                                       |
| async def health_loop():                                              |
|     async with httpx.AsyncClient(timeout=5) as client:                |
|         while True:                                                   |
|             for hname, h in HOSTS.items():                            |
|                 if not h["health_url"]:                               |
|                     continue                                          |
|                 try:                                                   |
|                     r = await client.get(h["health_url"])             |
|                     h["healthy"] = r.status_code == 200               |
|                 except Exception:                                     |
|                     h["healthy"] = False                              |
|             await asyncio.sleep(30)                                   |
|                                                                       |
| @app.post("/api/reload")                                              |
| async def reload():                                                   |
|     global HOSTS                                                      |
|     async with lock:                                                  |
|         HOSTS = load_hosts(CONFIG_PATH)                               |
|     return {"ok": True, "hosts": list(HOSTS.keys())}                 |
|                                                                       |
| if __name__ == "__main__":                                            |
|     uvicorn.run(app, host="0.0.0.0", port=9090)                      |
+-----------------------------------------------------------------------+

**8.3 Kontrakt API --- VRAM Scheduler ↔ Pluginy agentowe**

Formalny kontrakt między VRAM Scheduler (Python sidecar, port 9090)
a klientami (pluginy agentowe w TypeScript). Określa wymagane pola,
kody błędów i protokół retry.

+-----------------------------------------------------------------------+
| ── POST /api/acquire ──                                              |
|                                                                       |
| Request body (JSON):                                                  |
| {                                                                     |
|   "model": string,        // WYMAGANY. Nazwa modelu z hosts.*.models |
|   "agentType": string,    // WYMAGANY. "coordinator"|"developer"|... |
|   "preferHost": string?,  // Opcjonalny. Preferowany host            |
|   "sessionId": string?    // Opcjonalny. Do logowania/debugowania    |
| }                                                                     |
|                                                                       |
| Response 200 (sukces):                                                |
| {                                                                     |
|   "model": "qwen3-coder-30b-a3b",                                    |
|   "host": "local",                                                    |
|   "endpoint": "http://localhost:8081/v1",                              |
|   "auth": { "type": "bearer", "token": "..." } | null                |
| }                                                                     |
|                                                                       |
| Response 200 (brak slotów):                                           |
| {                                                                     |
|   "error": "no_slots",                                                |
|   "retry_after": 30,       // sekundy do następnej próby              |
|   "queue_position": 3      // pozycja w kolejce (informacyjna)        |
| }                                                                     |
|                                                                       |
| Response 200 (nieznany model):                                        |
| {                                                                     |
|   "error": "unknown_model",                                           |
|   "available_models": ["gpt-oss-120", "qwen3-coder-30b-a3b"]        |
| }                                                                     |
|                                                                       |
| ── POST /api/release ──                                              |
|                                                                       |
| Request body (JSON):                                                  |
| {                                                                     |
|   "model": string,        // WYMAGANY. Ten sam co w acquire          |
|   "host": string,         // WYMAGANY. Host z odpowiedzi acquire     |
|   "agentType": string?    // Opcjonalny. Do aktualizacji agent_counts|
| }                                                                     |
|                                                                       |
| Response 200: { "ok": true }                                          |
| Response 200: { "error": "unknown_host_or_model" }                    |
|                                                                       |
| ── GET /api/status ──                                                |
|                                                                       |
| Response 200: { "<host>": { "healthy": bool, "models": {             |
|   "<model>": { "used": int, "max": int } } } }                       |
|                                                                       |
| ── POST /api/reload ──                                               |
|                                                                       |
| Response 200: { "ok": true, "hosts": ["local", "gpu-server"] }       |
+-----------------------------------------------------------------------+

**Protokół retry po stronie klienta (TypeScript):**

+-----------------------------------------------------------------------+
| // packages/shared/src/vram-client.ts                                 |
|                                                                       |
| const SCHEDULER_URL = "http://localhost:9090";                        |
| const MAX_RETRIES = 10;                                               |
| const DEFAULT_RETRY_AFTER = 30; // sekundy                            |
|                                                                       |
| export async function acquireSlot(                                    |
|   model: string,                                                      |
|   agentType: string,                                                  |
|   sessionId?: string,                                                 |
| ): Promise<SlotAllocation> {                                          |
|                                                                       |
|   for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {           |
|     const resp = await fetch(`${SCHEDULER_URL}/api/acquire`, {        |
|       method: "POST",                                                 |
|       headers: { "Content-Type": "application/json" },                |
|       body: JSON.stringify({ model, agentType, sessionId }),          |
|     });                                                               |
|                                                                       |
|     const data = await resp.json();                                   |
|                                                                       |
|     if (!data.error) return data as SlotAllocation;                   |
|                                                                       |
|     if (data.error === "no_slots") {                                  |
|       const wait = (data.retry_after ?? DEFAULT_RETRY_AFTER) * 1000; |
|       structuredLog("vram.slot.waiting", {                            |
|         model, agentType, attempt,                                    |
|         retryAfter: data.retry_after,                                 |
|         queuePosition: data.queue_position,                           |
|       });                                                             |
|       await sleep(wait);                                              |
|       continue;                                                       |
|     }                                                                 |
|                                                                       |
|     // unknown_model lub inny błąd --- nie retry'uj                   |
|     throw new Error(`VRAM acquire failed: ${data.error}`);            |
|   }                                                                   |
|                                                                       |
|   throw new Error(`VRAM acquire exhausted ${MAX_RETRIES} retries`);  |
| }                                                                     |
+-----------------------------------------------------------------------+

**Kto implementuje retry loop:** Wspólna funkcja `acquireSlot()` w
`packages/shared/` --- używana przez agent-aider, coordinator-plugin
i reviewer-plugin. Plugin NIE implementuje własnego retry.
Scheduler NIE kolejkuje --- zwraca `retry_after` i klient sam czeka.

**9. Kompletny stack technologiczny**

  ------------------ --------------------- ---------------------------------
     **Warstwa**        **Technologia**                **Rola**

   **Orchestrator**  ao core (TypeScript)    Session management, reactions
                                                engine, dashboard, CLI

  **Agent Plugins**  agent-aider (dev/tester), 3 pluginy agentowe (sekcja 6).
                     coordinator-plugin,       Każdy typ = dedykowany plugin
                     reviewer-plugin           + model + system prompt.

  **LLM (konfig.)**  Rejestr modeli w YAML   Dowolna liczba modeli, przypisanie
                     (sekcja 5A.4)            do typu agenta przez konfigurację.
                                              Domyślnie: GPT-OSS-120,
                                              Qwen3-Coder-Next 80B,
                                              Qwen3-Coder 30B-A3B.

  **Concurrency**    maxConcurrentPerHost     Limity per typ agenta per host.
                     (w VRAM Scheduler),      Scheduler egzekwuje. mode:
                     mode: parallel|serial    parallel|serial|auto + kolejka.
                     |auto (sekcja 5A.3)

    **Inference**     llama.cpp + Vulkan      Backend dla AMD Strix Halo
                                           (128 GB Unified RAM), OpenAI API

    **Code agent**    Aider (subprocess)    Edycja plików, git commit, TDD
                                                    loop, repo map

   **Pipeline Mgr**  TaskPipelineManager     Orkiestracja subtasków z planu
                     + TDD Guard             coordinatora. TDD Guard waliduje
                     (ao core, sekcja 6A)    Red/Green między warstwami.
                                             tddMode: strict|warn|off.

   **Task tracker**    GitLab Issues (ao      Source of truth --- Issues,
                           natywny)          labels, milestones, CI status

  **VCS / Izolacja**   Git worktree (ao     Każda sesja = osobny worktree +
                           natywny)                   branch + MR

      **CI/CD**       GitLab CI/CD (ao   Auto-retry przy failure, auto-fix
                          reactions)                 przez agenta

       **HITL**       Telegram Bot (nowy    Powiadomienia, inline keyboard,
                            plugin)                 komendy statusu

    **Dashboard**    Next.js 15 + SSE (ao     Real-time widok sesji, live
                           natywny)               terminal (xterm.js)

    **VRAM mgmt**       Python FastAPI        Slot allocation, fallback,
                            sidecar            acquire/release lifecycle

     **Sandbox**      Docker (ao runtime      \--network=none, mem_limit,
                            plugin)            pids_limit --- opcjonalny

    **Monitoring**       Langfuse + ao     LLM traces, session outcomes, CI
                         self-improve              failure patterns
  ------------------ --------------------- ---------------------------------

**10. Harmonogram implementacji (zaktualizowany)**

Harmonogram dzieli się na 3 fazy. **Zmiany vs oryginał:** reviewer
przesunięty z beta do v1.0; GitLab pluginy (tracker + SCM + reactions
adapter) dodane do alpha (+1 tydzień).

  ------------- ---------- ----------------------------- ------------------------
   **Faza**      **Czas**           **Zakres**               **Deliverable**

  **1: alpha**    \~4 tyg.  Fork + ao setup + agent-aider   Działający pipeline:
                            plugin (developer only) +       ao spawn → developer →
                            VRAM Scheduler (1 host) +       MR → Telegram HITL.
                            notifier-telegram +             Workflow: simple.
                            **tracker-gitlab (sek. 6E.1)** + Smoke test: E2E-ALPHA.
                            **scm-gitlab (sek. 6E.2)** +
                            **reactions adapter (sek. 6E.3)** +
                            structured logging (sek. 12A) +
                            CompletionDetector (sek. 6D) +
                            VRAM API client (sek. 8.3)

  **2: beta**     +2 tyg.   coordinator-plugin (direct      Coordinator → tester →
                            LLM, Zod walidacja) +           developer. Pipeline
                            TaskPipelineManager +           z TDD Guard.
                            PipelineCheckpoint (sek. 6C) + Smoke test: E2E-BETA.
                            TDD Guard + multi-host
                            (remote endpoints).
                            **Reviewer: NIE w tej fazie.**

  **3: v1.0**     +1 tyg.   reviewer-plugin (sek. 6.4) +   Pełny flow z review.
                            Profile VRAM (walidacja) +      Stabilny system >70%
                            testCmd YAML + AGENTS.md        tasków bez HITL.
                            override + stabilizacja +       Smoke test: E2E-V1.0.
                            E2E testy
  ------------- ---------- ----------------------------- ------------------------

  **Post-v1.0:** Roadmap items R-001 → R-006 (queue lookahead, dynamic
  model swapping, federation, plugin API, nowe typy agentów, scheduler
  persistence).

**10.1 E2E Acceptance Tests --- definicja "done" per faza**

Każda faza ma **jeden konkretny smoke test** który musi przejść,
żeby faza była uznana za ukończoną. Test jest manualny, ale
deterministyczny --- identyczny scenariusz za każdym razem.

**E2E-ALPHA: "Add /health endpoint"**

+-----------------------------------------------------------------------+
| Preconditions:                                                        |
| - Repo: test-project (Python/FastAPI, ma pytest, ma AGENTS.md)       |
| - GitLab Issue #1: "Add GET /health endpoint returning {status: ok}" |
| - 1 host (local), profil "batch" (Qwen3-30B×2), workflow: simple      |
|   Uwaga: alpha nie używa coordinatora (GPT-OSS-120 nie wymagany)     |
| - Telegram bot skonfigurowany, VRAM Scheduler działa                  |
|                                                                       |
| Scenariusz:                                                           |
| 1. `ao spawn test-project 1`                                         |
| 2. System tworzy worktree + branch feature/issue-1                   |
| 3. Developer (Aider, Qwen3-30B):                                     |
|    a. PASS 1 (Red): pisze test_health.py z failing testem             |
|    b. TDD Guard assertRed() → exit != 0 → OK                         |
|    c. PASS 2 (Green): implementuje /health endpoint                   |
|    d. TDD Guard assertGreen() → exit == 0 → OK                       |
|    e. CompletionDetector: marker + diff → COMPLETED                   |
| 4. MR "Closes #1" utworzony na GitLab                                 |
| 5. Telegram: notification z [Merge ✅] [Reject ❌]                   |
| 6. User klika Merge → MR merged → Issue #1 zamknięty                 |
|                                                                       |
| Acceptance criteria:                                                  |
| ✅ MR zawiera test + implementację (2 commity min)                   |
| ✅ `pytest` przechodzi na branch feature/issue-1                     |
| ✅ Telegram notification przyszła < 30s po MR creation               |
| ✅ VRAM slot zwolniony po zakończeniu                                |
| ✅ Structured log zawiera: session.started, tdd.red.passed,          |
|    tdd.green.passed, session.completed                                |
| ✅ Czas end-to-end < 15 minut                                        |
+-----------------------------------------------------------------------+

**E2E-BETA: "Add user avatar upload"**

+-----------------------------------------------------------------------+
| Preconditions:                                                        |
| - Repo: test-project (jak wyżej + endpoint /api/users)               |
| - GitLab Issue #2: "Add POST /api/users/:id/avatar with file upload, |
|   max 5MB, store in /uploads, return URL"                             |
| - 2 hosty (local + gpu-server), workflow: full, tddMode: strict       |
|                                                                       |
| Scenariusz:                                                           |
| 1. `ao spawn test-project 2`                                         |
| 2. CoordinatorPlugin (GPT-OSS-120) → SubtaskPlan JSON:               |
|    subtask-0: tester, subtask-1: developer (dependsOn: subtask-0)    |
| 3. Zod walidacja planu → OK                                          |
| 4. Warstwa 0: Tester pisze failing testy na gpu-server               |
| 5. TDD Guard assertRed() → testy failują → OK                       |
| 6. Warstwa 1: Developer implementuje na local                        |
| 7. TDD Guard assertGreen() → testy przechodzą → OK                  |
| 8. MR "Closes #2" utworzony                                           |
| 9. Telegram HITL → Merge                                             |
|                                                                       |
| Acceptance criteria:                                                  |
| ✅ Coordinator poprawnie zdekomponował Issue (Zod validated)          |
| ✅ Tester i developer uruchomieni na różnych hostach                  |
| ✅ PipelineCheckpoint zapisany w .ao/ w worktree                     |
| ✅ TDD Guard Red + Green przeszły bez retries                        |
| ✅ Oba VRAM sloty zwolnione po zakończeniu                           |
+-----------------------------------------------------------------------+

**E2E-V1.0: "Full flow with reviewer"**

+-----------------------------------------------------------------------+
| Jak E2E-BETA, ale dodatkowo:                                          |
| - Warstwa 2: ReviewerPlugin (Qwen3-80B) robi code review             |
| - Reviewer APPROVE → Telegram z pełnym TDD Report                    |
| - Alternatywnie: Reviewer REQUEST_CHANGES → developer re-spawn       |
|                                                                       |
| Acceptance criteria (dodatkowe vs BETA):                              |
| ✅ Review comments opublikowane na GitLab MR                          |
| ✅ tddCompliance: "pass" w review result                             |
| ✅ execFileSync (nie execSync) użyty w reviewer                      |
| ✅ Pełny TDD Report w Telegram notification                          |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Krytyczna uwaga --- świeżość projektu**                             |
|                                                                       |
| agent-orchestrator jest publiczny od 20.02.2026 --- zaledwie 2 dni    |
| przed powstaniem tego dokumentu. Pinuj konkretny commit SHA w         |
| package.json, śledź Issues i CHANGELOG na GitHub (upstream ao).        |
| każdego tygodnia: git fetch upstream && git log upstream/main         |
| \--oneline -20.                                                       |
+-----------------------------------------------------------------------+

**11. Ryzyka i mitygacje**

  --------------------- ------------ --------------------------------------
       **Ryzyko**        **Poziom**              **Mitygacja**

   **ao API zmieni się   🔴 Wysokie   Pinuj SHA, nie \"latest\". Sprawdzaj
   (świeży projekt)**                  PR i Issues przed każdym tygodniem
                                                     pracy.

     **OOM --- VRAM      🟡 Średnie    VRAM Scheduler limituje concurrent
    overflow przy 3+                  slots. Watchdog restartuje llama.cpp
        sesjach**                                   po OOM.

   **Aider nie wykrywa   🟡 Średnie    Custom marker TASK_DONE w prompt.
   ukończenia taska**                Fallback: timeout po 60 min → Telegram
                                                     HITL.

  **Git merge conflicts  🟡 Średnie     ao worktree zapewnia izolację na
    przy równoległych                poziomie plików. MR-based merge przez
        sesjach**                                   GitLab.

     **Telegram bot      🟢 Niskie      Idempotentny handler --- sprawdź
  polling --- duplikaty                  pending.has(id) przed resolve.
      callbacków**                   

  **Aider zmienia pliki  🟡 Średnie  Przekazuj \--file z listą konkretnych
  poza scope taskiem**                 plików. AGENTS.md precyzuje scope.

   **Qwen3-Coder-Next    🟢 Niskie   Fallback na 30B dla wszystkich tasków.
    80B niedostępny**                System działa wolniej ale funkcjonuje.

  **Context window        🟡 Średnie    --map-tokens 8000 + file scoping
   overflow (32K)                      z SubtaskPlan. Issue body truncation
   przy dużych repo**                  > 3000 znaków. Sekcja 3.5.

  **Shell injection       🟡 Średnie    execFileSync zamiast execSync.
   w reviewer-plugin                   Tablica argumentów (nie string
   (LLM output)**                      interpolation). Sekcja 6.4.

  **Pipeline crash         🟡 Średnie    PipelineCheckpoint w worktree
   między warstwami                    (.ao/pipeline-*.json). Resume
   (utrata stanu)**                    od currentLayer. Sekcja 6C.

  **GitLab pluginy ---      🟡 Średnie    glab CLI + GitLab REST API v4.
   nowe vs natywny GitHub               3 pluginy (tracker, SCM, reactions)
   w ao**                               = ~1 tydzień. Fallback: bezpośrednie
                                         API calls jeśli glab CLI zawiedzie.
  --------------------- ------------ --------------------------------------

**11A. Error Handling i Timeout Policy**

Centralna polityka obsługi błędów i timeoutów. Każdy komponent ma
zdefiniowane failure modes, timeouty i akcje recovery.

**11A.1 Tabela failure modes**

+-----------------------------------------------------------------------+
| Komponent          | Failure mode           | Timeout  | Akcja        |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| llama-server       | Nie odpowiada na       | 30s      | Health check |
|                    | health check           |          | oznacza host |
|                    |                        |          | unhealthy.   |
|                    |                        |          | Scheduler nie|
|                    |                        |          | routuje do   |
|                    |                        |          | tego hosta.  |
|                    |                        |          | Retry health |
|                    |                        |          | co 30s.      |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| llama-server       | OOM / crash            | N/A      | Watchdog     |
|                    | (process died)         |          | (systemd)    |
|                    |                        |          | restartuje.  |
|                    |                        |          | Scheduler    |
|                    |                        |          | wykrywa przy |
|                    |                        |          | health check.|
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| llama-server       | Inference timeout      | 300s     | Aider/plugin |
|                    | (request wisi)         | (5 min)  | timeout na   |
|                    |                        |          | fetch. Retry |
|                    |                        |          | 1×, potem    |
|                    |                        |          | fail subtask.|
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| VRAM Scheduler     | Sidecar nie odpowiada  | 5s       | Plugin retry |
|                    |                        |          | 3× z backoff |
|                    |                        |          | (1s, 3s, 9s).|
|                    |                        |          | Po 3 retries:|
|                    |                        |          | ESCALATE →   |
|                    |                        |          | Telegram HITL|
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| VRAM Scheduler     | Restart (utrata stanu) | N/A      | Reconciliation|
|                    |                        |          | at startup   |
|                    |                        |          | (query active|
|                    |                        |          | llama-server |
|                    |                        |          | /slots).     |
|                    |                        |          | MVP: reset   |
|                    |                        |          | all to 0.    |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| Aider subprocess   | Nie emituje output     | 10 min   | Jeśli brak   |
|                    | (hung)                 |          | stdout 10min:|
|                    |                        |          | kill process,|
|                    |                        |          | check git    |
|                    |                        |          | diff. Sekcja |
|                    |                        |          | 6D.          |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| Aider subprocess   | Context window full    | N/A      | Aider auto-  |
|                    |                        |          | compresses.  |
|                    |                        |          | Log warning. |
|                    |                        |          | Sekcja 3.5.  |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| Aider subprocess   | Timeout (max session)  | 60 min   | CompletionDet|
|                    |                        |          | ector evaluuj|
|                    |                        |          | signals. Kill|
|                    |                        |          | process,     |
|                    |                        |          | release slot.|
|                    |                        |          | Sekcja 6D.   |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| CoordinatorPlugin  | LLM zwraca invalid     | 120s     | Zod walidacja|
|                    | JSON / bad plan        |          | odrzuca.     |
|                    |                        |          | Fallback:    |
|                    |                        |          | 1-subtask    |
|                    |                        |          | developer    |
|                    |                        |          | plan.        |
|                    |                        |          | Sekcja 6.3.  |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| ReviewerPlugin     | LLM zwraca invalid     | 120s     | Log error.   |
|                    | JSON review            |          | Fallback:    |
|                    |                        |          | REQUEST_     |
|                    |                        |          | CHANGES z    |
|                    |                        |          | generic msg. |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| GitLab API / glab    | Rate limit / 5xx       | 10s      | Retry 3× z   |
|                    |                        |          | exponential  |
|                    |                        |          | backoff.     |
|                    |                        |          | Po 3: fail   |
|                    |                        |          | subtask.     |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| Telegram Bot       | Polling error          | 30s      | node-telegram|
|                    |                        |          | -bot-api auto|
|                    |                        |          | reconnect.   |
|                    |                        |          | Log warning. |
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| ao core            | Crash w trakcie        | N/A      | Pipeline     |
|                    | pipeline execution     |          | Checkpoint   |
|                    |                        |          | (sek. 6C).   |
|                    |                        |          | ao session   |
|                    |                        |          | restore      |
|                    |                        |          | wznawia od   |
|                    |                        |          | currentLayer.|
| ────────────────── | ────────────────────── | ──────── | ──────────── |
| TDD Guard          | testCmd timeout        | 120s     | Kill test    |
|                    |                        |          | process.     |
|                    |                        |          | Treat as     |
|                    |                        |          | exit code 1  |
|                    |                        |          | (tests fail).|
+-----------------------------------------------------------------------+

**11A.2 Escalation chain**

+-----------------------------------------------------------------------+
| Level 0: Auto-retry (wbudowany w komponent)                           |
| ↓ (po wyczerpaniu retries)                                           |
| Level 1: Reactions Engine (re-spawn agent z feedback message)         |
| ↓ (po wyczerpaniu reaction retries)                                  |
| Level 2: Telegram HITL (notification z kontekstem błędu)             |
| ↓ (po timeout HITL = 10 min)                                        |
| Level 3: Session marked FAILED, slot released, log structured event  |
+-----------------------------------------------------------------------+

**11A.3 Konfiguracja timeoutów w YAML**

+-----------------------------------------------------------------------+
| # W agent-orchestrator.yaml:                                          |
| timeouts:                                                             |
|   agent:                                                              |
|     maxSessionDuration: 3600    # 60 min (sekundy)                    |
|     idleTimeout: 600            # 10 min bez stdout → kill            |
|     warningAt: 2700             # 45 min → log warning                |
|   inference:                                                          |
|     requestTimeout: 300         # 5 min per LLM request              |
|     healthCheckInterval: 30     # sekundy                             |
|   tddGuard:                                                          |
|     testTimeout: 120            # 2 min per test run                  |
|   hitl:                                                               |
|     approvalTimeout: 600        # 10 min na odpowiedź Telegram       |
|   scheduler:                                                          |
|     connectTimeout: 5           # sekundy                             |
|     maxRetries: 10                                                    |
|     retryBackoff: 30            # sekundy (domyślny retry_after)      |
+-----------------------------------------------------------------------+

**12. Kluczowe decyzje architektoniczne**

**12.1 GitLab Issues zamiast GitHub Issues i Trello**

GitLab jako jednolita platforma: Issues, Merge Requests, CI/CD,
Webhooks --- wszystko self-hosted, pełna kontrola. ao natywnie
obsługuje GitHub, więc potrzebujemy pluginów tracker-gitlab i
scm-gitlab (sekcja 6E) + adapter reactions na GitLab Webhooks.
Koszt: ~1 tydzień na pluginy. Zysk: brak zależności od GitHub API
rate limits, self-hosted = privacy, jednolity workflow
Issue #42 → branch → MR "Closes #42" → auto-close po merge.

**12.2 Fork ao zamiast budowania od zera**

ao dostarcza out-of-the-box: git worktree izolacja, CI reactions loop,
Web Dashboard z live terminal, SCM plugin (MR creation, enrichment),
3288 testów bazowych. Budowanie tego od zera zajęłoby 8--12 tygodni.
Fork ao + 3 pluginy (Aider, Telegram, VRAM Scheduler) zajmuje 3--4
tygodnie.

**12.3 Aider zamiast Claude Code CLI**

Claude Code CLI wymaga Anthropic API (płatne, cloud). Aider jest
open-source i obsługuje dowolne OpenAI-compatible API --- w tym lokalne
llama.cpp. Aider ma \--test-cmd dla natywnej TDD integracji,
\--auto-commits dla git workflow, i repo map dla kontekstu całego
projektu.

**12.4 Hierarchia Orchestrator 80B + Workers 30B**

Empiryczne potwierdzenie z projektu Cursor FastRender (styczeń 2026):
hierarchiczna orkiestracja (Planner + Workers bez komunikacji między
workerami) skaluje liniowo. 20 równorzędnych agentów z lockowaniem
dawało przepustowość 2--3 agentów. Hierarchia eliminuje ten bottleneck.

**12A. MVP Monitoring --- structured logging (od alpha)**

Langfuse (sekcja 12 oryginału) to post-MVP. Dla alpha potrzebny jest
prosty **structured JSON log** który pozwala mierzyć KPI z sekcji 1.2
bez zewnętrznych zależności.

**12A.1 Shared logger**

+-----------------------------------------------------------------------+
| // packages/shared/src/logger.ts                                      |
|                                                                       |
| import { appendFileSync } from "fs";                                  |
| import { join } from "path";                                          |
|                                                                       |
| const LOG_PATH = process.env.AO_LOG_PATH                              |
|   ?? join(process.cwd(), "ao-events.jsonl");                          |
|                                                                       |
| interface LogEntry {                                                   |
|   timestamp: string;        // ISO 8601                                |
|   event: string;            // hierarchiczny: "session.started"        |
|   sessionId?: string;                                                  |
|   project?: string;                                                    |
|   agentType?: string;                                                  |
|   model?: string;                                                      |
|   host?: string;                                                       |
|   durationMs?: number;                                                 |
|   outcome?: "success" | "fail" | "timeout" | "escalated";             |
|   retries?: number;                                                    |
|   [key: string]: unknown;   // dodatkowe pola per event               |
| }                                                                     |
|                                                                       |
| export function structuredLog(                                        |
|   event: string,                                                      |
|   data: Omit<LogEntry, "timestamp" | "event"> = {},                   |
| ): void {                                                             |
|   const entry: LogEntry = {                                           |
|     timestamp: new Date().toISOString(),                              |
|     event,                                                            |
|     ...data,                                                          |
|   };                                                                  |
|   const line = JSON.stringify(entry) + "\n";                          |
|   appendFileSync(LOG_PATH, line);                                     |
|   // Opcjonalnie: console.log dla development                        |
|   if (process.env.AO_LOG_CONSOLE === "true") {                       |
|     console.log(`[${event}]`, JSON.stringify(data));                  |
|   }                                                                   |
| }                                                                     |
+-----------------------------------------------------------------------+

**12A.2 Event catalog --- co logujemy**

+-----------------------------------------------------------------------+
| Event                      | Kiedy                    | Pola           |
| ────────────────────────── | ──────────────────────── | ────────────── |
| session.started            | ao spawn                 | sessionId,     |
|                            |                          | project, issue |
| session.completed          | Pipeline done            | durationMs,    |
|                            |                          | outcome        |
| session.failed             | Pipeline failed          | reason, retries|
| session.timeout            | 60min timeout            | signals        |
| ────────────────────────── | ──────────────────────── | ────────────── |
| vram.slot.acquired         | Scheduler acquire OK     | model, host    |
| vram.slot.waiting          | no_slots, retry          | model, attempt |
| vram.slot.released         | Agent done               | model, host,   |
|                            |                          | durationMs     |
| ────────────────────────── | ──────────────────────── | ────────────── |
| agent.started              | Plugin.start()           | agentType,     |
|                            |                          | model, host    |
| agent.completed            | CompletionDetector done  | agentType,     |
|                            |                          | durationMs,    |
|                            |                          | signals        |
| agent.failed               | Agent error              | agentType,     |
|                            |                          | reason         |
| ────────────────────────── | ──────────────────────── | ────────────── |
| agent.context.overflow     | Context window full      | agentType,     |
|                            | (sekcja 3.5)             | model,         |
|                            |                          | sessionId      |
| ────────────────────────── | ──────────────────────── | ────────────── |
| tdd.red.result             | assertRed()              | passed,        |
|                            |                          | testExit       |
| tdd.green.result           | assertGreen()            | passed,        |
|                            |                          | testExit       |
| ────────────────────────── | ──────────────────────── | ────────────── |
| coordinator.plan.valid     | Zod validation OK        | strategy,      |
|                            |                          | subtaskCount   |
| coordinator.plan.invalid   | Zod validation failed    | error,         |
|                            |                          | rawResponse    |
| ────────────────────────── | ──────────────────────── | ────────────── |
| pipeline.resumed           | Checkpoint restore       | resumeFrom     |
|                            |                          | Layer          |
| pipeline.checkpoint.saved  | Checkpoint write         | currentLayer   |
| ────────────────────────── | ──────────────────────── | ────────────── |
| hitl.requested             | Telegram approval sent   | type           |
| hitl.responded             | User clicked button      | value,         |
|                            |                          | responseTimeMs |
| hitl.timeout               | 10min no response        |                |
+-----------------------------------------------------------------------+

**12A.3 Analiza KPI --- jq one-liners**

+-----------------------------------------------------------------------+
| # KPI 1: Issue → MR merged bez HITL (cel: >70%)                      |
| cat ao-events.jsonl | jq -s '                                         |
|   [.[] | select(.event == "session.completed")]                       |
|   | { total: length,                                                   |
|     auto: [.[] | select(.outcome == "success")] | length }            |
|   | "\(.auto)/\(.total) = \(.auto/.total*100 | floor)%"'              |
|                                                                       |
| # KPI 2: Średni czas session (cel: odpowiedni do complexity)          |
| cat ao-events.jsonl | jq -s '                                         |
|   [.[] | select(.event == "session.completed") | .durationMs]         |
|   | (add / length / 60000) | "\(. | floor) min avg"'                  |
|                                                                       |
| # KPI 3: VRAM slot utilization                                        |
| cat ao-events.jsonl | jq -s '                                         |
|   [.[] | select(.event == "vram.slot.waiting")] | length              |
|   | "Slot waits: \(.)"'                                               |
|                                                                       |
| # Failures breakdown                                                  |
| cat ao-events.jsonl | jq -s '                                         |
|   [.[] | select(.event == "session.failed")] |                        |
|   group_by(.reason) | map({reason: .[0].reason, count: length})'      |
+-----------------------------------------------------------------------+

**Dlaczego JSONL a nie DB:**
- Zero zależności (appendFileSync do pliku)
- jq + grep wystarczą do analizy w MVP
- Łatwy import do Langfuse/Grafana gdy post-MVP monitoring będzie gotowy
- Plik rotowany logrotate lub ręcznie (mv + compress)

**13. AGENTS.md --- kontrakt dla agentów**

Każdy projekt powinien zawierać AGENTS.md w korzeniu repo. Ten plik jest
czytany przez Aidera na początku każdej sesji i definiuje konwencje,
scope i oczekiwania.

+-----------------------------------------------------------------------+
| \# AGENTS.md --- przykład dla projektu Python/FastAPI                 |
|                                                                       |
| \## Rola agenta                                                       |
|                                                                       |
| Implementujesz GitLab Issues jako autonomiczny agent kodowania.       |
|                                                                       |
| Używasz TDD: najpierw testy, potem implementacja.                     |
|                                                                       |
| \## Stack                                                             |
|                                                                       |
| \- Python 3.12+, FastAPI, pytest, SQLAlchemy                          |
|                                                                       |
| \- Formatowanie: black + ruff                                         |
|                                                                       |
| \- Testy: pytest -x \--tb=short (uruchamiaj po każdej zmianie)        |
|                                                                       |
| \## Workflow                                                          |
|                                                                       |
| 1\. Przeczytaj Issue dokładnie.                                       |
|                                                                       |
| 2\. Napisz testy w tests/ które opisują oczekiwane zachowanie.        |
|                                                                       |
| 3\. Implementuj w src/ aż testy przejdą.                              |
|                                                                       |
| 4\. Uruchom: black . && ruff check . && pytest                        |
|                                                                       |
| 5\. Commituj z opisem: \"feat: #\<number\> \<opis\>\"                 |
|                                                                       |
| 6\. Gdy wszystko zielone, wypisz: TASK_DONE                           |
|                                                                       |
| \## Zakres                                                            |
|                                                                       |
| \- Modyfikuj tylko pliki związane z Issue.                            |
|                                                                       |
| \- NIE zmieniaj plików infrastruktury (docker-compose, .gitlab-ci.yml) bez  |
| wyraźnej prośby.                                                      |
|                                                                       |
| \- NIE dodawaj zależności bez potwierdzenia w Issue.                  |
|                                                                       |
| \## Eskalacja                                                         |
|                                                                       |
| Jeśli po 3 próbach testy nadal nie przechodzą --- wypisz ESCALATE i   |
| opisz problem.                                                        |
+-----------------------------------------------------------------------+

*Wersja dokumentu: 1.1 · Luty 2026 · Podsumowanie projektowe dla systemu
multiagentowego*

*Changelog v1.1 vs v1.0:*
*Dodano: 3.5 (context window mgmt), 6C (pipeline persistence),*
*6D (completion detection), 8.3 (scheduler API contract),*
*10.1 (E2E acceptance tests), 11A (error/timeout policy),*
*12A (structured logging). Zmieniono: 6.3 (Zod walidacja),*
*6.4 (execFileSync security fix), 10 (reviewer → v1.0),*
*11 (nowe ryzyka).*
