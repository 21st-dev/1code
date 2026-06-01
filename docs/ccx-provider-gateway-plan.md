# Locus Provider Gateway Plan: CCX Track

This document records the future plan for learning from `ccx` without turning
Locus into an embedded CCX gateway or a second provider-control product.

## Purpose

Build better Locus-native provider routing, diagnostics, model mapping,
failover, usage visibility, and Codex Responses compatibility.

The goal is not to embed `ccx` wholesale. The goal is to learn from its API
gateway, protocol conversion, channel orchestration, and observability design,
then express the useful parts through Locus's existing provider profile,
main-process gateway, runtime capability, and local-first architecture.

## What CCX Is

`ccx` is a local AI API proxy and protocol translation gateway.

It exposes a single backend entrypoint for:

- Claude Messages: `/v1/messages`
- OpenAI Chat Completions: `/v1/chat/completions`
- Codex/OpenAI Responses: `/v1/responses`
- OpenAI Images: `/v1/images/...`
- Gemini: `/v1beta/models/...`
- Models API: `/v1/models`

It also provides:

- Web administration UI.
- Channel management.
- Multi-key management.
- Model routing and allowlists.
- Protocol conversion.
- Health checks.
- Failover and circuit recovery.
- Request logs and metrics.
- Codex CLI/App setup guidance.

## Why CCX Is Relevant

CCX is relevant to Locus because Locus already has provider profiles and a
main-process gateway, but future third-party and China-model support needs
better diagnostics, compatibility handling, and multi-provider reliability.

The useful ideas are:

- Treat Codex Responses as a first-class protocol, not just "OpenAI-ish" chat.
- Convert Responses to OpenAI Chat or Claude Messages when upstream providers
  do not support Responses natively.
- Normalize non-standard Chat roles and tool-call shapes for strict upstreams.
- Provide model aliasing, model mapping, and model allowlists.
- Track provider health separately by protocol/channel.
- Fail over between channels with clear reasons.
- Record redacted request lifecycle logs and latency/error metrics.
- Expose provider diagnostics in user language instead of generic runtime
  failures.
- Let an already-running CCX instance be used as a local provider profile.

## Hard Boundaries

- Do not embed the CCX backend as a required Locus service.
- Do not require a separate daemon or port for normal Locus provider routing.
- Do not introduce a second provider source of truth outside Locus SQLite.
- Do not store Locus provider tokens in CCX config by default.
- Do not let CCX Desktop write Locus-managed Claude or Codex config.
- Do not silently modify `~/.codex/config.toml`, `~/.codex/auth.json`, or
  Claude settings as part of normal Locus runs.
- Do not duplicate CCX's Web admin UI inside Locus.
- Do not copy CCX's Go backend into the Electron main process.
- Do not persist raw prompts, raw request bodies, provider tokens, or raw
  request headers in Locus provider logs.
- Any new gateway transform, failover policy, external config write,
  persistent request logging, or provider-secret flow must go through OpenSpec.

## Recommended Integration Shape

### External CCX Provider Profile

The safest first-class relationship is to treat a user-managed CCX instance as
one provider profile.

Example:

```text
name: Local CCX
protocol: openai-responses
baseUrl: http://localhost:3688/v1
authMode: bearer
token: <CCX PROXY_ACCESS_KEY>
targetRuntimes: codex
```

Rules:

- Locus stores only the CCX proxy access key in encrypted provider storage.
- Locus does not manage upstream CCX channel keys.
- Locus does not mutate CCX channel configuration.
- Locus diagnostics can test the CCX endpoint and report whether `/v1/models`
  and `/v1/responses` work.
- Locus should label this as "External local gateway" so users understand that
  upstream routing decisions live in CCX.

### Locus-Native Gateway Improvements

For built-in Locus provider profiles, learn from CCX but keep execution inside
the existing Locus gateway.

Candidate improvements:

- Responses to Chat conversion.
- Responses to Claude Messages conversion.
- Chat to Responses stream conversion.
- Tool-call compatibility normalization.
- Non-standard role normalization.
- Model alias and allowlist support.
- Provider health state.
- Failover state.
- Redacted request lifecycle logs.
- Usage and latency metrics.

## Roadmap

### Phase 0: Proposal and Scope Boundary

Create or update an OpenSpec before implementing gateway behavior.

Suggested change id:

```text
expand-provider-gateway-diagnostics
```

Deliverables:

- Define what Locus owns versus what an external CCX instance owns.
- Define protocol names and capability states for:
  - Anthropic Messages
  - OpenAI Chat
  - OpenAI Responses
  - Gemini
- Define secret boundaries for provider profile tokens and proxy tokens.
- Define redaction rules for logs and diagnostics.
- Explicitly state that embedding CCX is out of scope.

Completion test:

- `openspec validate expand-provider-gateway-diagnostics --strict --no-interactive`
  passes.

### Phase 1: External CCX Provider Profile

Priority: highest.

