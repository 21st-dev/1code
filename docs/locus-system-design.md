# Locus — System Design (MVP-grade, built to scale)

> Written as a senior full-stack engineer would document a startup MVP: a minimal
> but extensible system, grounded in the **actual** code in this repository, not a
> throwaway demo. Locus is a local-first desktop AI workbench for running coding
> agents (Claude Code, Codex, provider-backed agents) against local projects with
> visible, auditable tool activity, durable jobs, a CLI, a daemon, schedules, and a
> machine-readable Local Job API.

---

## 1. Architecture

### 1.1 Design goals (the "why" behind the shape)

| Goal | Consequence in the design |
| --- | --- |
| **Local-first & auditable** | All state lives in a local SQLite DB; every agent run emits an append-only event log. No hosted backend in the default build (`LOCUS_LOCAL_ONLY=true`). |
| **Runtime-neutral** | A `RuntimeRegistry` abstracts Claude Code / Codex / ACP behind one adapter contract, so adding a runtime never touches the UI or job store. |
| **Durable & recoverable** | Jobs are rows, not in-memory promises. A worker writes heartbeats; a recovery pass re-reconciles orphaned jobs on startup. |
| **One core, many surfaces** | Desktop UI, headless CLI, daemon queue, schedules, and the Local Job API are all thin clients over the **same** job store + runtime registry. |
| **Type-safe boundaries** | tRPC gives end-to-end types from main → renderer; the Local Job API is an explicit, versioned JSON contract for *other* local tools. |

### 1.2 Process planes

Locus is an Electron app, so it is structured as **four cooperating planes** plus a
headless plane that can run with no window at all:

```
┌──────────────────────────────────────────────────────────────────────┐
│ RENDERER (React 19)         features/agents, settings, kanban, terminal │
│   Jotai (UI state) · Zustand (sub-chat tabs) · React Query (server)     │
└───────────────▲───────────────────────────────────────────┬───────────┘
                │ tRPC over IPC (type-safe)                  │ desktopApi
                │ subscriptions for streaming                │ (native bits)
┌───────────────┴───────────────────────────────────────────▼───────────┐
│ PRELOAD (context-isolated bridge)  exposes window.desktopApi + tRPC link │
└───────────────▲────────────────────────────────────────────────────────┘
                │
┌───────────────┴────────────────────────────────────────────────────────┐
│ MAIN (Electron main process)                                            │
│   • tRPC routers (30+)        • auth-manager / secure-storage           │
│   • RuntimeRegistry + adapters (Claude Code, Codex, ACP)                │
│   • Job store (Drizzle/SQLite)   • git / worktree / terminal services   │
└───────────────▲───────────────────────────┬────────────────────────────┘
                │ shared core (imports)      │ same core
┌───────────────┴───────────────┐  ┌─────────▼──────────────────────────┐
│ HEADLESS (no window)          │  │ PERSISTENCE                         │
│  locus run / jobs / api /     │  │  SQLite @ {userData}/data/agents.db │
│  daemon / schedules / acp     │  │  Drizzle ORM, auto-migrated on boot │
└───────────────────────────────┘  └─────────────────────────────────────┘
```

The key architectural decision: **the headless plane and the desktop main process
share the same `job-store`, `runtime-registry`, and `db` modules.** A run started
from the UI and a run started by `locus run` are the same kind of row, observed the
same way. This is what makes the system "a platform" rather than "a chat UI".

### 1.3 The agent-run pipeline (the core loop)

```
request ──► permission-policy ──► preflight ──► runtime adapter ──► process-runner
   │            (plan/agent)        (auth,         (Claude/Codex/      (spawn CLI,
   │                                 model,         ACP stdio)          stream stdout)
   │                                 capability)         │
   ▼                                                     ▼
job-store.createAgentJob ──► startAgentJob ──► append events (seq-ordered) ──► complete
        (status=queued)        (running)         stream-event-mapper            (succeeded/
                                                 normalizes provider             failed/
        heartbeatAgentJob (liveness) ◄───────────  output → RuntimeEvent        canceled)
```

- **`permission-policy`** decides what the run may do (`plan` = read-only, `agent` = full).
- **`preflight`** validates provider auth, model, and required capabilities *before* spawning, with **redaction** of secrets in any echoed config.
- **`stream-event-mapper`** turns heterogeneous provider stdout into a single
  `RuntimeEvent` shape, so the UI and the Local Job API never special-case a runtime.
