# Tasks: Kun BYO local HTTP/SSE runtime

> Approval gate: do not start until this proposal is approved AND the working tree
> is clean. Branch off a clean `main` (note: local `main` is ahead of origin —
> rebase/verify before branching). Keep the Kun flag OFF until acceptance passes.

## 0. Pre-flight

- [ ] 0.1 Branch `add-kun-http-sse-runtime` off clean `main`.
- [ ] 0.2 Discover/build the BYO `kun` binary; confirm `kun serve` emits a
      `KUN_READY {json}` handshake; record the reference `kun` version/commit.
- [ ] 0.3 Capture the reference `KUN_READY`, REST, `RuntimeEvent`, and turn-item
      shapes (`approval_requested`, `tool_call` `toolKind`) for the mapper;
      verify and record the v1 invariant
      `approval_requested.approvalId === appr_${tool_call.callId}`; record the
      per-tool approval `policy` for every `command_execution`/`file_change` tool
      (input for the 4.4 approval-exemption check).
- [ ] 0.4 Define smoke isolation: isolated `dataDir` under Locus userData and an
      isolated provider config; never mutate the user's real Kun state.
- [ ] 0.5 Provider-profile preflight: prove Kun can call the Locus profile-scoped
      `responses` gateway with `baseUrl=<gatewayEndpoint>`,
      `apiKey=<scoped gateway token>`, and `endpointFormat=responses`; if not
      proven, keep `providerProfiles` `degraded`.

## 1. Feature flag and experimental runtime id

- [ ] 1.1 Add `LOCUS_ENABLE_KUN_RUNTIME` shared flag (off by default) +
      `shouldEnableKunRuntime(env)` helper.
- [ ] 1.2 Add `"kun"` to `EXPERIMENTAL_RUNTIME_IDS` (NOT `CONTRACT_RUNTIME_IDS`);
      add the `kun` alias + `toAgentRuntimeId` resolution.
- [ ] 1.3 Guard test: `CONTRACT_RUNTIME_IDS` excludes `kun` and non-desktop
      schemas/parsers (Local Job API, headless CLI, schedules, job store,
      `locus acp`) reject `kun`.

## 2. Generalize the experimental desktop chat route (rule-of-three)

- [ ] 2.1 Replace the Qwen-literal `agentRuntime.chat` input
      (`z.literal("qwen-code")`) with a runtime-id-dispatch envelope accepting any
      enabled experimental runtime.
- [ ] 2.2 Re-key `activeQwenStreams` / `pendingQwenToolApprovals` into per-runtime,
      per-subchat state (or move into the adapter layer); replace
      `shouldEnableQwenCodeRuntime` checks with per-runtime enablement.
- [ ] 2.3 Keep the route envelope-only: it selects the adapter by `runtimeId` and
      delegates preflight / permission policy / provider binding / adapter
      execution / event normalization / redaction to canonical owners.
- [ ] 2.4 Regression gate: Qwen streaming, cancel, permission, and error behavior
      unchanged; existing Qwen route tests pass against the dispatch route.
- [ ] 2.5 Route tests: disabled-runtime rejection, per-runtime state isolation
      (cancel/approve one run does not affect another).

## 3. Open desktop gates for Kun

- [ ] 3.1 Extend `DesktopRuntimeAdapterSource` with `"kun-http-sse"`; add
      `KUN_HTTP_SSE_DESKTOP_ADAPTER_METADATA`.
- [ ] 3.2 Extend the factory admit check to accept `kun` only when the flag is on;
      register `kun:kun-http-sse`.
- [ ] 3.3 Extend `DesktopPermissionRuntime` to include `"kun"` via flag-aware
      policy resolution.
- [ ] 3.4 Unit tests: flag off ⇒ factory + permission layer reject `kun`; flag on
      ⇒ desktop-only Kun admission works.

## 4. Supervised `kun serve` lifecycle and hardened launch