Allow users to add CCX as a local provider profile.

Features:

- Preset named `Local CCX`.
- Default base URL: `http://localhost:3688/v1`.
- Protocol: OpenAI Responses.
- Target runtime: Codex.
- Token label: `PROXY_ACCESS_KEY`.
- Endpoint test for `/v1/models`.
- Minimal Responses test for `/v1/responses`.
- Clear error states for:
  - CCX not running
  - wrong port
  - `401 Unauthorized`
  - missing Responses channel
  - model not found
  - upstream protocol mismatch

Minimum useful slice:

- Create provider profile from `Local CCX` preset.
- Store proxy key securely.
- Run Codex through the CCX provider profile.
- Do not write global Codex config.

### Phase 2: Provider Diagnostics

Build diagnostics inspired by CCX channel testing.

Suggested change id:

```text
add-provider-diagnostics
```

Checks:

- Endpoint reachable.
- Auth accepted.
- Model list available.
- Selected model exists or maps.
- Streaming works.
- Responses request works.
- Chat request works.
- Claude Messages request works where applicable.
- Tool calling works or is unsupported.
- Vision works or is unsupported.
- Codex ACP runtime can start with selected profile.

Status categories:

- `ok`
- `degraded`
- `unsupported`
- `auth_failed`
- `model_denied`
- `model_not_found`
- `endpoint_unreachable`
- `protocol_mismatch`
- `stream_failed`
- `tool_call_unsupported`
- `runtime_unavailable`
- `external_gateway_unavailable`

UI goal:

- Do not show a generic "provider failed" or "Codex failed" when the failure
  can be categorized.

### Phase 3: Model Mapping and Aliases

Add model mapping to Locus provider profiles.

Suggested change id:

```text
add-provider-model-mapping
```

Features:

- Requested model alias.
- Upstream model id.
- Runtime target: Codex, Claude, helper, or local.
- Match type: exact, prefix, contains, fallback.
- Optional allowlist.
- Optional context window metadata.
- Optional capabilities: tools, vision, reasoning, streaming.

Codex examples:

- `gpt-5` -> upstream primary coding model.
- `gpt-5-mini` -> upstream lightweight model.
- `gpt-5.3-codex` -> upstream coding model.
- `mini` -> upstream lightweight model when prefix/fallback mapping is
  acceptable.

Rules:

- Show mapping decisions in diagnostics.
- Never silently claim unsupported capabilities because a model name maps.
- Keep model mapping per profile, not global app state.

### Phase 4: Protocol Conversion Test Matrix

Build focused conversion tests before expanding gateway behavior.

Suggested change id:

```text
harden-provider-protocol-conversions
```

Test groups:

- Responses request to Chat request.
- Chat stream to Responses stream events.
- Responses request to Claude Messages request.
- Claude Messages stream to Responses-like normalized events if required.
- Gemini request/response conversion if Locus decides to support Gemini
  directly.
- Tool-call and tool-result conversion.
- Non-standard roles such as `developer`.
- Reasoning/thinking fields.
- Usage metadata.
- Image inputs.
- Error responses and provider-specific error mapping.

Completion tests:

- Focused unit tests for every conversion path marked supported.
- Redaction tests for errors and logs.
- Runtime smoke with at least one local or test provider profile.

### Phase 5: Failover and Circuit State

Add limited Locus-native fallback only after diagnostics and model mapping are
stable.

Suggested change id:

```text
add-provider-failover-policies
```

Features:

- Optional fallback profile per runtime purpose.
- Failover reasons:
  - endpoint unreachable
  - rate limited
  - transient upstream 5xx
  - stream connection failure before first token
  - model denied
- Circuit state:
  - healthy
  - degraded
  - temporarily blocked
  - manual disabled
- Manual reset/resume.
- Redacted event log.

Rules:

- Do not fail over across providers with different data policies unless the
  user opted in.
- Do not retry after a partial tool-affecting response unless the runtime can
  do so safely.
- Preserve clear attribution: the UI must show which provider actually served
  a run.

### Phase 6: Usage, Cost, and Reliability Observability

Build Locus-native provider observability inspired by CCX metrics.

Suggested change id:

```text
add-provider-usage-cost-observability
```

Metrics:

- Provider profile.
- Model.
- Runtime purpose.
- Chat/sub-chat.
- Future job id.
- Request count.
- Success/failure count.
- Latency.
- First-token latency where available.
- Input/output tokens where available.
- Reasoning/cache tokens where available.
- Estimated cost where pricing metadata exists.

Rules:

- Pricing is editable local metadata.
- Missing usage values are omitted, not reported as zero.
- Prompt and raw response bodies are not persisted by default.
- User can clear provider logs and metrics.

### Phase 7: Optional Advanced Gateway Surface

Only after the above phases are stable, consider a compact advanced provider
surface.

Features:

