## 1. Pre-flight scope guards (do these before deleting anything)

- [x] 1.1 Confirm the keep/delete boundary in code: `acp-permission.ts`,
  `acp-spawn-probe.ts` (`stripCodexAnsi`), renderer `acp-chat-transport.ts`
  (`ACPChatTransport`), and shared `acp-tool-normalizer.ts` are imported by the
  app-server path and/or persisted-history hydration — these are **retained**.
- [x] 1.2 Confirm the `locus acp` stdio server (`headless/acp-stdio.ts`,
  `cli-dispatcher`, `cli-args`) is the `agent-protocol-interfaces` capability and
  is **out of scope** — no edits, no deletion.
- [x] 1.3 Resolve the conditional dependency: determine whether `acpTools` from
  `@mcpc-tech/acp-ai-provider` (imported by the shared `ask-user-question.ts`)
  can be removed/replaced. If not, the npm dep **stays** and tasks 6.2 is skipped.

## 2. Delete ACP-only runtime modules

- [x] 2.1 Delete `src/main/lib/codex/acp-temporary-compat-adapter.ts`.
- [x] 2.2 Delete `src/main/lib/codex/acp-adapter.ts` (provider lifecycle).
- [x] 2.3 Delete `src/main/lib/codex/acp-runtime.ts`.
- [x] 2.4 Delete `src/main/lib/codex/acp-text-stream.ts`.
- [x] 2.5 Delete `src/main/lib/codex/acp-ui-stream.ts`.
- [x] 2.6 Delete `src/main/lib/codex/acp-message-persistence.ts`.
- [x] 2.7 Delete `src/main/lib/codex/acp-path.ts`.
- [x] 2.8 Delete dedicated tests: `tests/codex-acp-adapter.test.ts`,
  `codex-acp-runtime.test.ts`, `codex-acp-text-stream.test.ts`,
  `codex-acp-message-persistence.test.ts`, `codex-acp-path.test.ts`.
- [x] 2.9 Do **not** delete `tests/codex-acp-permission.test.ts` or
  `tests/codex-acp-spawn-probe.test.ts` — they cover retained shared code.

## 3. Rewire adapter selection and the router

- [x] 3.1 Simplify `desktop-adapter-selection.ts` to always resolve
  `codex-app-server`; remove `LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT` and legacy
  `LOCUS_CODEX_APP_SERVER_ADAPTER` env handling and the `acpFallbackAvailable`
  surface. Update `tests/codex-desktop-adapter-selection.test.ts`.
- [x] 3.2 Remove `codex-acp-temporary-compat` from the `CodexDesktopAdapterSource`
  union in `adapter-types.ts` and the `DesktopRuntimeAdapterSource` union in
  `agent-runtime/desktop-runner.ts`.
- [x] 3.3 In `trpc/routers/codex.ts`, delete the
  `createCodexAcpTemporaryCompatAdapter` branch (keep only the app-server path)
  and remove the now-dead `cleanupCodexAcpProvider` /
  `cleanupAllCodexAcpProviders` imports and call sites.
- [x] 3.4 In `agent-runtime/permission-policy.ts`, remove the
  `CodexAcpPermissionMapping` / `acpMode` type branch and the
  `acp-temporary-compat` `codexAdapterSource` path; keep the app-server mapping.
  Update `tests/agent-runtime-permission-policy.test.ts`.
- [x] 3.5 Remove `CODEX_ACP_TEMPORARY_COMPAT_*` metadata + removal-condition
  constants from `agent-runtime/desktop-adapter-metadata.ts`.
- [x] 3.6 Update non-dedicated architecture/string tests that assert the removed
  ACP temporary path, including `tests/codex-prompt.test.ts`,
  `tests/long-text-send-pipeline.test.ts`,
  `tests/provider-credential-storage.test.ts`,
  `tests/desktop-runtime-adapter-factory.test.ts`, and
  `tests/runtime-control-smoke-job-inspector.test.ts`.

## 4. Capability manifest and runtime status (preserve the existing truth matrix)

- [x] 4.1 Remove `CODEX_ACP_CAPABILITY_OVERRIDES` and the
  `adapterSource === "codex-acp-temporary-compat"` branch from
  `src/shared/codex-runtime-capabilities.ts`.
- [x] 4.2 Rewrite reason/hint strings in `codex-runtime-capabilities.ts` and
  `src/shared/agent-runtime-capabilities.ts` so they no longer cite ACP-specific
  primitives. Keep evidence pins to the retained `acp-permission.ts`.
