## 0. Prerequisites

- [x] 0.1 Confirm `refactor-runtime-mcp-config-service` has landed: existing Claude
  and Codex MCP routes delegate to the Runtime MCP Config service, old duplicate
  route-local MCP write/status helpers are gone, and `docs/OWNERSHIP_MAP.md` names
  the new service owner.
- [x] 0.2 Confirm `add-runtime-native-plugin-execution` has landed the Plugin MCP
  ownership behavior this change depends on.
- 2026-06-20 preflight: `refactor-runtime-mcp-config-service` is archived under
  `openspec/changes/archive/2026-06-19-refactor-runtime-mcp-config-service/`,
  current `openspec/specs/architecture-ownership/spec.md` names the Runtime MCP
  Config service owner, `docs/OWNERSHIP_MAP.md` names
  `src/main/lib/runtime-mcp-config/`, and Claude/Codex runtime routes import the
  runtime MCP adapters.
- 2026-06-20 preflight: `add-runtime-native-plugin-execution` is archived under
  `openspec/changes/archive/2026-06-19-add-runtime-native-plugin-execution/`, and
  current `openspec/specs/runtime-plugins/spec.md` includes
  "Plugin MCP ownership is clear."
- [x] 0.3 Record the official MCP registry provider adapter used for this change,
  including its list/search/detail API shape and available entry fields.
- 2026-06-20 provider discovery completed in `registry-provider-notes.md` using
  official API docs, OpenAPI, source handlers/types, router registration, server
  schema, and server JSON docs. The adapter target is the documented `v0.1`
  read API; the official router also registers `v0` and the live web reader
  successfully opened `/v0/servers`.
- [x] 0.4 If the official MCP registry cannot supply the fields needed for
  normalization, provenance, setup, and preview, stop and update the provider
  decision before implementation continues.
- 2026-06-20 status: no provider decision change required. Official docs/schema
  provide list/search/detail, repository/package/remote/setup/provenance fields,
  package hash support, and registry/publisher metadata. Runtime adapter
  installability and verification remain separate Phase-0 proof gates.

## 1. Phase-0 Proof Gates

- [ ] 1.1 Probe Claude Agent SDK runs with a known MCP server and record whether Locus
  can observe server connection, tool-list, and successful MCP tool-call signals.
- 2026-06-20 code-level pre-probe recorded in `observability-probe-notes.md`.
  Locus already parses Claude SDK init `mcp_servers`/`tools` and MCP-prefixed
  tool input/output chunks, but this is not checked because a real Claude run
  with a known harmless MCP server is still required.
- [ ] 1.2 Probe Locus-managed Codex app-server runs with a known MCP server and record
  whether Locus can observe server connection, tool-list, and successful MCP
  tool-call signals.
- 2026-06-20 code-level pre-probe recorded in
  `codex-observability-probe-notes.md`. Locus-managed Codex app-server already
  calls `mcpServerStatus/list` with `toolsAndAuthOnly`; the summary now preserves
  `toolNamesByServer` and persists the redacted `mcp` runtime-status payload.
  This is not checked because a real app-server MCP tool-call success signal is
  still required.
- [ ] 1.3 Define verified-state behavior from the probe results. If a runtime lacks a
  required signal, automatic `Verified` upgrades from passive run observation are
  disabled or narrowed for that runtime.
- [x] 1.4 Probe Codex app-server adapter installability for registry-relevant fields:
  env, env-var references, HTTP headers, env-header references, bearer-token env,
  cwd, transport type, enabled state, and scope/capability reporting.
- 2026-06-20 probe recorded in `codex-installability-probe-notes.md`. Codex
  app-server can materialize existing config for runtime use across env,
  env-var references, headers, env-header references, bearer-token env, cwd,
  `stdio`/`streamable_http`/`http`/`sse`, disabled exclusion, and project lookup;
  current install writes remain global basic stdio/http CLI adds and cannot stage
  full registry fields or inactive setup.
- [x] 1.5 If Codex app-server cannot represent required fields or cannot produce
  end-to-end proof, mark Codex registry support deferred/unavailable and keep Claude
  registry install shippable.
- 2026-06-20 decision: Codex registry install and `Verified on Codex` remain
  deferred for this change until full-field config writes and real app-server
  runtime proof both pass. Claude remains the first shippable registry install
  target.