- Channel-like view for Locus profiles.
- Last test result.
- Last error category.
- Capability matrix.
- Manual disable/enable.
- Export redacted diagnostic bundle.

Avoid:

- Recreating CCX's full Web admin UI.
- Multi-key enterprise routing unless Locus has a clear user need.
- WebDAV/cloud sync of provider config.
- Hidden global provider takeover.

## Recommended Implementation Order

1. External CCX provider profile preset.
2. Provider diagnostics.
3. Model mapping and aliases.
4. Protocol conversion test matrix.
5. Failover and circuit state.
6. Usage, cost, and reliability observability.
7. Optional advanced gateway surface.

## First Real MVP

The first practical MVP should be small:

- Add `Local CCX` provider preset.
- Store `PROXY_ACCESS_KEY` in encrypted provider storage.
- Test `GET /v1/models`.
- Test a minimal `/v1/responses` request.
- Route Codex through the CCX provider profile.
- Show clear diagnostics for not running, unauthorized, wrong base URL, missing
  model, and protocol mismatch.
- Do not embed or start CCX.
- Do not modify global Codex config.

This proves CCX compatibility without taking ownership of CCX's service,
config, channels, upstream keys, or logs.

## CCX Learning Path

Repository:

```text
https://github.com/BenedictKing/ccx
```

Read order:

1. `README.md`
   - Understand the product surface: API gateway, Web admin, channel
     orchestration, failover, metrics, and supported protocols.
2. `docs/guide/architecture.md`
   - Study system boundaries, routing surface, channel kinds, scheduler,
     metrics, and extension points.
3. `docs/guide/clients/codex.md`
   - Study Codex CLI/App expectations, `/v1/responses`, base URL rules, model
     mapping, and common failure modes.
4. `backend-go/internal/converters/`
   - Study protocol conversion, especially Responses to Chat and Chat to
     Responses stream conversion.
5. `backend-go/internal/providers/`
   - Study upstream request construction and provider-specific response
     handling.
6. `backend-go/internal/scheduler/channel_scheduler.go`
   - Study priority, promotion, trace affinity, health, failover, and recovery.
7. `backend-go/internal/handlers/*/`
   - Study protocol-specific handlers and management routes.
8. `backend-go/internal/metrics/`
   - Study request logs, metrics, history, and circuit state.
9. `desktop/internal/configservice/service.go`
   - Study how CCX Desktop writes Claude/Codex/OpenCode configs.
   - Use as cautionary reference. Locus should avoid silent global config
     mutation for normal runs.
10. `desktop/internal/channelpreset/`
    - Study China-provider preset shapes and per-protocol defaults.

What to learn:

- Codex Responses compatibility details.
- Protocol conversion edge cases.
- Tool-call normalization.
- Non-standard role normalization.
- Multi-provider health and failover models.
- Model mapping and allowlists.
- Diagnostic language and common setup errors.
- Metrics and request lifecycle logging.

What not to copy directly:

- A separate Go gateway as a required dependency.
- A second config source of truth.
- A full Web admin surface inside Locus.
- Silent global Claude/Codex/OpenCode config writes.
- Raw request body logging.
- Multi-key relay management unless Locus has a clear product need.

## Local Code Areas To Study Before Each Slice

Provider profiles and gateway:

- `src/shared/provider-profile-types.ts`
- `src/main/lib/provider-profiles/storage.ts`
- `src/main/lib/provider-profiles/gateway.ts`
- `src/shared/provider-profile-transforms.ts`
- `src/shared/provider-profile-security.ts`

Codex runtime:

- `src/shared/codex-runtime-capabilities.ts`
- `src/shared/codex-runtime-status.ts`
- `src/main/lib/codex/`
- `src/main/lib/trpc/routers/codex.ts`

Usage and diagnostics:

- `openspec/specs/usage-panel/spec.md`
- Current chat/sub-chat persistence schema under `src/main/lib/db/schema/`
- Runtime stream and metadata normalization code under `src/shared/`

Settings UI:

- `src/renderer/components/dialogs/settings-tabs/`
- Provider/model selector surfaces under `src/renderer/features/agents/`

OpenSpec planning:

- `openspec/AGENTS.md`
- `openspec/project.md`
- Existing relevant specs and changes:
  - `openspec/changes/add-provider-profiles-and-gateways/`
  - `openspec/changes/upgrade-codex-runtime-parity/`
  - `openspec/specs/usage-panel/spec.md`

## Future Decision Checklist

Before implementing any CCX-inspired slice, answer:

- Does this create a second provider source of truth?
- Does it require a background service or port?
- Does it expose or duplicate provider secrets?
- Does it log prompts, responses, headers, or tokens?
- Does it mutate external runtime config?
- Does it claim a protocol conversion works without tests?
- Does it fail over across providers without user consent?
- Does it obscure which provider served a run?
- Does it degrade local-only behavior?
- Can it be validated with local tests and real desktop smoke evidence?

If yes to any high-risk item, create or update an OpenSpec change first.
