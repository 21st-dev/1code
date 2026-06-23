# Tasks: Qwen Code ACP spike

> Approval gate: do not start until this proposal is approved AND the working tree
> is clean (the in-flight `refactor-first-run-onboarding` work must be landed or
> stashed first - start the spike on a fresh `codex/add-qwen-acp-spike` branch
> off `main`).

## 0. Pre-flight
- [x] 0.1 Land/stash `refactor-first-run-onboarding`; branch
      `codex/add-qwen-acp-spike` off clean `main`.
- [ ] 0.2 Install/discover `qwen` CLI (`npm i -g @qwen-code/qwen-code`);
      confirm `qwen --acp` launches; record reference version.
- [x] 0.3 Define smoke isolation before auth: use isolated HOME/Qwen config and
      isolated Locus userData, or perform read-only BYO status checks only. Do
      not write the user's real `~/.qwen/settings.json` without explicit
      approval.
- [ ] 0.4 Stand up headless-friendly auth (API key / Alibaba Cloud Coding Plan)
      inside the isolated config path; confirm a non-interactive session; do NOT
      use OAuth free tier.

## 1. Feature flag and static runtime contract split
- [x] 1.1 Add a shared `qwen-code` runtime feature flag (off by default)
- [x] 1.2 Add a narrower non-desktop contract runtime constant, e.g.
      `CONTRACT_RUNTIME_IDS = ["claude-code", "codex"]`.
- [x] 1.3 Move non-desktop contract consumers from `AGENT_RUNTIME_IDS` to
      `CONTRACT_RUNTIME_IDS`: Local Job API (`local-job-api.ts`), headless CLI
      parsing, schedules, headless job store, and `locus acp`.
- [x] 1.4 Add one focused guard test proving `CONTRACT_RUNTIME_IDS` excludes
      `qwen-code` and the public non-desktop schema/parser surfaces do not accept
      Qwen in this spike.
- [x] 1.5 Thread the Qwen flag only through desktop spike surfaces: manifest
      exposure, desktop route admission, adapter factory admission,
      permission-policy resolution, chat provider selection, and renderer option.

## 2. Open the three two-runtime gates (flag-driven)
- [x] 2.1 Add `"qwen-code"` to the known runtime ID owner and alias `"qwen"`
      only after the static contract split is in place.
- [x] 2.2 Extend `DesktopRuntimeAdapterSource` with `"qwen-acp-client"`
      (`src/main/lib/agent-runtime/desktop-runner.ts:9`).
- [x] 2.3 Replace the hard allowlist at `desktop-runner.ts:97` with a desktop
      Qwen-flag-aware admit check; keep default builds rejecting `qwen-code`.
- [x] 2.4 Extend `DesktopPermissionRuntime` to include `"qwen-code"` only through
      desktop Qwen flag-aware policy resolution
      (`src/main/lib/agent-runtime/permission-policy.ts:9`).
- [x] 2.5 Unit tests: with flag off, desktop factory and permission layer reject
      `qwen-code`; with flag on, desktop-only Qwen admission works.

## 3. Desktop chat entry
- [x] 3.1 Add a narrow runtime-neutral desktop chat subscription route, such as
      `agentRuntime.chat.subscribe`, for the Qwen spike.
- [x] 3.2 Keep the route envelope-only: validate input, check enabled runtime,
      then delegate to desktop preflight, provider binding, permission policy,
      adapter execution, event normalization, and redaction owners.
- [x] 3.3 Do not migrate Claude or Codex desktop chat in this slice; existing
      `claude.chat` and `codex.chat` subscriptions remain unchanged.
- [x] 3.4 Add focused route tests for envelope validation, flag-off rejection, and
      delegation to the runtime owners. Do not add a broad architecture guard
      until a second consumer uses the route.

## 4. Local ACP client transport (main)
- [x] 4.1 New local ACP client transport module in
      `src/main/lib/qwen/qwen-acp-client.ts` that can launch a configured
      command/args pair and speak ACP over stdio.
- [x] 4.2 Configure Qwen with `command: "qwen"`, `args: ["--acp"]`; do not use
      `qwen serve`, HTTP `/acp`, or remote HTTP+SSE in this change.
- [x] 4.3 Lifecycle: spawn, initialize/ready, graceful shutdown, crash/exit
      handling, stderr redaction.
