## 0. Prerequisites

- [ ] 0.1 Confirm the Phase 1 finding in
  `add-codex-app-server-mcp-tool-observability` (Codex exposes readiness + tool
  inventory, but no post-execution tool-result signal).
- [ ] 0.2 Confirm the current Codex installability/install code paths
  (`installability.ts` `codex-deferred`, `install.ts` Codex throw) before changes.

## 1. Codex Runtime Auth Resolution (P1)

- [ ] 1.1 Compute `runtimeAuthenticated` for Codex in the main process from real
  Codex integration/login state; never trust a renderer-reported flag.
- [ ] 1.2 Inject the resolved Codex auth state into setup classification and
  installability inputs (`setup.ts`, `service.ts`, `preview.ts`) so preview/detail
  no longer default every Codex target to `runtime-auth:codex` missing.
- [ ] 1.3 Verify a setup-free, Codex-authenticated remote target resolves to
  installable (not perpetually needs-setup).

## 2. Codex Materialization Gate + Registry Identity (P1)

- [ ] 2.1 Add `codexCanMaterialize(target)` mirroring `claudeCanMaterialize`,
  covering env, env-var refs, headers, env-header refs, bearer-token env, cwd,
  transport type, and enabled state. Fields the Codex writer cannot represent make
  the target non-materializable.
- [ ] 2.2 In `installability.ts`, replace the unconditional `codex-deferred` with:
  materializable + auth/setup resolved → installable; materializable + setup
  missing → needs-setup; non-materializable or unresolved Codex runtime auth →
  blocked with a concrete reason.
- [ ] 2.3 Decide and implement Codex registry-identity storage: extend the Codex
  config writer to carry registry identity + missing fields
  (headers/env/cwd/disabled), or keep a separate Locus-side local state keyed by
  runtime + server name + entry fingerprint + config fingerprint.
- [ ] 2.4 Keep `verified-local` unreachable for Codex; cap Codex at a connected or
  unverified state.

## 3. Install + Connect/List Check (remote-only v1)

- [ ] 3.1 Allow `install.ts` Codex install for materializable targets through the
  Runtime MCP Config service, persisting the registry identity; keep a fail-closed
  block for non-materializable targets.
- [ ] 3.2 Mark a freshly installed Codex server `Installed / Unverified`.
- [ ] 3.3 Add a Codex connect/list check limited to remote
  HTTP/SSE/streamable_http targets that uses observable readiness + tool inventory
  only, matches the server to its stored registry identity, and can mark it
  connected with tools visible.
- [ ] 3.4 Exclude stdio/package targets from the connected check (do not launch the
  server process to list tools); leave them `Installed / Unverified` in v1.
- [ ] 3.5 Ensure browse, preview, install, and the default Check never call MCP
  tools, start package managers/Docker, or launch stdio/package servers.

## 4. Status + UI Wording

- [ ] 4.1 Add an honest Codex connected status (tools visible, not auto-verifiable)
  distinct from `Installed / Unverified` and `verified-local`.
- [ ] 4.2 Differentiate Claude `Verified` from Codex connected/unverified in the
  registry UI, and show the explicit "cannot auto-verify on Codex" reason.
- [ ] 4.3 For blocked Codex targets, show the concrete materialization/auth reason
  instead of a generic `codex deferred` chip.

## 5. Tests + Validation

- [ ] 5.1 Unit tests for `codexCanMaterialize` (materializable vs blocked:
  unsupported fields, unresolved Codex runtime auth).
- [ ] 5.2 Unit tests proving Codex auth resolution comes from main-process state,
  and a renderer-reported auth flag cannot open a target.
- [ ] 5.3 Tests proving Codex install is offered only for materializable +
  authenticated targets and blocked otherwise with concrete reasons.
- [ ] 5.4 Tests proving Codex never reaches `verified-local` from connect/list
  signals, and that stdio/package targets are excluded from the connected check.
- [ ] 5.5 Tests proving browse/preview/install/Check do not call MCP tools or launch
  stdio/package servers.
- [ ] 5.6 Tests proving connected status binds to stored registry identity, not a
  bare server name.
- [ ] 5.7 `bun run ts:check`.
- [ ] 5.8 `bun run lint:changed`.
- [ ] 5.9 Architecture guard.
- [ ] 5.10 `openspec validate open-codex-mcp-registry-install --strict --no-interactive`.
- [ ] 5.11 Smoke: install a materializable registry MCP server to Codex, run a
  connect/list check, confirm connected (tools visible) and not `Verified on Codex`;
  prove no plaintext secret is committed in evidence, logs, or renderer state.
