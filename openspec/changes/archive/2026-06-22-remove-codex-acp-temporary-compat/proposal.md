# Change: Remove the Codex ACP temporary-compat stack

## Why

Codex desktop/chat has run on the `codex-app-server` adapter by default since the
app-server proof landed; the ACP (`@zed-industries/codex-acp`) adapter survives
only as a labeled `temporary-compat` rollback that activates exclusively through
the `LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT=1` (or legacy
`LOCUS_CODEX_APP_SERVER_ADAPTER=0`) env gate. `codex-runtime-parity` already
records that "ACP fallback defaults off after app-server proof" and that any
remaining ACP route "has an explicit approved compatibility gate and **deletion
follow-up**." This change is that deletion follow-up: it removes the ACP runtime
path, its env gates, its capability overrides, and its bundled binary so the
Codex surface has a single supported transport.

## What Changes

- **BREAKING (operator-facing):** Remove the ACP rollback path and its selection
  env vars (`LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT`, legacy
  `LOCUS_CODEX_APP_SERVER_ADAPTER`). After this change there is no env-flag
  rollback to ACP; `codex-app-server` is the only desktop/chat adapter.
- Delete the ACP-only runtime modules: `acp-temporary-compat-adapter.ts`,
  `acp-adapter.ts`, `acp-runtime.ts`, `acp-text-stream.ts`, `acp-ui-stream.ts`,
  `acp-message-persistence.ts`, `acp-path.ts`, plus their dedicated tests.
- Simplify `desktop-adapter-selection.ts` to always resolve `codex-app-server`,
  and remove the `codex-acp-temporary-compat` adapter source from
  `adapter-types.ts`, `desktop-runner.ts`, and the
  `CodexAcpPermissionMapping` / `acpMode` branch in `permission-policy.ts`.
- Remove ACP wiring from `trpc/routers/codex.ts`: the
  `createCodexAcpTemporaryCompatAdapter` branch and the now-dead
  `cleanupCodexAcpProvider` / `cleanupAllCodexAcpProviders` calls (app-server
  manages its own transport lifecycle).
- Remove ACP adapter metadata + removal-condition constants from
  `desktop-adapter-metadata.ts`, and the ACP binary/spawn-probe reporting block
  from `runtime-status.ts`.
- Remove `CODEX_ACP_CAPABILITY_OVERRIDES` and the `codex-acp-temporary-compat`
  branch from `codex-runtime-capabilities.ts`, and rewrite capability reason/hint
  strings so they no longer cite ACP-specific primitives (per
  `agent-runtime-capabilities` "App-server replaces ACP"). Evidence pins to the
  retained shared file `acp-permission.ts` stay valid.
- Drop the bundled ACP binary dependency `@zed-industries/codex-acp` (and its
  `@zed-industries/codex-acp-*` platform packages) from `package.json` and the
  electron-builder `asarUnpack`/`files` entries.
- **Conditional:** Drop the `@mcpc-tech/acp-ai-provider` npm dependency **only
  if** its remaining use — `acpTools` imported by the shared `ask-user-question.ts`
  — can be removed or replaced. `ask-user-question.ts` is used by the app-server
  path, so the dependency stays until that import is detached.
- Update `docs/OWNERSHIP_MAP.md` "Codex Desktop Chat Runtime": replace the
  "Current ACP provider/session owner: `acp-adapter.ts`" line and the ACP
  lifecycle rule with the app-server canonical owner
  (`src/main/lib/codex/app-server-adapter.ts`, selection via
  `desktop-adapter-selection.ts`), and remove the dangling pointer to the
  non-existent `refactor-codex-official-runtime-adapter` change. Leaving the old
  owner in place would create a new architecture lie.

### Explicitly NOT changed (scope guards)

- **`locus acp` stdio server** (`headless/acp-stdio.ts`, `cli-dispatcher`,
  `cli-args`) is a different capability (`agent-protocol-interfaces`) — Locus
  acting as an ACP server. Untouched.
- **Shared files that are named `acp-*` but back the app-server path stay** (no
  deletion, no rename in this change): `acp-permission.ts`,
  `acp-spawn-probe.ts` (`stripCodexAnsi`), renderer `acp-chat-transport.ts`
  (`ACPChatTransport` serves all Codex chats), and shared `acp-tool-normalizer.ts`
  (hydrates persisted Codex tool parts in existing chat history). Renaming these
  to drop the misleading `acp` prefix is deferred to a separate
  `refactor-codex-acp-naming` change to keep this diff reviewable and avoid
  churning capability-evidence pins.