- [x] 4.3 ACCEPTANCE: assert the app-server manifest keeps its current state
  matrix: `hardToolGuard` remains `degraded` for unknown provider-auth context
  and `supported` for proven `runtime-managed`, `app-managed`, and
  `provider-profile` contexts; `scopeExpansion`, `mcpAuth`, and
  `mcpConfiguration` remain `degraded`; `rollback` remains `unsupported`.
  Removing ACP must not upgrade or downgrade these states. Update
  `tests/codex-runtime-capabilities.test.ts`.
- [x] 4.4 Remove the ACP binary/spawn-probe reporting block from
  `src/main/lib/codex/runtime-status.ts` (the `resolveCodexAcpBinaryPath` /
  `probeCodexAcpSpawn` section). Update `tests/codex-runtime-status.test.ts`.
- [x] 4.5 Update `src/shared/codex-runtime-status.ts` so the public component
  IDs/builders no longer expose stale `acp-runtime` / `acp-spawn` components or
  require ACP runtime input. Keep retained ANSI-stripping helpers in
  `acp-spawn-probe.ts` available to login/CLI paths.

## 5. Specs and ownership documentation

- [x] 5.1 Apply the spec deltas in this change (`codex-runtime-parity`,
  `agent-runtime-capabilities`, `provider-runtime-bindings`, `agent-runtime-core`,
  `architecture-ownership`).
- [x] 5.2 Update `docs/OWNERSHIP_MAP.md` "Codex Desktop Chat Runtime": set the
  canonical owner to the app-server adapter
  (`src/main/lib/codex/app-server-adapter.ts`, selection via
  `desktop-adapter-selection.ts`), remove the "Current ACP provider/session
  owner: acp-adapter.ts" line, and delete the dangling pointer to the
  non-existent `refactor-codex-official-runtime-adapter` change.
- [x] 5.3 ACCEPTANCE: confirm `architecture-ownership`'s "Persisted messages are
  hydrated" scenario (which mandates ACP tool-shape normalization remain tested)
  is **unchanged** and that `acp-tool-normalizer.ts` + its tests still exist.

## 6. Dependencies and packaging

- [x] 6.1 Remove `@zed-industries/codex-acp` and `@zed-industries/codex-acp-*`
  from `package.json` and the electron-builder `asarUnpack`/`files` entries.
- [x] 6.2 CONDITIONAL (only if 1.3 passed): remove `@mcpc-tech/acp-ai-provider`
  and its remaining `acpTools` usage.
- Skipped: 1.3 found `@mcpc-tech/acp-ai-provider` is still required by
  `ask-user-question.ts`.
- [x] 6.3 Confirm `codex:download` / release scripts and bundling no longer
  reference the ACP binary.

## 7. Verification

- Local note: verified with `/opt/homebrew/bin/bun` and
  `/opt/homebrew/bin/openspec` in this shell.
- [x] 7.1 `bun run ts:check` is clean (no dangling ACP imports/types).
- [x] 7.2 `bun run test` passes; deleted ACP tests are gone and retained
  shared-code tests still pass.
- [x] 7.3 `rg -n "codex-acp-temporary-compat|USE_ACP_TEMPORARY_COMPAT|createCodexAcpTemporaryCompatAdapter"`
  returns no hits outside this change folder and archived changes.
- [x] 7.4 Desktop smoke: a Codex chat (app-server path) starts, streams, handles
  approvals, and renders tool calls; an **existing** Codex sub-chat with prior
  ACP-shaped tool parts still renders (proves `acp-tool-normalizer` retention).
  Evidence is recorded in `desktop-smoke-evidence.md`: app-server
  provider-plan and guarded approval desktop smokes passed; renderer
  ACP-shaped hydration/render normalization is covered by
  `tests/assistant-message-render-parts.test.ts`; built-app DOM proof opened an
  existing seeded sub-chat through `window.desktopApi.newWindow` and observed
  the legacy user prompt, read-tool target, and Bash output in the renderer.
- [x] 7.5 `locus acp` stdio server still starts and serves a prompt turn
  (proves the server surface was untouched).
  Evidence: `bun test tests/headless-cli-dispatcher.test.ts -t "runs minimal ACP stdio with JSON-only stdout and protocol jobs"` passed with the
  headless fake runner.
- [x] 7.6 `openspec validate remove-codex-acp-temporary-compat --strict --no-interactive` passes.