## 2. Registry Normalization + Install Preview

- [x] 2.1 Add the official-registry provider adapter with bounded list/search/detail
  fetches.
- 2026-06-20 implemented `src/main/lib/mcp-registry/official-provider.ts` as a
  raw official-provider adapter with injectable fetch, HTTPS base URL enforcement,
  `v0.1` list/search/detail URL construction, page-limit clamping, timeout wiring,
  response-size bounds, and response-shape validation. No normalization, install
  writes, MCP server launch, or tool calls are included in this step.
- [x] 2.2 Normalize official-registry entries into a service-owned model with provider
  ID, entry ID, version/ref, source URL, package/distribution identifier, transport,
  command/URL template, args, cwd, env schema, header schema, auth metadata, and
  declared runtime support.
- 2026-06-20 implemented `src/main/lib/mcp-registry/normalize.ts`. The
  normalized model keeps package and remote install targets separate, preserves
  official/publisher metadata, maps transports, captures runtime/package args,
  env/header/variable setup schemas, infers auth metadata conservatively, and
  leaves unknown runtime support as `unknown` instead of claiming compatibility.
- [x] 2.3 Add entry/config fingerprinting and provenance classification: immutable,
  mutable, unknown, integrity/hash present, integrity/hash missing.
- 2026-06-20 implemented `src/main/lib/mcp-registry/fingerprints.ts` with stable
  JSON fingerprints for normalized entries and install targets plus conservative
  provenance/integrity classification. Exact version refs with package hashes can
  classify as immutable; mutable refs such as `latest` classify as mutable; exact
  refs without integrity stay unknown.
- [x] 2.4 Add `McpRegistryInstallPreview` separate from `McpImportPreview`; reuse
  redaction primitives but do not add apply semantics to import previews.
- 2026-06-20 implemented `src/main/lib/mcp-registry/preview.ts` with a
  registry-specific preview shape and builder. It reuses MCP import preview URL
  and command-arg redaction, carries entry/config fingerprints and provenance,
  redacts setup values, does not add import-preview apply/enable semantics, and
  keeps raw remote URL query values out of preview target IDs.
- [x] 2.5 Preview runtime installability from adapters, distinguishing declared
  compatibility, installable config, installed/unverified, needs setup, failed
  check, verified-local, and Codex deferred states.
- 2026-06-20 implemented `src/main/lib/mcp-registry/installability.ts` and added
  `runtimeInstallability` to registry install previews. Claude installability is
  derived from materializable stdio/http config and required setup; local states
  can represent installed/unverified, installed/needs-setup, failed-check, and
  verified-local; Codex is always reported as `codex-deferred` pending the Phase-0
  config-write and runtime-proof gates.
- [x] 2.6 Surface mutable/unpinned risk warnings for `latest`, branch names,
  unresolved tags, missing integrity metadata, or unknown source pins without
  blocking the user's explicit install attempt.
- 2026-06-20 registry previews now surface non-blocking warnings for mutable
  provenance, unknown provenance, missing integrity, mutable version refs such
  as `latest`, unknown version refs, and unknown declared runtime support.
- [x] 2.7 Classify required setup before install: required/optional env keys,
  header keys, bearer-token env references, OAuth/runtime auth, local dependencies,
  missing keys, and whether the target adapter can keep incomplete servers inactive.
- 2026-06-20 implemented `src/main/lib/mcp-registry/setup.ts` as a pure setup
  classifier. It separates required/optional env, header, and variable keys;
  classifies bearer-token env refs, OAuth/runtime auth, package local dependency
  status, missing setup keys, and the current adapter behavior. Current Claude
  and Codex registry install paths cannot safely keep incomplete runtime config
  inactive, so missing required setup produces `block-install`.

## 3. Setup Resolution + Install Flow

- [x] 3.1 Add MCP tab registry browse/detail/install UI alongside existing manual add
  and import surfaces.
- 2026-06-20 added `src/main/lib/mcp-registry/service.ts` as the main-process
  service entrypoint for list/search/detail/preview. This is the API/service
  foundation for the MCP tab UI.
- 2026-06-20 added the MCP tab registry browse mode backed by
  `trpc.mcpRegistry.list`/`detail`, with a redacted install-preview detail panel.
  This was later completed with a Claude setup-free install confirmation action.