## Capability truth boundary (non-goal)

This change removes the ACP **rollback transport**; it does **not** claim Codex
app-server has reached full parity. The app-server capability manifest keeps its
current honest state matrix, and this change must preserve it:

- `hardToolGuard` stays conditional: unknown provider-auth context remains
  `degraded`; proven `runtime-managed`, `app-managed`, and `provider-profile`
  app-server auth modes remain `supported`.
- `degraded`: `scopeExpansion`, `mcpAuth`, `mcpConfiguration` (see
  `src/shared/codex-runtime-capabilities.ts`).
- `unsupported`: `rollback` (no durable shared-session reference / file rollback
  policy yet).

Removing ACP must not silently upgrade or downgrade any app-server capability
state. The only capability-manifest edits in scope are deleting the
`codex-acp-temporary-compat` adapter source + its
`CODEX_ACP_CAPABILITY_OVERRIDES`, and rewriting reason/hint strings so they no
longer cite ACP primitives — never changing the app-server state matrix.

## Impact

- **Affected specs:**
  - `codex-runtime-parity` — MODIFY/REMOVE the "ACP remains in temporary use",
    "ACP fallback is disabled after app-server proof" gate, and collapse the
    "distinct Codex programmatic surfaces" requirement from four surfaces (SDK /
    app-server / ACP / exec) to three.
  - `agent-runtime-capabilities` — MODIFY "App-server replaces ACP" to reflect
    that ACP-only behavior and fallback are now removed, not retained behind a
    temporary fallback.
  - `provider-runtime-bindings`, `agent-runtime-core`, `architecture-ownership` —
    remove ACP from transport/adapter-source enumerations.
  - NOT affected: `agent-protocol-interfaces`, `runtime-security-baseline` (those
    describe `locus acp`, the server surface).

- **Affected code (delete):** `src/main/lib/codex/acp-temporary-compat-adapter.ts`,
  `acp-adapter.ts`, `acp-runtime.ts`, `acp-text-stream.ts`, `acp-ui-stream.ts`,
  `acp-message-persistence.ts`, `acp-path.ts`; tests `codex-acp-adapter.test.ts`,
  `codex-acp-runtime.test.ts`, `codex-acp-text-stream.test.ts`,
  `codex-acp-message-persistence.test.ts`, `codex-acp-path.test.ts`.

- **Affected code (edit):** `src/main/lib/codex/desktop-adapter-selection.ts`,
  `adapter-types.ts`, `runtime-status.ts`;
  `src/main/lib/agent-runtime/desktop-runner.ts`, `desktop-adapter-metadata.ts`,
  `permission-policy.ts`; `src/main/lib/trpc/routers/codex.ts`;
  `src/shared/codex-runtime-capabilities.ts`, `agent-runtime-capabilities.ts`,
  `codex-runtime-status.ts`;
  tests `codex-desktop-adapter-selection.test.ts`,
  `agent-runtime-permission-policy.test.ts`, `codex-runtime-status.test.ts`,
  `codex-runtime-capabilities.test.ts` (and any others asserting the ACP source);
  `package.json`, electron-builder config; `docs/OWNERSHIP_MAP.md`.

- **Retained (do not touch):** `acp-permission.ts`, `acp-spawn-probe.ts`,
  `acp-chat-transport.ts`, `acp-tool-normalizer.ts`, and the entire `locus acp`
  server surface.

## Risks

- **Loss of rollback lever:** removing the env gate means an app-server
  regression can no longer be mitigated by flipping back to ACP. Mitigation:
  confirm app-server stability in the field before merge; the change is
  revertable via git if needed.
- **Persisted history:** old Codex sub-chats may hold ACP-shaped tool parts.
  `acp-tool-normalizer.ts` is retained precisely so those render — it must not be
  deleted alongside the runtime.
- **Dependency entanglement:** `@mcpc-tech/acp-ai-provider` is reachable from the
  shared `ask-user-question.ts`; treat its removal as conditional, not assumed.