- [ ] 4.1 New `src/main/lib/kun/` serve launcher: spawn `kun serve` with
      `shell:false`, loopback host, random port, random per-run `runtimeToken`,
      isolated `dataDir`; pass `runtimeToken` through `KUN_RUNTIME_TOKEN` env or
      a restricted config file, never CLI argv.
- [ ] 4.2 Pass hardened flags: `--approval-policy on-request` only (reject `auto`,
      `never`, `suggest`, `untrusted` — `untrusted`'s allow-list is not
      `kun serve`-controllable), a conservative `--sandbox-mode` `workspace-write`
      (do NOT use `read-only` for plan mode — it blocks Kun's `create_plan` write
      via `sandbox-policy.ts canWritePath`; Kun v1 `planMode` is degraded rather
      than supported through `create_plan`), never `danger-full-access`/
      `external-sandbox`, `insecure=false`.
- [ ] 4.3 Parse the `KUN_READY` handshake; **verify echoed host is loopback,
      `insecure===false`, approval policy is `on-request`, sandbox mode is
      `workspace-write` — fail closed (no turn) on any drift.**
- [ ] 4.4 Verify v1 side-effect behavior for the pinned Kun version: enumerate
      `file_change` and `command_execution` tools from the reference tool
      definitions captured in 0.3 (`/v1/runtime/tools` does NOT expose per-tool
      `policy`). Assert via smoke that supported `file_change` tools emit
      `approval_requested`; assert shell/`command_execution` is not advertised as
      supported or is sandbox-blocked under `workspace-write` before approval.
      Fail closed + diagnostic if any supported `file_change` skips approval, or
      if shell is treated as approval-mediated. Do not treat `create_plan` as a
      supported exception in v1; `planMode` remains degraded.
- [ ] 4.5 Supervision: if Kun exits unexpectedly during an active turn, resolve
      the current Locus run as failed/canceled (no restart-and-continue claim);
      bounded retry/backoff may start a fresh daemon only for later runs; SIGTERM
      graceful close; no orphan on cancel.

## 5. HTTP/SSE transport, event mapper, adapter

- [ ] 5.1 REST client (bearer `runtimeToken` on all `/v1`): create thread, start
      turn (`/v1/threads/{id}/turns`), interrupt (`/turns/{id}/interrupt`).
- [ ] 5.2 SSE consumer for `/v1/threads/{id}/events`; map Kun `RuntimeEvent`s to
      Locus run events + `DesktopRunResult`; unknown kinds → single
      "unsupported event" diagnostic (never crash).
- [ ] 5.3 New `kun` adapter returning a `DesktopRuntimeAdapter` (mirror
      `createCodexAppServerAdapter`); transport stays inside `src/main/lib/kun/`.
- [ ] 5.4 Register the adapter under `kun:kun-http-sse`; MCP/project config
      passthrough recorded as supported or `degraded`.

## 6. Conservative fail-closed permission mapping

- [ ] 6.1 `KunPermissionMapping` (model on `CodexAppServerPermissionMapping`):
      correlate `approval_requested` → `tool_call` item by the pinned
      `approvalId === appr_${callId}` invariant plus matching `toolName`,
      classify approval-mediated events from `toolKind` (`file_change`/`tool_call`;
      `command_execution` is v1 sandbox-blocked/degraded, not approval-mediated);
      missing, ambiguous, or invariant-drifted mappings fail closed.
- [ ] 6.2 Route the decision through Locus guard + trace, then `POST
      /v1/approvals/{id}`; unmapped/unbridged/timeout/missing-item ⇒ deny + trace.
- [ ] 6.3 Plan mode: mark Kun `planMode` degraded in v1. Do not launch supported
      Kun plan/GUI-plan turns or rely on approval-deny for `create_plan`
      (`policy:auto`, emits no approval); defer plan artifact ownership to a later
      change.
- [ ] 6.4 Tests: denied side effect posts deny + records blocker + no mutation;
      missing guard bridge fails closed before side effects.

## 7. BYO Kun executable resolution