- **`job-recovery`** runs on startup: any job left `running` with a stale heartbeat is
  reconciled (marked failed/recoverable) so a crash never leaves a zombie.

### 1.4 Extension points (how it scales without rewrites)

| You want to add… | You touch only… |
| --- | --- |
| A new agent runtime | `agent-runtime/runtime-registry.ts` + a new adapter in `headless/adapters/` |
| A new provider (Anthropic/OpenAI-compatible) | `agent_provider_profiles` rows + `provider-profiles` router; no UI change |
| A new backend capability | a new tRPC router under `trpc/routers/` wired in `routers/index.ts` |
| A new automation surface | a new client over `headless/job-store` (CLI verb, schedule, API endpoint) |
| A new UI workflow | a new folder under `renderer/features/` consuming existing routers |

---

## 2. File structure

Only the load-bearing paths are shown; this mirrors the real tree.

```
src/
├── main/                              # Electron main process
│   ├── index.ts                       # App entry, window + headless dispatch
│   ├── auth-manager.ts                # OAuth flow + token refresh
│   ├── auth-store.ts / secure-storage.ts   # Encrypted creds (safeStorage)
│   ├── constants.ts · local-only.ts · user-data-path.ts
│   ├── windows/main.ts                # Window creation, IPC handler wiring
│   └── lib/
│       ├── db/
│       │   ├── index.ts               # DB init + auto-migrate on startup
│       │   ├── schema/index.ts        # Drizzle schema (SOURCE OF TRUTH)
│       │   └── utils.ts               # createId()
│       ├── agent-runtime/             # Desktop run pipeline
│       │   ├── runtime-registry.ts    # Runtime-neutral registry
│       │   ├── desktop-runner.ts · desktop-run-request.ts
│       │   ├── permission-policy.ts · preflight.ts · redaction.ts
│       │   └── stream-event-mapper.ts · runtime-events.ts
│       ├── headless/                  # No-window plane (shared core)
│       │   ├── job-store.ts           # Durable job CRUD + events (Drizzle)
│       │   ├── job-runner.ts · process-runner.ts · job-recovery.ts
│       │   ├── daemon.ts · schedules.ts
│       │   ├── local-job-api.ts       # Local Job API v1 envelopes/validation
│       │   ├── cli-args.ts · cli-dispatcher.ts · cli-output.ts
│       │   ├── acp-stdio.ts           # Experimental ACP stdio surface
│       │   └── adapters/              # Per-runtime adapters
│       ├── claude/ · codex/ · ollama/ # Runtime integrations
│       ├── provider-profiles/ · app-agents/ · skills/ · plugins/
│       ├── git/ · terminal/ · fs/ · voice/ · github-workflow/
│       └── trpc/routers/              # 30+ type-safe routers (see §4)
│
├── preload/index.ts                   # context-isolated bridge: desktopApi + tRPC
│
└── renderer/                          # React 19 UI
    ├── App.tsx
    ├── features/
    │   ├── agents/                    # Main chat workbench
    │   │   ├── main/                  # active-chat.tsx, new-chat-form.tsx
    │   │   ├── ui/                    # tool renderers, diff view, preview
    │   │   ├── commands/              # /plan /agent /clear …
    │   │   ├── atoms/ · stores/ · hooks/ · workbench/
    │   ├── automations/ · kanban/ · changes/ · terminal/
    │   ├── settings/ · sidebar/ · onboarding/ · file-viewer/ · mentions/
    │   └── layout/
    ├── components/ui/                  # Radix wrappers
    └── lib/{trpc.ts, atoms/, stores/}

resources/cli/locus                    # CLI launcher (dev). `1code` kept as legacy alias
drizzle/                               # Generated SQL migrations (dev)
docs/                                  # Specs, consumer guides, this document
openspec/                              # Change-proposal workflow (AGENTS.md)
```

---

## 3. Database schema

SQLite at `{userData}/data/agents.db`, Drizzle ORM, **auto-migrated on startup**.
Source of truth: `src/main/lib/db/schema/index.ts`. Grouped by concern:

### 3.1 Workspace domain

