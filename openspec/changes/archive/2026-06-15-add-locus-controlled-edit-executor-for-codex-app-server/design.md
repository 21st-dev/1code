## Context
The Codex app-server migration proved the official app-server transport, provider
binding, plan mode, MCP readiness, cancellation, fallback diagnostics, and
bounded shell approval in automated smoke. Earlier real UI dogfood then showed a
product gap: guarded UI jobs could fail closed, but productive guarded editing
did not complete.

The blocked path is not a missing approval button. The real guarded UI job
`mqaoh6sq0mbdukry` persisted `permissionPolicy.guarded: true` and
`appServerApprovalPolicy: untrusted`, but emitted no `question_pending`,
`question_result`, tool, command, or approval events. The model answered that
the write was refused. That means the write did not reach a user approval
round-trip.

Structured `apply_patch` is not currently exposed by the app-server/provider
path even after local enablement experiments. Widening shell parsing would move
Locus toward maintaining a shell safety parser, which conflicts with the
fail-closed controllability goal.

The first `locus_edit` adoption probe split by provider path. Provider-profile
gateway runs discovered the MCP server and requested `tools/list`, but the model
did not initially receive `locus_edit.propose_file_edit` as a callable function.
Direct ChatGPT app-server runs with inherited Codex auth did surface the tool:
the light-hint tier called `locus_edit.propose_file_edit` with structured edit
intent while shell writes were denied. Bundled `codex exec` also emitted an MCP
tool-call event for the same tool.

Gateway tracing later localized the provider-profile failure: Codex app-server
sent Responses `type:"namespace"` tools into the gateway, but the
Responses-to-chat transform only preserved plain `type:"function"` tools and
dropped namespaces. The gateway now flattens namespace tools into chat function
names, maps returned function calls back to Responses `namespace` calls, and
proved provider-profile adoption plus productive controlled edit in live smoke.

## Goals
- Prove whether Codex app-server models will call a Locus-owned structured edit
  tool when guarded shell writes are denied.
- Keep filesystem writes owned by Locus main-process code, not by shell command
  parsing.
- Reuse the guarded scope contract, diff/approval, runtime event, redaction, and
  job persistence owners.
- Upgrade only auth/provider paths with both adoption evidence and productive
  controlled-edit smoke; direct/app-managed and provider-profile gateway paths
  are proven, while unknown auth context remains degraded.

## Non-Goals
- Do not widen bounded shell parsing to cover arbitrary model shell write forms.
- Do not claim `apply_patch` support unless app-server exposes that tool surface
  in a real desktop run.
- Do not implement the full controlled edit executor before the adoption probe
  proves model/tool adoption.
- Do not add a second durable approval or diff schema outside the existing
  runtime-control owners.

## Decisions
- Decision: expose a minimal `locus_edit` MCP server only for Codex app-server
  guarded probe runs.
  - Rationale: MCP readiness is already proven for app-server, and MCP lets
    Locus own the tool schema without depending on app-server `apply_patch`.
- Decision: the first probe tool is non-writing.
  - Rationale: adoption is the unknown. The probe should only record whether
    the model calls `locus_edit` with a structured edit intent.
- Decision: guarded shell writes remain denied during the adoption probe.
  - Rationale: otherwise the model can bypass the structured tool and the probe
    does not answer the adoption question.
- Decision: a successful executor must use Locus main-process writes after
  scope validation, diff rendering, and explicit user approval.
  - Rationale: this preserves Locus as the controlled execution layer.
- Decision: the first product executor uses app-server native `dynamicTools`
  and handles `item/tool/call` in the desktop adapter, while the adoption probe
  remains MCP-based evidence.
  - Rationale: the probe proved direct/app-managed model adoption of the
    `locus_edit` tool shape, but product writes should not require launching a
    write-capable MCP subprocess or copying write authority into `CODEX_HOME`.
    Native dynamic tools keep the call in the main process and reuse the
    app-server approval hook boundary.
- Decision: the first real executor accepts full-file `create` and `replace`
  payloads only.
  - Rationale: full replacement keeps stale detection and diff rendering simple
    for the first safety slice. Unified patch parsing remains deferred until it
    has separate parser and stale-content proof.
- Decision: approval UI reuses the existing AskUserQuestion pending/result
  owner and emits bounded `file-change-diff` / `file-change-delta` runtime
  events.
  - Rationale: this avoids a second durable approval or diff schema while still
    persisting the normalized runtime-control event trail.
