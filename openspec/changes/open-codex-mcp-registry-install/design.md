## Context

Today `installability.ts` returns `codex-deferred` / `installableConfig:false`
for every Codex target, and `install.ts` throws `"Codex MCP registry install is
deferred."`. This conflates two separate facts:

1. Whether Locus can materialize the entry's config for Codex app-server.
2. Whether Locus can observe a post-execution tool-result to prove the server
   works.

Fact (2) is genuinely blocked (Phase 1 probe). Fact (1) is often true: the
isolated `CODEX_HOME` materialization fix already loads and calls materialized
MCP servers in real Codex app-server runs. Blocking install on (2) when (1)
holds hides working functionality and makes the registry look Claude-only.

## Goals / Non-Goals

Goals:
- Let Codex install registry MCP servers whose config can be safely materialized.
- Give Codex an honest middle status from the signals Locus *can* observe
  (readiness, tool inventory): connected with tools visible.
- Keep `Verified on Codex` unreachable until the post-execution signal exists.
- Block non-materializable Codex targets with a concrete reason.

Non-Goals:
- Do not build the post-execution tool-result verification observer (blocked;
  stays in `add-codex-app-server-mcp-tool-observability`).
- Do not change Claude verification semantics.
- Do not call MCP tools during browse, preview, install, or the default Check.
- Do not silently write Codex config that cannot be materialized.

## Decisions

### Split materialization from verification
Add `codexCanMaterialize(target)` mirroring `claudeCanMaterialize`, covering env,
env-var refs, headers, env-header refs, bearer-token env, cwd, transport, and
enabled state. Codex installability is decided by materialization + setup
resolution, not by the (blocked) verification signal.

### Honest connected tier, capped below verified
Codex servers can reach a `connected` state (server ready + tools listed, both
observable) after a connect/list Check or a real run. This is strictly below
`verified-local` and never auto-upgrades to it, because the post-execution
tool-result signal does not exist. The UI shows the reason ("Codex cannot
auto-verify tool execution"), not a green verified badge.

### Block non-materializable targets with a reason
When Codex cannot represent required fields, or required Codex runtime auth/setup
cannot be resolved, install stays blocked and the chip shows the concrete reason
(e.g. "needs Codex runtime auth") rather than a generic `codex deferred`.

### Codex runtime auth must be resolved from real state, in main
The setup classifier sets `runtimeAuthRequired = input.runtime === "codex"` for
every Codex target (`setup.ts`), and preview/installability run with no resolved
auth (`service.ts`, `preview.ts` default to entry-only). So today every Codex
target reads as `runtime-auth:codex` missing and nothing would open. This change
must compute `runtimeAuthenticated` in the **main process** from real Codex
integration/login state and inject it into the setup classification and
installability inputs. A renderer-reported auth flag is not trusted. A Codex
target opens only when materializable *and* runtime auth resolves true.

### Codex registry identity needs a defined home
Claude install records `_locusMcpRegistry` (provider/entry/target id + entry and
config fingerprints) in the written config (`install.ts`). `addCodexMcpServer`
takes only name/transport/command/args/url and cannot carry that metadata, and it
does not cover headers/env/cwd/disabled. This change must decide and implement one
of:
- extend the Codex config writer to carry the registry identity and the missing
  fields, or
- keep a separate Locus-side registry-install local state keyed by
  runtime + server name + entry fingerprint + config fingerprint.

Connected/check status binds to that identity, never to a bare server-name guess.
Fields the Codex writer cannot represent make the target non-materializable
(blocked with a reason), not silently dropped.

### Connect/list Check stays inert — remote transports only in v1
The Codex Check connects and lists tools only. It must not call MCP tools. But for
stdio/package servers, *listing tools launches the server process* — Codex refresh
already skips stdio probes ("can launch GUI/permission flows", `codex.ts`). So the
v1 connected check is limited to setup-free remote HTTP/SSE/streamable_http
targets. stdio/package connected checks stay out until a separate, explicitly
confirmed path defines safe launch semantics. stdio/package Codex installs may
still be offered (if materializable) but remain `Installed / Unverified` with no
connected check in v1.

## Spec boundary with the observability change
This change modifies only `Claude Required Target And Codex Honest Fallback`.
`add-codex-app-server-mcp-tool-observability` modifies `Runtime Proof Gates` and
`Local Runtime Verification`; the no-`Verified on Codex` rule continues to live
there. The two changes have non-overlapping deltas.

## Risks / Trade-offs
- **Connected can be mistaken for verified.** Mitigation: distinct visual state +
  explicit "cannot auto-verify on Codex" reason; no green check.
- **A materializable server could still fail at runtime.** Mitigation: connected
  reflects readiness + tool list only, and the server stays `Installed /
  Unverified` until a check/run observes it; failure surfaces as a failed check.
- **Field-materialization gaps.** Mitigation: non-materializable targets stay
  blocked with a concrete reason; no silent unusable writes.

## Verification
- Unit: `codexCanMaterialize` accepts materializable targets and rejects
  unsupported-field / unresolved-Codex-auth targets.
- Unit: installability offers Codex install only for materializable targets and
  blocks others with concrete reasons.
- Unit: Codex never reaches `verified-local` from connect/list signals.
- Unit: browse/preview/install/Check never call MCP tools.
- Smoke: install a materializable registry MCP server to Codex, run a connect/list
  check, confirm `connected` (tools visible) and not `Verified on Codex`.