```
projects (id, name, path UNIQUE, gitRemoteUrl, gitProvider, gitOwner,
          gitRepo, iconPath, createdAt, updatedAt)
   │ 1───many
chats    (id, name, projectId→projects, worktreePath, branch, baseBranch,
          prUrl, prNumber, archivedAt, createdAt, updatedAt)
   │ 1───many
sub_chats(id, name, chatId→chats, sessionId, streamId,
          mode 'plan|agent', messages JSON, createdAt, updatedAt)
```

`projects → chats → sub_chats`, all `ON DELETE CASCADE`. A **chat** can own a git
worktree (isolation per task); a **sub-chat** is one resumable agent conversation
(`sessionId` resumes the provider session; `messages` is a JSON transcript).

### 3.2 Credentials & providers (all tokens encrypted via `safeStorage`)

```
claude_code_credentials      (default row; legacy OAuth — DEPRECATED)
anthropic_accounts           (multi-account OAuth: email, displayName, oauthToken, lastUsedAt)
anthropic_settings           (singleton: activeAccountId)
claude_provider_config       (default: model, baseUrl, authMode, encryptedToken)
local_api_provider_configs   (per-purpose OpenAI-compatible: sub_chat_title, commit_message)
agent_provider_profiles      (runtime-neutral: protocol, baseUrl, defaultModel, authMode,
                              headersJson, targetRuntimesJson, capabilitiesJson, lastTestStatusJson)
agent_provider_defaults      (purpose PK → profileId, modelOverride)   // claude-main, codex-main, …
app_agents                   (name UNIQUE, description, prompt, tools, disallowedTools)
```

`agent_provider_profiles` is the extensible heart of provider handling: any
Anthropic / `openai-chat` / `openai-responses` endpoint becomes a row, routed to
runtimes via `targetRuntimesJson` and selected per-purpose by `agent_provider_defaults`.

### 3.3 Durable jobs, events, schedules

```
agent_jobs        (id, retryOfJobId, attempt, source, runtime, status, mode, cwd,
                   projectId?, chatId?, subChatId?, promptPreview, inputJson,
                   apiConsumerId, apiConsumerRunId, artifactBaseDir, artifactManifestPath,
                   startedAt, finishedAt, exitCode, errorCode, errorMessage, resultJson,
                   workerId, workerPid, workerStartedAt, heartbeatAt,
                   cancelRequestedAt, cancelRequestedBy)
   │ 1───many (cascade)
agent_job_events  (id, jobId→agent_jobs, sequence, type, payloadJson, createdAt)
                   UNIQUE(jobId, sequence)   // gap-free, append-only ordering

agent_schedules   (id, name, status, runtime, mode, cwd, projectId?, inputJson,
                   intervalSeconds, timezone, nextRunAt, lastRunAt, lastJobId→agent_jobs)
   │ 1───many
agent_schedule_runs(id, scheduleId→agent_schedules, jobId→agent_jobs, trigger, scheduledFor)
```

Status lifecycle: `queued → running → {succeeded | failed | canceled}` (terminal
states guarded in `job-store.ts`). Indexes on `status`, `source`, `runtime`, `cwd`,
`heartbeatAt`, and the API consumer columns keep queue scans and recovery cheap.
`UNIQUE(jobId, sequence)` is the concurrency guard that makes the event log
deterministic and replayable.

---

## 4. API surface

Three layers, one core. **In-app** uses tRPC; **other local tools** use the
versioned Local Job API; **humans/automation** use the CLI.

### 4.1 tRPC routers (main ↔ renderer, type-safe)

Composed in `trpc/routers/index.ts`. Each is a domain boundary:

| Router | Responsibility |
| --- | --- |
| `projects`, `chats`, `chatAttachments` | Workspace CRUD, attachments |
| `claude`, `claudeCode`, `claudeSettings`, `claudeProviderConfig` | Claude runtime + config |
| `codex`, `ollama` | Other runtimes |
| `providerProfiles`, `localApiProviderConfig`, `anthropicAccounts` | Provider/account mgmt |
| `agentRuntime` | Runtime registry truth (capabilities per runtime) |
| `agentJobs`, `agentSchedules`, `agentWorkbench` | Durable jobs, schedules, run history |
| `agents`, `appAgents`, `skills`, `commands`, `plugins` | Agent defs, slash commands, skills |
| `terminal`, `files`, `worktreeConfig`, `changes` (git) | Local project ops |
| `voice`, `external`, `githubWorkflow`, `appUpdates`, `debug` | Utility surfaces |