- [x] 4.4 Cancellation: Locus cancel -> ACP cancel -> terminate without orphaned
      process.
- [x] 4.5 Review check: the generic stdio transport imports nothing Qwen-specific
      (Qwen specifics live in `src/main/lib/qwen/qwen-acp-client.ts` or an
      equivalently named client module).

## 5. ACP event mapper + Qwen adapter
- [x] 5.1 New `src/main/lib/qwen/` adapter mirroring
      `createCodexAppServerAdapter`
      (`src/main/lib/codex/app-server-adapter.ts:326`), returning a
      `DesktopRuntimeAdapter`.
- [x] 5.2 Map ACP session/stream/tool/permission events to Locus run events +
      `DesktopRunResult`.
- [x] 5.3 Map ACP errors to Locus error events; unknown ACP events produce a
      single "unsupported event" diagnostic (never crash).
- [x] 5.4 Pass project MCP config through to Qwen; document live acceptance as
      unverified/degraded in `spike-findings.md`.
- [x] 5.5 Register the adapter with the factory under
      `qwen-code:qwen-acp-client`

## 6. Conservative permission tier
- [x] 6.1 Add `QwenPermissionMapping` modeled on
      `CodexAppServerPermissionMapping` (`permission-policy.ts:50`): approval
      gate required, fail-closed when hook unavailable.
- [x] 6.2 Route Qwen permission requests through fail-closed Locus trace
      handling for this spike; unmapped server requests fail closed.
- [x] 6.3 Test: a denied permission request fails closed and is traced.
- [x] 6.4 Test: missing/delayed Qwen approval hook fails closed before side
      effects execute.

## 7. Honest capability manifest
- [x] 7.1 Author a `qwen-code` manifest - only wired capabilities `supported`;
      everything else `degraded`/`unsupported` with honest reasons.
- [x] 7.2 Ensure renderer capability gates read the manifest (no new hardcoded
      Qwen branches beyond edge transport routing).
- [x] 7.3 Ensure manifest, diagnostics, and smoke notes contain no API keys,
      OAuth tokens, raw headers, or secret-bearing env values.

## 8. Minimal renderer and chat metadata touches
- [x] 8.1 Add Qwen to shared provider/runtime metadata
      (`src/shared/agent-chat-provider.ts`) and chat create validation
      (`src/main/lib/trpc/routers/chats-crud.ts`) behind the Qwen desktop
      feature flag.
- [x] 8.2 Add a thin runtime-neutral desktop chat transport for Qwen that calls
      the new `agentRuntime.chat.subscribe` route.
- [x] 8.3 Add a flag-gated runtime/provider option in `new-chat-form.tsx`.
- [x] 8.4 Wire Qwen question/approval state through the existing
      `runtime-event-state.ts` owner; do not add renderer-local Qwen approval
      business logic.
- [x] 8.5 Explicitly NOT touching the broad hardcoded Claude/Codex renderer
      feature branches beyond Qwen's edge selection (defer to the follow-up
      manifest iteration work).

## 9. Spike acceptance (the "did the seams hold" checklist)
- [ ] 9.1 Launch + stream: a Qwen chat starts and streams assistant output.
- [ ] 9.2 File edit: a Qwen file edit renders and applies in an isolated
      worktree only after Locus permission handling allows it.
- [ ] 9.3 Permission request: an approval prompt surfaces and is honored/denied.
- [ ] 9.4 Cancel: mid-run cancel cleanly stops the process.
- [ ] 9.5 Error mapping: a forced failure maps to a Locus error, not a
      hang/crash.
- [x] 9.6 MCP config passthrough verified or explicitly documented as degraded.
- [x] 9.7 Flag-off smoke/static guard: default desktop remains Claude Code +
      Codex only, and non-desktop contract surfaces remain statically Claude
      Code + Codex only.
- [x] 9.8 Write spike findings: what generalized cleanly, what the follow-up
      renderer manifest work must refactor, and whether a later `qwen serve`
      HTTP `/acp` transport is worth proposing.

## 10. Validate
- [x] 10.1 `openspec validate add-qwen-acp-spike --strict --no-interactive`
- [x] 10.2 Typecheck + targeted tests green; flag-off smoke shows unchanged
      two-runtime behavior.