- [ ] 7.1 `kun` CLI status owner (mirror `qwen/qwen-cli-status.ts`): persisted
      absolute-path override (`0o600`), PATH discovery excluding cwd/repo dirs,
      `execFile --version` with `shell:false` + timeout + redaction.
- [ ] 7.2 Spawn-block + passive Settings guidance when Kun is missing; never
      bundle/auto-download.
- [ ] 7.3 Security tests: override never sourced from Local Job API/ACP/deep-link/
      project; `./kun` cannot shadow; no shell.

## 8. Token separation and secret hygiene

- [ ] 8.1 Ensure `runtimeToken`, upstream provider API keys, and provider gateway
      tokens never enter CLI argv or renderer; Kun receives `runtimeToken` via
      `KUN_RUNTIME_TOKEN` env or restricted config and reads provider creds from
      isolated config / Locus profile-scoped `responses` gateway.
- [ ] 8.2 Redact `runtimeToken`, provider keys, gateway tokens, and raw headers
      from stderr, traces, manifest, diagnostics, and renderer-safe metadata.
- [ ] 8.3 Tests assert spawn argv contains no `runtimeToken`, provider API key,
      provider gateway token, raw authorization header, or bearer token.

## 9. Honest manifest and renderer edge

- [ ] 9.1 Author the `kun` manifest — only wired capabilities `supported`, rest
      `degraded`/`unsupported` with honest reasons; declares every capability id;
      `providerProfiles` is `supported` only if the `responses` gateway
      preflight/acceptance proof lands, otherwise `degraded`; `planMode` is
      `degraded` in v1 because native Kun `create_plan` is approval-bypassing and
      Locus plan artifact ownership is deferred; shell/command execution is
      `degraded`/`unsupported` because `workspace-write` sandbox blocks
      `command_execution` before approval.
- [ ] 9.2 Add Kun to shared provider/runtime metadata + chat create validation
      (flag-gated); add a flag-gated Kun option in `new-chat-form.tsx`.
- [ ] 9.3 Route Kun through the shared experimental desktop chat transport; wire
      Kun approval/question responses through `runtime-event-state.ts` (no
      renderer-local approval business logic).
- [ ] 9.4 No new hardcoded Kun branches in renderer capability logic beyond edge
      selection.

## 10. Acceptance (the "did the seams hold" checklist)

- [ ] 10.1 Launch + stream: a Kun chat starts and streams assistant output.
- [ ] 10.2 File edit: applies in an isolated worktree only after Locus permission
      handling allows it.
- [ ] 10.3 Permission: a file-change approval surfaces, is classified from
      `toolKind`, and is honored/denied; deny leaves the file unchanged.
- [ ] 10.4 Shell smoke: a shell/`command_execution` attempt is not advertised as
      supported or is sandbox-blocked under `workspace-write`; no Locus approval is
      expected for shell in v1.
- [ ] 10.5 Cancel: mid-run cancel stops the turn and leaves no Kun process.
- [ ] 10.6 Error mapping: a forced failure, unexpected child exit, and
      hardened-flag drift map to a Locus error/canceled run, not a hang/crash or
      restart-and-continue claim.
- [ ] 10.7 Flag-off smoke/static guard: Kun does not appear when its flag is off;
      existing Claude, Codex, and Qwen flag behavior is unchanged; non-desktop
      stays Claude + Codex.
- [ ] 10.8 Provider-profile smoke: selected Locus provider profile → scoped
      `responses` gateway → Kun `endpointFormat=responses` → streamed answer,
      with upstream key absent from argv/renderer/logs; if not proven, document
      `providerProfiles=degraded`.
- [ ] 10.9 Write findings: what generalized cleanly, Kun parity gaps left
      `degraded`, and whether bundling/managed-download is worth a later change.

## 11. Validate

- [ ] 11.1 `openspec validate add-kun-http-sse-runtime --strict --no-interactive`.
- [ ] 11.2 `bun run check` green (lint + architecture guard + ts:check + test);
      flag-off behavior unchanged.