Streaming uses tRPC **subscriptions** (e.g. `claude.onMessage`) so the renderer
receives normalized `RuntimeEvent`s live.

### 4.2 Local Job API v1 (`locus api`) — the downstream contract

Defined in `headless/local-job-api.ts`. Downstream tools must use this instead of
importing Locus source or reading `agents.db` directly. JSON in / JSON(L) out:

```bash
locus api runtimes list --json                 # capability manifest per runtime
locus api runs create --request request.json --json
locus api runs status <job-id> --json
locus api runs events <job-id> --after <seq> --jsonl   # incremental, seq-ordered
locus api runs result <job-id> --json          # final envelope + artifacts
locus api runs cancel <job-id> --json
locus api runs retry  <job-id> --json          # new attempt, retryOfJobId set
```

Stable envelopes (`LocalJobApiJobEnvelope`, `…EventEnvelope`, `…ResultEnvelope`,
`…RuntimeManifestEnvelope`) decouple the wire format from DB columns. Requests are
capability-validated (`validateLocalJobApiRequiredCapabilities`) and artifact dirs
are sandbox-validated (`validateLocalJobApiArtifactBaseDir[ForProject]`). Each run
writes `events.jsonl` + `result.json` artifacts for offline inspection.

### 4.3 CLI (`locus`) — human/automation surface

```bash
locus .                                # open project in desktop app
locus run --runtime codex --mode plan --prompt "Inspect this project"
locus jobs list | show <id> | logs <id>
locus daemon                           # local queue worker
```

`cli-dispatcher.ts` routes verbs to the same job store; `1code` remains as a legacy
launcher alias.

---

## 5. UI architecture

React 19 renderer; state split by lifetime, screens composed under `features/`.

### 5.1 State strategy

| Concern | Tool | Why |
| --- | --- | --- |
| Ephemeral UI (selection, panels, preview) | **Jotai** atoms | Fine-grained, fast |
| Sub-chat tabs & pinned state | **Zustand** (persisted to localStorage) | Survives reload |
| Server state (projects, jobs, messages) | **React Query** via tRPC | Caching + refetch + subscriptions |

### 5.2 Screen / feature map

```
layout/                 Resizable panels (sidebar · main · details)
 ├─ sidebar/            Chat list, archive, project nav
 ├─ agents/             ◀ primary workbench
 │   ├─ main/           active-chat.tsx (transcript), new-chat-form.tsx
 │   ├─ ui/             tool renderers (bash, edit, web), diff view, preview
 │   ├─ commands/       /plan /agent /clear …
 │   ├─ workbench/      run status / capability surfacing
 │   ├─ mentions/       @file / @symbol context insertion
 │   └─ atoms/ stores/ hooks/
 ├─ changes/            Git diff / file change review
 ├─ kanban/             Board view over chats/jobs
 ├─ automations/        Schedules & job history (Local Job API surfaced visually)
 ├─ terminal/           Embedded terminal
 ├─ file-viewer/        Read-only project file inspection
 ├─ settings/           Providers, accounts, profiles, app config
 └─ onboarding/         First-run: repo select + provider setup
```

The renderer never spawns processes or touches the DB — it only calls tRPC. That
boundary is what lets the same backend power the desktop app and the headless CLI.

---

## 6. Code (key, runnable excerpts)

These are the load-bearing seams. They compile against the existing modules; full
implementations live at the paths shown.

### 6.1 Drizzle schema (jobs core) — `src/main/lib/db/schema/index.ts`

```typescript
export const agentJobs = sqliteTable("agent_jobs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  retryOfJobId: text("retry_of_job_id"),
  attempt: integer("attempt").notNull().default(1),
  source: text("source").notNull(),            // "desktop" | "cli" | "api" | "schedule"
  runtime: text("runtime").notNull(),          // "claude-code" | "codex" | "acp"
  status: text("status").notNull().default("queued"),
  mode: text("mode").notNull().default("agent"),
  cwd: text("cwd").notNull(),
  heartbeatAt: integer("heartbeat_at", { mode: "timestamp" }),
  cancelRequestedAt: integer("cancel_requested_at", { mode: "timestamp" }),
  resultJson: text("result_json"),
}, (t) => [ index("agent_jobs_status_idx").on(t.status),
            index("agent_jobs_heartbeat_at_idx").on(t.heartbeatAt) ])

export const agentJobEvents = sqliteTable("agent_job_events", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  jobId: text("job_id").notNull().references(() => agentJobs.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
}, (t) => [ uniqueIndex("agent_job_events_job_sequence_idx").on(t.jobId, t.sequence) ])
```

