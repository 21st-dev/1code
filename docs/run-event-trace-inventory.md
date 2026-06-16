# RunEvent And RunTrace Inventory

Date: 2026-06-16

This inventory records what Locus already has for runtime events and trace
display. It is a status document, not a rewrite plan.

Related docs:

- `docs/DESIGN.md`
- `docs/error-semantics.md`

## Ownership

Canonical owners are defined in `docs/OWNERSHIP_MAP.md`.

- Event shape: `src/main/lib/agent-runtime/runtime-events.ts`
- Event redaction: `src/main/lib/agent-runtime/redaction.ts`
- Desktop stream mapping:
  `src/main/lib/agent-runtime/stream-event-mapper.ts`
- Job event vocabulary: `src/shared/agent-jobs.ts`
- Runtime UI state side effects:
  `src/renderer/features/agents/lib/runtime-event-state.ts`

Do not add a second runtime event model in renderer code. Transport-specific
chunks may be parsed at the edge, but durable event meaning belongs to the
canonical runtime event and job event layer.

## Current Event Vocabulary

`src/shared/agent-jobs.ts` defines these event types:

| Event type | Current meaning | Current primary source |
| --- | --- | --- |
| `job_created` | Durable job was created | `headless/job-store.ts` |
| `job_started` | Durable job started | `headless/job-store.ts` |
| `assistant_delta` | Assistant text delta | Desktop stream mapper |
| `reasoning_delta` | Reasoning text delta | Desktop stream mapper |
| `tool_started` | Tool input became available | Desktop stream mapper |
| `tool_delta` | Tool input streamed | Desktop stream mapper |
| `tool_finished` | Tool result or tool error arrived | Desktop stream mapper |
| `guard_decision` | Guard event payload | Desktop stream mapper |
| `permission_requested` | Observed tool or permission decision | Desktop stream mapper |
| `scope_expansion_requested` | Scope expansion semantic slot | Defined and labeled, not directly emitted by the desktop stream mapper today |
| `question_pending` | Runtime asks the user a question | Desktop stream mapper |
| `question_result` | User answer or question timeout | Desktop stream mapper |
| `mcp_needs_auth` | Runtime blocker says MCP needs auth | Desktop stream mapper |
| `usage_update` | Provider/runtime usage metadata | Desktop stream mapper |
| `command_started` | Headless process command started | `headless/process-runner.ts` |
| `command_output` | Headless process stdout/stderr | `headless/process-runner.ts` |
| `command_finished` | Headless process command ended | `headless/process-runner.ts` |
| `artifact_created` | Local Job API/artifact output | `headless/cli-dispatcher.ts` and API flow |
| `status` | Generic runtime status or durable evidence | Desktop stream mapper, adapter startup |
| `error` | Runtime or job error | Desktop stream mapper, headless runner |
| `completed` | Terminal runtime completion | Desktop stream mapper |

## Normalization Pipeline

### Desktop Claude

- Claude desktop chunks use `UIMessageChunk` from `src/main/lib/claude/types.ts`.
- `createClaudeAgentSdkDesktopRunEnvelope()` emits chunks through
  `createRuntimeRendererChunkEmitter()`.
- The emitter maps active desktop chunks with `createDesktopStreamEventMapper()`
  and persists them with `appendRunEventsToAgentJob()`.
- `auth-error`, `capability-error`, `error`, `guard-audit`,
  `observed-tool-decision`, `retry-notification`, and `runtime-status` are
  redacted before renderer emission.

### Desktop Codex

- Codex ACP temporary compatibility emits existing UI chunks through the Codex
  transport path.
- Codex app-server notifications are mapped by
  `src/main/lib/codex/app-server-stream-events.ts` into the same desktop chunk
  vocabulary.
- App-server token usage becomes `message-metadata`, then `usage_update`.
- App-server file change notifications currently become `file-change-diff`,
  `file-change-patch`, or `file-change-delta` chunks. The shared stream mapper
  persists these as `status` events with `payload.chunkType`, not as dedicated
  `file_change_*` event types.
- Controlled edit approvals also emit `file-change-diff` and
  `file-change-delta` chunks before and after the approved write.

### Headless And Local Job API

- Headless process-backed runs emit `command_started`, `command_output`, and
  `command_finished` through the headless observer.
- Headless job storage serializes events for CLI and Local Job API consumers.
- Local Job API v1 exposes a stable event envelope and intentionally does not
  require consumers to parse raw `RunEvent` internals.

## Persistence And Redaction

`RunEvent` contains:

- `runId`
- `jobId`
- `runtimeId`
- `sequence`
- `type`
- `createdAt`
- optional `payload`
- `redaction.status`
- `redaction.appliedRules`

When persisted into `agent_job_events`, the payload is wrapped with:

- `runId`
- `runtimeId`
- `runEventSequence`
- `redaction`
- `payload`

Redaction currently catches secret-like keys and common secret text patterns,
including API keys, bearer tokens, authorization values, cookies, passwords,
client secrets, and OAuth-like fields.

## Renderer Display Status

### Already User-Visible

- Desktop chat streams render assistant text, reasoning, tools, user questions,
  guard cards, MCP server indicator, usage hover details, and file/diff surfaces
  through the existing chat UI.
