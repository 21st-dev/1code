## Context
The current code has two runtime execution depths:

- Desktop Workbench path: rich `DesktopRunRequest`, `PermissionPolicy`,
  provider binding, MCP readiness, attachments, session metadata, approval and
  user-interaction bridges, and semantic `RunEvent` trace mapping.
- Headless/API path: thin `AgentRuntimeRunRequest` with job ID, runtime, cwd,
  mode, prompt, and signal. Runtime selection is `Record<runtimeId, adapter>`;
  Codex runs `codex exec`, Claude runs `claude -p`, and process output is
  appended through `AgentRuntimeObserver.appendEvent`.

The gap is not that headless has worse `RunEvent` coverage; headless currently
does not consume `RunEvent` as its internal event contract. It emits a smaller
set of job events such as `assistant_delta`, `command_started`,
`command_output`, `command_finished`, `status`, and `error`.

## Goals
- Make one runtime execution boundary the canonical place for request shape,
  adapter selection, permission policy, event normalization, cancellation, and
  result semantics.
- Preserve existing Local Job API v1 request, event, result, and artifact
  envelopes while improving the internal runtime trace contract.
- Keep batch adapters available and honest.
- Allow future Codex app-server job execution without turning it into the
  default for every headless/API caller.

## Non-Goals
- Do not implement ACP editor integration or replace the custom stdio protocol.
- Do not add Local Job API v2 callbacks, WebSocket, HTTP server, or interactive
  approval APIs in this change.
- Do not remove `codex exec` or `claude -p` batch fallback paths.
- Do not force desktop-only fields such as chat ID, sub-chat ID, or renderer UI
  state into every headless request.
- Do not move renderer runtime-event atom ownership.
- Do not change existing headless guarded-run scope-contract semantics or
  runtime-security-baseline requirements. Headless app-server scope
  enforcement, stronger policy grants, or security-baseline changes require a
  separate proposal or explicit delta.

## Decisions
### Shared Request Shape
Introduce a shared run request base for data common to desktop and headless:
run identity, runtime ID, mode, cwd, prompt, cancellation signal, source/surface,
requested capabilities, permission policy summary, provider reference metadata,
and observer.

Desktop and headless requests remain typed extensions. Desktop keeps verified
chat/sub-chat context, MCP readiness, attachments, sessions, and interactive
bridges. Headless keeps job/source/consumer/artifact context without pretending
to have a visible user.

### Adapter Selection
Replace `runtimeId -> adapter` selection with an execution selector. The
selector MUST consider runtime ID, source/surface, execution profile, requested
capabilities, adapter availability, and permission policy. Example profiles:

- `batch`: process-backed `codex exec` or `claude -p`
- `interactive`: desktop/app-server or SDK path with user-interaction support
- `policy-grant`: non-desktop execution where predeclared policy can decide
  without prompting a user

The selector MUST emit a renderer-safe diagnostic when it falls back or refuses
to select an adapter.
`policy-grant` is not a promise of per-scope enforcement on every adapter:
batch adapters without pre-execution hooks may only use documented
sandbox-level controls or fail closed.

### Event Boundary
Runtime adapters emit canonical `RunEvent` records after redaction. Job storage
persists those events through the existing append-only job event store. Local
Job API v1 maps persisted events into its stable v1 event envelope; v1 does not
become a rich interaction protocol.

Batch process adapters may still produce coarse events, but those events are
created through a `RunEvent` bridge rather than bypassing the runtime event
owner.

### Permission Policy
Split permission policy into surface-aware semantics:

- `interactive-user`: a visible user can answer approval and question requests.
- `policy-grant`: a headless/API job declares bounded scopes that the policy can
  approve or deny without user interaction.
- `fail-closed`: any interactive-only approval, user input, MCP elicitation, or
  unknown side effect fails before provider work or at the provider callback.

Headless/API jobs MUST NOT silently upgrade to all-permissions execution because
no user is present.

### App-Server Job Adapter
Codex app-server job execution is allowed only after the shared request,
selector, event, and permission policy boundaries exist. The initial selector
MUST keep batch as the default for existing Local Job API v1 callers unless the
request explicitly asks for an app-server-capable profile and passes policy
gates.

## Risks / Trade-Offs
- Event migration can create duplicate or mismatched job events. Mitigation:
  bridge old headless event types through a single mapper and add tests proving
  Local Job API v1 output compatibility.
- App-server requires interaction callbacks that headless lacks. Mitigation:
  default to `fail-closed` unless a policy grant or interactive channel is
  explicitly present.
- Policy grants can be overstated on batch adapters. Mitigation: adapters
  without pre-execution hooks must report sandbox-level enforcement honestly or
  fail closed instead of claiming per-scope control.
- Selector complexity can hide fallback behavior. Mitigation: adapter source,
  fallback reason, and unsupported-capability diagnostics are emitted and
  persisted without secrets.
- Shared request types can become bloated. Mitigation: keep a small base and
  use surface-specific extensions.

## Deferred Follow-ups
- Optimize headless event persistence after correctness lands. The initial
  RunEvent bridge may look up job runtime/source while appending each event;
  high-frequency `assistant_delta` streams can later pass that metadata through
  the caller or cache it per job without changing Local Job API v1 envelopes.
- Persisting redaction metadata is a Local Job API v2 or diagnostics follow-up.
  The bridge computes redaction status/rules internally, but v1 payloads do not
  expose a stable field for "this event was redacted" metadata.

## Migration Plan
1. Add shared request/result/observer types and keep adapters on existing call
   paths.
2. Add execution selector while preserving current batch selection as the
   default for headless/API jobs.
3. Bridge headless process events into canonical `RunEvent` records and map
   them back to existing job event types for Local Job API v1 compatibility.
4. Add non-desktop permission policy modes and fail-closed tests.
5. Add a gated Codex app-server job adapter proof after request, selector,
   event, and policy tests pass.

## Open Questions
- Which downstream callers should be allowed to request non-batch execution
  profiles in v1, if any?
- Should app-server headless jobs require registered project scope only, or a
  stronger declared scope contract?
- Should Local Job API v2 expose rich `RunEvent` records directly or keep a
  compatibility envelope with richer payloads?
