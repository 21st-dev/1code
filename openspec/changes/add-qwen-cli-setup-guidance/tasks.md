# Tasks: Qwen CLI setup guidance

> Approval gate: implement only after this proposal is reviewed. This change is
> stacked on `add-qwen-acp-spike`; do not start from plain `main` until the Qwen
> ACP spike has landed or this branch remains explicitly stacked.

## 0. Pre-flight
- [x] 0.1 Confirm branch ancestry: stacked on the Qwen ACP spike or rebased
      after that spike lands.
- [x] 0.2 Re-run `openspec validate add-qwen-cli-setup-guidance --strict
      --no-interactive` before implementation.
- [x] 0.3 Confirm intent: if the immediate goal is only Qwen live smoke, manually
      install Qwen CLI and run the existing smoke instead of implementing this
      product UX first.

## 1. Main-process Qwen CLI status owner
- [x] 1.1 Add a Qwen CLI status helper under `src/main/lib/qwen/` that resolves:
      explicit saved executable path first, then PATH-discovered `qwen`.
- [x] 1.2 Reuse/extend `src/main/lib/runtime-executable.ts` for existence,
      file, and executable checks.
- [x] 1.3 Require saved overrides to be absolute local file paths; reject
      relative paths, shell command strings, and paths that resolve to a
      directory or non-executable file.
- [x] 1.4 PATH auto-discovery must ignore active project/cwd, repository paths,
      empty PATH entries, and `.`; test that a repository-local `./qwen` is not
      selected.
- [x] 1.5 Probe `qwen --version` only after executable validation, with timeout,
      bounded output, and redaction.
- [x] 1.6 Return renderer-safe status: availability, resolved path when safe,
      version when available, blocker code, and remediation hint.
- [x] 1.7 Tests: missing CLI, invalid path, relative path, cwd shadowing,
      non-executable path, valid path, version probe failure, and redacted
      diagnostic output.

## 2. Persist executable path override
- [x] 2.1 Add main-process storage for an optional Qwen executable path override.
      Treat it as non-secret config, not credential storage.
- [x] 2.2 Accept updates only from the local Settings action; do not expose path
      override writes through Local Job API, ACP/protocol input, deep links,
      project config, imported files, or runtime request payloads.
- [x] 2.3 Validate path input before saving; invalid values fail with
      renderer-safe errors and do not change the active path.
- [x] 2.4 Provide reset-to-auto-detect behavior.
- [x] 2.5 Tests: save valid override, reject invalid override, reject non-Settings
      sources, reset override, and never persist env or token-like values.

## 3. Runtime route and adapter wiring
- [x] 3.1 Add `agentRuntime.getQwenCliStatus` and path update/reset mutations, or
      equivalently narrow Qwen setup endpoints in the runtime router.
- [x] 3.2 Ensure Qwen chat startup checks CLI status before creating/spawning the
      ACP adapter.
- [x] 3.3 Pass the resolved executable path to `createQwenAcpClientAdapter`.
- [x] 3.4 When unavailable, emit a `capability-error`/runtime-status blocker
      before provider/runtime work starts.
- [x] 3.5 Preserve direct spawn semantics: resolved executable as one path, fixed
      args `["--acp"]`, `shell: false`, no user-configurable args, and no command
      string parsing.
- [x] 3.6 Tests: flag-off route remains inert, missing CLI blocks startup before
      spawn, valid override is used by the adapter, and command-string injection
      attempts are rejected before spawn.

## 4. Renderer setup guidance
- [x] 4.1 Add a Qwen setup section in Settings > Models or the existing runtime
      availability surface. It should show status, version/path, install
      guidance, `/auth` guidance, and path override controls.
- [x] 4.2 In new-chat/provider selection, prevent Qwen from appearing as
      runnable when CLI status is missing/invalid; show a concise setup hint.
- [x] 4.3 Keep install guidance passive: copyable command and docs link only, no
      install button that executes shell commands.
- [x] 4.4 Add English and Simplified Chinese strings.
- [x] 4.5 Source-guard tests: no renderer shell execution, no `~/.qwen` writes,
      no plaintext secret fields, no project/deep-link/protocol path override
      writes, and Qwen controls stay flag-gated.

## 5. Validate
- [x] 5.1 `openspec validate add-qwen-cli-setup-guidance --strict
      --no-interactive`
- [x] 5.2 `bun run ts:check`
- [x] 5.3 Targeted tests for Qwen CLI status, agent runtime route, Settings UI
      source guards, and new-chat gating.
- [x] 5.4 If implementation proceeds to code, run `bun run check` before
      declaring the slice complete.