### 6.2 Durable, gap-free event append — `headless/job-store.ts`

```typescript
// Terminal states are guarded; sequence collisions are detected and surfaced so
// two workers can never silently interleave a job's event log.
export function appendAgentJobEvent(db: AgentJobDatabase, input: AppendAgentJobEventInput) {
  const job = getAgentJob(db, input.jobId)
  if (!job) throw new Error(`Unknown job ${input.jobId}`)
  if (isTerminalAgentJobStatus(job.status as AgentJobStatus))
    throw new Error(`Job ${job.id} is already terminal: ${job.status}`)
  try {
    return db.insert(agentJobEvents).values({
      jobId: input.jobId, sequence: input.sequence,
      type: input.type, payloadJson: JSON.stringify(input.payload ?? {}),
    }).returning().get()
  } catch (e) {
    if (/unique constraint failed: agent_job_events\.job_id/i.test(String(e)))
      throw new Error(`Sequence ${input.sequence} already exists for job ${input.jobId}`)
    throw e
  }
}
```

### 6.3 Runtime-neutral registry (extension seam) — `agent-runtime/runtime-registry.ts`

```typescript
// Adding a runtime = register one manifest. UI, job store, and Local Job API are
// untouched because they consume the manifest, not provider-specific code.
export interface RuntimeManifest {
  id: "claude-code" | "codex" | "acp"
  capabilities: { plan: boolean; agent: boolean; resume: boolean; tools: string[] }
  preflight(req: DesktopRunRequest): Promise<PreflightResult>   // auth/model/redaction
  spawn(req: DesktopRunRequest): AsyncIterable<RuntimeEvent>    // normalized stream
}
export function listRegisteredAgentRuntimeManifests(): RuntimeManifest[] { /* … */ }
```

### 6.4 tRPC router composition — `trpc/routers/index.ts`

```typescript
export function createAppRouter(getWindow: () => BrowserWindow | null) {
  return router({
    projects: projectsRouter, chats: chatsRouter,
    claude: claudeRouter, codex: codexRouter, ollama: ollamaRouter,
    providerProfiles: providerProfilesRouter, agentRuntime: agentRuntimeRouter,
    agentJobs: agentJobsRouter, agentSchedules: agentSchedulesRouter,
    changes: createGitRouter(),  // git ops
    /* …30+ domain routers… */
  })
}
export type AppRouter = ReturnType<typeof createAppRouter>   // ← end-to-end types to renderer
```

### 6.5 Local Job API envelope (downstream contract) — `headless/local-job-api.ts`

```typescript
// Wire format is decoupled from DB columns, so schema changes don't break consumers.
export function toLocalJobApiResultEnvelope(job: AgentJob, artifacts: FileArtifact[]) {
  return {
    schema: "locus.local-job-api.v1",
    jobId: job.id, status: job.status,
    runtime: job.runtime, exitCode: job.exitCode,
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    result: parseJobResult(job), artifacts,
  }
}
```

---

## 7. Scaling path (MVP → product)

| Stage | Move |
| --- | --- |
| **Now (MVP)** | Single SQLite, single daemon, three runtimes, local-only. |
| **Concurrency** | Multiple daemon workers already safe via `UNIQUE(jobId, sequence)` + heartbeat/recovery; add a claim query (`status='queued'` → `running` with `workerId`). |
| **More runtimes/providers** | Register a manifest + adapter; add provider profile rows. No UI/core change. |
| **More surfaces** | New CLI verb / schedule / API endpoint over the same job store. |
| **Optional hosted** | Reintroduce only behind an OpenSpec proposal with `LOCUS_LOCAL_ONLY=false`; the boundary already exists. |

The system is an MVP you can ship today and a platform you can extend tomorrow —
because every surface is a thin client over one durable, runtime-neutral job core.
```