- 2026-06-20 added the renderer install confirmation action for Claude
  setup-free targets. Later setup-resolution slices added resolved setup input
  and inactive `Installed / Needs setup` staging for missing setup.
- [x] 3.2 Implement setup resolution for env var references, secret values,
  OAuth/runtime auth, local dependency status, and missing setup display, with secret
  values kept in main-process or runtime-owned secure storage and renderer metadata
  redacted.
- 2026-06-20 registry previews now include renderer-facing setup classifications
  for Claude and Codex: required/optional/missing env, headers, variables, bearer
  token env refs, OAuth/runtime auth, local dependency blockers, and
  inactive-or-block behavior. The MCP tab displays the missing setup keys without
  secret values.
- 2026-06-20 Claude service/runtime slice landed: install accepts resolved env,
  header, variable, bearer-env-ref, and local-dependency setup; secret setup
  values are encrypted before writing Claude config and materialized only in the
  main-process Claude runtime path.
- 2026-06-20 renderer install confirmation now captures required/optional env,
  header, and variable values plus local dependency confirmation, then submits
  redacted-preview setup through `resolvedSetup`.
- 2026-06-20 renderer setup submission now treats `$ENV_NAME` and `${ENV_NAME}`
  as env-var references, while service tests prove env-var refs are stored as
  refs and resolved only in the main-process Claude runtime path.
- 2026-06-20 OAuth/runtime-auth setup is intentionally not auto-executed during
  registry install. OAuth registry targets are classified as required auth setup
  even without header/env schemas; Claude saves them inactive as
  `Installed / Needs setup`, while Codex/runtime-auth remains `block-install`
  until the target runtime can safely stage inactive config.
- [x] 3.3 On install confirmation, write through the Runtime MCP Config service and
  target adapter, not through route-local Claude/Codex helpers.
- 2026-06-20 added a Claude-only registry install service path that materializes
  setup-free registry targets, then writes through
  `writeClaudeMcpServerConfig` in the Runtime MCP Config owner. The tRPC install
  mutation and renderer confirmation UI remain pending.
- 2026-06-20 exposed `trpc.mcpRegistry.install` as an explicit install mutation
  that delegates to the registry service.
- 2026-06-20 renderer confirmation now calls the install mutation for Claude
  setup-free targets; the mutation still delegates to the registry service and
  Runtime MCP Config owner.
- [x] 3.4 Ensure browse/preview/install do not run registry server commands, package
  managers, Docker images, MCP server processes, or MCP tools.
- 2026-06-20 added `tests/mcp-registry-management-inert.test.ts` to guard the
  current registry management-time service and preview code against process
  execution, runtime MCP writers, MCP tool calls, package-manager launches, and
  Docker.
- 2026-06-20 added a browse-only tRPC router test and renderer browse mode; the
  UI initially only read registry metadata/previews; install action coverage landed
  in the later Claude setup-free slice.
- [x] 3.5 Allow runtime-owned config writers during install only when they write or
  stage configuration and do not launch the target MCP server.
- 2026-06-20 install service uses the Claude runtime-owned config writer only;
  tests keep the registry service inert against process execution and MCP tool
  calls.
- 2026-06-20 router tests cover the install mutation envelope and assert the route
  does not call route-local Claude/Codex MCP helpers or process execution APIs.
- [x] 3.6 After install with setup resolved, mark the server `Installed / Unverified`
  for that runtime and fingerprint until local runtime proof exists.
- 2026-06-20 Claude registry install writes `_locusMcpRegistry` metadata with
  `installed-unverified`, entry fingerprint, and config fingerprint. Renderer
  status display and local verification upgrades remain pending.
- [x] 3.7 If required setup is missing and the adapter supports inactive config, save as
  `Installed / Needs setup` and exclude the server from runs until setup is resolved.
- 2026-06-20 runtime exclusion slice landed: Claude Runtime MCP Config now keeps
  `disabled` and registry `installed-needs-setup` servers out of Locus-managed
  Claude SDK runs and reports them as disabled in Settings.
- 2026-06-20 Claude install now writes missing-setup registry targets as disabled
  `installed-needs-setup` configs with missing setup reasons. Runtime tests prove
  they are excluded from Claude SDK runs until setup is resolved.
