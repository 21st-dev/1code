# Tasks: Qwen CLI setup guidance

> Approval gate: implement only after this proposal is reviewed. This change is
> stacked on `add-qwen-acp-spike`; do not start from plain `main` until the Qwen
> ACP spike has landed or this branch remains explicitly stacked.

## 0. Pre-flight
- [ ] 0.1 Confirm branch ancestry: stacked on the Qwen ACP spike or rebased
      after that spike lands.
- [ ] 0.2 Re-run `openspec validate add-qwen-cli-setup-guidance --strict
      --no-interactive` before implementation.

## 1. Main-process Qwen CLI status owner
- [ ] 1.1 Add a Qwen CLI status helper under `src/main/lib/qwen/` that resolves:
      explicit saved executable path first, then PATH-discovered `qwen`.
- [ ] 1.2 Reuse/extend `src/main/lib/runtime-executable.ts` for existence,
      file, and executable checks.
- [ ] 1.3 Probe `qwen --version` only after executable validation, with timeout,
      bounded output, and redaction.
- [ ] 1.4 Return renderer-safe status: availability, resolved path when safe,
      version when available, blocker code, and remediation hint.
- [ ] 1.5 Tests: missing CLI, invalid path, non-executable path, valid path,
      version probe failure, and redacted diagnostic output.

## 2. Persist executable path override
- [ ] 2.1 Add main-process storage for an optional Qwen executable path override.
      Treat it as non-secret config, not credential storage.
- [ ] 2.2 Validate path input before saving; invalid values fail with
      renderer-safe errors and do not change the active path.
- [ ] 2.3 Provide reset-to-auto-detect behavior.
- [ ] 2.4 Tests: save valid override, reject invalid override, reset override,
      and never persist env or token-like values.

## 3. Runtime route and adapter wiring
- [ ] 3.1 Add `agentRuntime.getQwenCliStatus` and path update/reset mutations, or
      equivalently narrow Qwen setup endpoints in the runtime router.
- [ ] 3.2 Ensure Qwen chat startup checks CLI status before creating/spawning the
      ACP adapter.
- [ ] 3.3 Pass the resolved executable path to `createQwenAcpClientAdapter`.
- [ ] 3.4 When unavailable, emit a `capability-error`/runtime-status blocker
      before provider/runtime work starts.
- [ ] 3.5 Tests: flag-off route remains inert, missing CLI blocks startup before
      spawn, valid override is used by the adapter.

## 4. Renderer setup guidance
- [ ] 4.1 Add a Qwen setup section in Settings > Models or the existing runtime
      availability surface. It should show status, version/path, install
      guidance, `/auth` guidance, and path override controls.
- [ ] 4.2 In new-chat/provider selection, prevent Qwen from appearing as
      runnable when CLI status is missing/invalid; show a concise setup hint.
- [ ] 4.3 Keep install guidance passive: copyable command and docs link only, no
      install button that executes shell commands.
- [ ] 4.4 Add English and Simplified Chinese strings.
- [ ] 4.5 Source-guard tests: no renderer shell execution, no `~/.qwen` writes,
      no plaintext secret fields, and Qwen controls stay flag-gated.

## 5. Validate
- [ ] 5.1 `openspec validate add-qwen-cli-setup-guidance --strict
      --no-interactive`
- [ ] 5.2 `bun run ts:check`
- [ ] 5.3 Targeted tests for Qwen CLI status, agent runtime route, Settings UI
      source guards, and new-chat gating.
- [ ] 5.4 If implementation proceeds to code, run `bun run check` before
      declaring the slice complete.