- Decision: provider-profile gateway runs receive the controlled edit dynamic
  tool only after gateway namespace-tool translation and provider-profile
  productive smoke pass.
  - Rationale: the first three-way evidence showed provider-profile discovered
    MCP tools but did not surface them as callable model tools. Live gateway
    trace then showed namespace tools were present on incoming Responses
    payloads and dropped during Responses-to-chat conversion. After flattening
    namespace tools and restoring namespace on returned function calls,
    provider-profile smoke proved both `locus_edit` adoption and productive
    controlled edit.
- Decision: prepared edits must re-check current file contents at apply time,
  after user approval and before the main-process write.
  - Rationale: prepare-time stale detection alone leaves an approval-window
    content race. Apply-time content revalidation preserves fail-closed writes
    if another process modifies or creates the target while the approval UI is
    pending.
- Decision: gateway tool-payload tracing is diagnostic-only and env-gated.
  - Rationale: the trace hook records only payload shape, tool types/names,
    nested namespace tool names, model, stream flag, and message/input kinds so
    smoke can localize whether tools are absent before the gateway or dropped
    during forwarding without persisting prompts or secrets.
- Decision: Codex app-server runs scrub Locus-injected secret env entries from
  `CODEX_HOME/shell_snapshots` before app-server startup and after shutdown.
  - Rationale: provider-profile and app-managed app-server bindings must pass a
    selected secret through the Codex runtime env because Codex provider config
    consumes an env key. Codex may snapshot that shell env to disk. The adapter
    therefore removes lines containing `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN` or
    `CODEX_API_KEY` and redacts exact selected secret values from shell snapshot
    files at both lifecycle boundaries, without changing the already-proven
    provider binding protocol.

## Probe Shape
Minimal MCP tool:

```json
{
  "name": "locus_edit.propose_file_edit",
  "description": "Propose a file edit for Locus to validate, show as a diff, and apply only after user approval. Use this instead of shell commands in guarded runs.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "operation": { "type": "string", "enum": ["create", "replace", "patch"] },
      "content": { "type": "string" },
      "unified_diff": { "type": "string" }
    },
    "required": ["path", "operation"]
  }
}
```

Probe prompt rules:
- The primary probe prompt must be a natural editing request such as "create or
  update this file with this content."
- The primary probe prompt must not mention `locus_edit`, MCP, tool names,
  specific shell commands, or a specific patch/apply-patch format.
- Tool discovery signal must come from the MCP tool manifest and the runtime
  environment, not from a user prompt that names the tool.
- A secondary probe may add a light runtime/system hint such as "use available
  structured editing tools instead of shell writes", but still must not name
  `locus_edit`.
- A diagnostic-only probe may name the tool to prove surfacing, but that result
  does not count as adoption proven.

Adoption tiers:
- `zero-prompt`: the model calls `locus_edit.propose_file_edit` from a natural
  edit request without any tool-directed prompt language.
- `light-hint`: the model calls `locus_edit.propose_file_edit` after a generic
  structured-editing hint that does not name the tool.
- `explicit-tool-name-only`: the model calls `locus_edit.propose_file_edit` only
  when the prompt names the tool or prescribes the tool call.
- `no-adoption`: the model keeps trying shell writes, refuses to edit, or
  answers without a structured edit tool call.

Probe pass criteria:
- app-server starts with the `locus_edit` MCP server ready.
- guarded shell write routes are denied or unavailable.
- the model calls `locus_edit.propose_file_edit` for a canary file request.
- the captured tool arguments include an in-scope relative path and proposed
  content or diff.
- no filesystem write occurs during the probe.
- the result is classified as `zero-prompt` or `light-hint`.

Probe fail criteria:
- the model keeps trying shell writes and never calls `locus_edit`.
- app-server does not surface the MCP tool to the model.
- a specific provider path discovers a namespace/MCP tool but does not expose it
  as a callable function.
- the tool call is unstructured or missing path/operation data.
- the tool is called only after a prompt names `locus_edit` or prescribes the
  exact tool call.
- any secret or raw provider token appears in probe artifacts.

## Risks / Trade-offs
- Tool adoption may fail for the same reason `apply_patch` adoption failed.
  Mitigation: run the adoption probe before enabling an executor for each
  auth/provider path; unknown or unproven paths stay degraded.
- MCP tool descriptions may need prompt shaping.
  Mitigation: iterate tool description and guarded prompt only in probe
  artifacts before product changes.
- A new editor tool can become a parallel filesystem write path.
  Mitigation: filesystem writes must live in a main-process controlled edit
  owner and consume existing scope contract validation.

## Remaining Questions
- Should controlled edits become runtime-neutral after Codex app-server UI
  smoke proves the first executor, or remain Codex-specific until another
  runtime needs the same dynamic tool contract?
- Should unified patch payloads be added after the full replacement path has
  real UI evidence?