- [x] 3.8 If required setup is missing and the adapter cannot keep the server inactive,
  block install before writing active runtime config and show the missing setup keys.
- 2026-06-20 Claude now supports the inactive branch. Codex registry install remains
  deferred/unavailable rather than writing active incomplete config. The MCP tab
  displays missing setup keys and runtime setup behavior before confirmation.
- [x] 3.9 Keep registry-sourced servers MCP-only and out of Plugins as plugin execution
  items.
- 2026-06-20 added registry/plugin boundary coverage: registry install writes
  `_locusMcpRegistry` without `_locusPluginMcp`, registry management sources
  cannot write plugin MCP provenance, and Plugins router/tab sources do not read
  registry provenance or `mcpRegistry` execution items.
- [x] 3.10 Display plugin-sourced MCP servers with source attribution only after the
  prerequisite Plugin MCP ownership behavior has landed; defer approve/revoke/enable
  to Plugins.
- 2026-06-20 added service/UI guard coverage: plugin MCP servers appear under a
  `Plugin: <source>` settings group with pending approval state when unapproved,
  only approved plugin MCP servers enter Claude SDK runtime input, and the MCP
  tab keeps plugin-sourced edit/toggle controls disabled so Plugins retains
  approve/revoke/enable ownership.

## 4. Local Verification

- [x] 4.1 Add local verification state keyed by machine-local runtime, server name,
  registry entry fingerprint, and config fingerprint.
- 2026-06-20 added `mcp-registry-verification-state.json` under app `userData`
  with stable local record IDs derived from runtime, server name, entry
  fingerprint, and config fingerprint. This is storage only: it can represent
  `installed-unverified`, `installed-needs-setup`, `ready-to-verify`,
  `failed-check`, and `verified-local`, but does not run Check or upgrade
  Verified by itself.
- [x] 4.2 Transition `Installed / Needs setup` to `Ready to verify` only after all
  required setup is resolved without exposing secret values to renderer state.
- 2026-06-20 registry install metadata now records renderer-safe
  `missingSetupKeys`; Runtime MCP Config derives `ready-to-verify` only when a
  registry needs-setup config is no longer disabled, has no missing setup keys,
  and has no unresolved secret/env-ref/template placeholders after main-process
  materialization. Tests assert unresolved needs-setup stays excluded from
  Claude SDK runs, ready-to-verify enters Claude SDK input, and returned state
  does not expose secret values.
- [ ] 4.3 Observe real Claude runs and upgrade to `Verified on Claude` only after the
  Phase-0 probe proves Locus can observe the required MCP signals and a tool call
  succeeds.
- [ ] 4.4 Observe real Locus-managed Codex app-server runs and upgrade to
  `Verified on Codex` only after Codex field-materialization and observability proof
  gates pass and a tool call succeeds.
- [x] 4.5 Add an explicit Check action that is connect/list-only by default.
- 2026-06-20 added explicit `mcpRegistry.checkInstalled` plus an MCP tab Check
  button for registry-managed Claude servers. The default path materializes the
  installed config in the main process, connects/lists tools via the Runtime MCP
  Config Claude adapter, records `ready-to-verify` or `failed-check`, and does
  not invoke MCP tools or upgrade to Verified. Codex Check remains deferred
  instead of offering fake support.
- [x] 4.6 Allow explicit Check to call a tool only when Locus has classified that tool
  as safe and side-effect-free; otherwise require a user-initiated real run for
  tool-call proof.
- 2026-06-20 conservative implementation: no MCP registry tools are currently
  classified as safe side-effect-free tools, so explicit Check remains
  connect/list-only and never performs a tool call. Tool-call proof is therefore
  still reserved for user-initiated real runs until a Locus-owned safe-tool
  classifier exists.
- [x] 4.7 Record failure reasons such as missing env, missing auth, unsupported adapter
  field, process launch failure, connection failure, tool-list failure, tool-call
  failure, and unavailable observability.
- 2026-06-20 explicit Check now records `failed-check` reasons for unresolved
  setup/missing env, missing auth, unsupported config fields, process launch
  failures, connection failures, and tool-list failures. Tool-call failure is
  not emitted by Check because 4.6 keeps Check connect/list-only until a safe
  tool classifier exists; Codex remains explicit deferred/unavailable rather
  than producing unverifiable Check evidence.