- `runtime-event-state.ts` updates renderer state for:
  - Ask-user-question pending, timeout, and result.
  - Guard events.
  - Guard audit.
  - Pending scope expansion requests derived from guard event payloads.
- Runs & History (`AgentWorkbench`) can list jobs and open a job trace using
  `agentJobs.show` for the selected job record and `agentJobs.logs` for
  already-redacted persisted events.
- The selected job trace shows a record header before the timeline:
  - job ID
  - source
  - runtime
  - mode
  - status
  - created/started/finished timing
  - final error
  - API consumer/artifact metadata when present
- Workbench job trace rows use the shared `WorkbenchTraceRow` presenter and
  show:
  - sequence
  - semantic event label
  - event type
  - semantic payload
  - secondary raw payload
- Observed permission events get a small semantic summary in trace rows.
- DetailsSidebar can render compact current-run trace, usage, and error widgets
  without making the historical Workbench page the primary chat surface.

### Visible But Still Log-Like

- Runs & History trace still shows ordered event rows. It is not yet a full
  timeline debugger with filtering, grouping, or jump-to-source controls.
- `file-change-diff`, `file-change-patch`, and `file-change-delta` are persisted
  under generic `status`, so the Workbench cannot filter them as first-class
  file-change events without reading `payload.chunkType`.
- Runtime adapter startup is a `status` payload, not a distinct adapter event.
- MCP ready/unknown/needs-auth state is present in `runtime-status` payloads,
  but only `mcp_needs_auth` has a dedicated event type.

### Mostly In Logs Or Payloads

- Provider binding metadata and adapter source are present in run request,
  adapter status payloads, capability metadata, or message metadata, but not yet
  a dedicated Workbench trace row family.
- Capability diagnostics exist in provider/runtime capability surfaces and
  `capability-error` chunks, but are not unified into a single trace inspector.
- Token/context usage is normalized when runtimes expose it, but cache-specific
  usage remains provider-specific and optional.
- Scope expansion is stored as a guard event payload and renderer state request;
  the dedicated `scope_expansion_requested` event slot is not the main emitted
  path today.

## Real Gaps

These are actual next-step gaps. They do not require replacing the event system.

1. **Richer timeline filtering and grouping**
   The shared presenter now renders semantic rows before raw payloads. The
   remaining Workbench gap is filtering, grouping, and jump affordances across
   runtime, provider, MCP, tool, command, file change, guard, question, usage,
   error, and final-state rows.

2. **File-change event semantics**
   File changes should become a first-class trace category or documented status
   subcategory. Today they are durable evidence under `status`.

3. **Provider binding and capability trace rows**
   Provider profile, model, adapter source, capability support, degraded state,
   and fallback reason should be visible as trace rows, not only diagnostics or
   metadata.

4. **Error semantics coverage**
   Error rows and the DetailsSidebar error widget use documented product fields
   where possible. More chunks still need stable product codes and next actions;
   current events can still carry `errorText`, blocker messages, or thrown error
   messages.

5. **MCP readiness detail**
   `mcp_needs_auth` is clear, but ready, unknown, partial, and degraded states
   need consistent semantic display.

6. **Usage and cost schema**
   `usage_update` exists, and Codex app-server maps token usage. The Details
   sidebar and trace presenter can show unavailable or partial metadata, but the
   trace still needs provider-agnostic source fields for cache, cost, and
   context-window metadata.

7. **Artifact trace**
   `artifact_created` exists for headless/API artifacts. Desktop file/diff
   artifacts and Local Job API artifacts should be displayed through the same
   artifact mental model where possible.

## Non-Gaps

Do not spend time "creating RunEvent from scratch." Locus already has:

- Canonical `RunEvent` shape.
- Shared event vocabulary.
- Desktop stream mapper.
- Redaction before persistence/renderer emission.
- Durable `agent_job_events`.
- Workbench job trace reader.
- Shared renderer `WorkbenchTraceRow` presenter.
- Local Job API event envelope.
- Renderer state owner for guard and ask-user-question chunks.

The next improvement is enriching the trace, not replacing the plumbing.

## Implemented Trace Presenter

The renderer has a shared Workbench trace presenter that consumes existing
`agentJobs.logs` events and maps them to view models:

```ts
type WorkbenchTraceRow =
  | { kind: "runtime"; title: string; status: "ready" | "degraded" | "failed" }
  | { kind: "provider"; title: string; model?: string; profileId?: string }
  | { kind: "mcp"; title: string; status: "ready" | "needs-auth" | "unknown" }
  | { kind: "tool"; title: string; status: "started" | "completed" | "failed" }
  | { kind: "file-change"; path: string; status: "proposed" | "applied" }
  | { kind: "approval"; title: string; status: "pending" | "allowed" | "denied" }
  | { kind: "usage"; title: string; tokens?: number; costUsd?: number }
  | { kind: "error"; code: string; title: string; nextAction?: string }
  | { kind: "final"; status: "succeeded" | "failed" | "canceled" | "interrupted" }
```

This is a renderer view-model layer over existing events, not a new
durable event source.

Error trace rows should use the product codes and field names defined in
`docs/error-semantics.md`.