## 5. Validation

- [x] 5.1 Unit tests for official-registry normalization, provenance/fingerprint
  classification, setup classification, redaction, mutable-ref warnings, and
  install/setup/verified/deferred status transitions.
- 2026-06-20 registry unit coverage now includes official-provider bounds,
  normalization, fingerprints/provenance, setup classification, redacted preview,
  installability states, service install/setup paths, verification local state,
  router envelope, runtime MCP integration, and deferred Codex states.
- [x] 5.2 Tests proving setup resolution keeps secrets out of renderer state.
- 2026-06-20 preview tests assert setup classifications expose missing keys while
  redacting registry-provided secret URL/header/env/arg values. Service/runtime
  tests now also prove resolved secrets are encrypted in config metadata,
  materialized only in main-process runtime code, and omitted from install/check
  result state.
- [x] 5.3 Tests proving missing required setup either saves an inactive
  `Installed / Needs setup` server excluded from runs or blocks install when inactive
  state is unavailable.
- 2026-06-20 added service and runtime coverage for the Claude inactive branch:
  missing setup writes disabled `installed-needs-setup` config, and
  Locus-managed Claude SDK runs exclude disabled and registry needs-setup servers.
- [x] 5.4 Tests proving browse/preview/install do not execute registry server
  commands, package managers, Docker, MCP server processes, or MCP tools.
- 2026-06-20 `mcp-registry-management-inert` and router guards prove
  browse/preview/install do not import process execution, route-local MCP
  helpers, package managers, Docker, MCP server launch, or MCP tool/list calls;
  only explicit Check may list tools after user action.
- [x] 5.5 Tests proving explicit Check does not call unsafe/unclassified tools.
- 2026-06-20 source guard covers the explicit registry Check implementation:
  it lists tools, records `ready-to-verify`, does not contain MCP tool-call
  invocation paths, and does not write `verified-local`.
- [ ] 5.6 Manual proof: official-registry MCP server installed to Claude; real Claude
  run discovers, connects, lists tools, and calls a tool.
- 2026-06-20 added `runtime-proof-evidence.md` plus
  `bun run mcp-registry:proof:evidence` as the evidence gate for the remaining
  real-runtime proof tasks. `runtime-proof-runbook.md` records the isolated
  launch and redacted evidence steps. The current scenarios stay blocked, so
  this task remains unchecked until a GUI/runtime-capable environment records
  passed Claude run evidence without secrets.
- [x] 5.7 Manual proof for Codex app-server only if proof gates pass; otherwise record
  Codex deferred/unavailable reason and verify the UI does not offer fake Codex
  verified support.
- 2026-06-20 Codex proof gates did not pass for this change, so the accepted
  behavior is deferred/unavailable rather than real Codex proof. Verified by
  `bun test tests/mcp-registry-management-inert.test.ts
  tests/mcp-registry-router.test.ts tests/mcp-registry-preview.test.ts
  tests/mcp-registry-installability.test.ts tests/mcp-registry-service.test.ts`:
  Codex preview/installability reports `codex-deferred` with deferred reasons,
  Codex registry install/check reject with deferred errors, and the MCP tab UI
  only offers registry install/check for Claude.
- [x] 5.8 `bun run ts:check`.
- 2026-06-20 passed: `tsc --noEmit`.
- [x] 5.9 `bun run lint`.
- 2026-06-20 passed: `bun run lint:changed`; no changed files supported by
  Biome after the final verification slice.
- [x] 5.10 Architecture guard.
- 2026-06-20 passed: `node scripts/check-architecture-guards.mjs`.
- [x] 5.11 `openspec validate add-mcp-registry-install --strict --no-interactive`.
- 2026-06-20 passed: change is valid.
- [x] 5.12 Record the resolved MCP registry install behavior in
  `docs/ideas/settings-per-tab-audit.md`.
- 2026-06-20 recorded the resolved behavior in the MCP audit section: the MCP tab
  is the registry/store home; browse, redacted preview, setup-aware Claude
  install, and connect/list-only Check have landed; `Verified on Claude` and
  Codex registry support remain proof-gated by real runtime evidence.
