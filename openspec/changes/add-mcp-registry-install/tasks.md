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
- [ ] 2.3 Add entry/config fingerprinting and provenance classification: immutable,
  mutable, unknown, integrity/hash present, integrity/hash missing.
- [ ] 2.4 Add `McpRegistryInstallPreview` separate from `McpImportPreview`; reuse
  redaction primitives but do not add apply semantics to import previews.
- [ ] 2.5 Preview runtime installability from adapters, distinguishing declared
  compatibility, installable config, installed/unverified, needs setup, failed
  check, verified-local, and Codex deferred states.
- [ ] 2.6 Surface mutable/unpinned risk warnings for `latest`, branch names,
  unresolved tags, missing integrity metadata, or unknown source pins without
  blocking the user's explicit install attempt.
- [ ] 2.7 Classify required setup before install: required/optional env keys,
  header keys, bearer-token env references, OAuth/runtime auth, local dependencies,
  missing keys, and whether the target adapter can keep incomplete servers inactive.

## 3. Setup Resolution + Install Flow

- [ ] 3.1 Add MCP tab registry browse/detail/install UI alongside existing manual add
  and import surfaces.
- [ ] 3.2 Implement setup resolution for env var references, secret values,
  OAuth/runtime auth, local dependency status, and missing setup display, with secret
  values kept in main-process or runtime-owned secure storage and renderer metadata
  redacted.
- [ ] 3.3 On install confirmation, write through the Runtime MCP Config service and
  target adapter, not through route-local Claude/Codex helpers.
- [ ] 3.4 Ensure browse/preview/install do not run registry server commands, package
  managers, Docker images, MCP server processes, or MCP tools.
- [ ] 3.5 Allow runtime-owned config writers during install only when they write or
  stage configuration and do not launch the target MCP server.
- [ ] 3.6 After install with setup resolved, mark the server `Installed / Unverified`
  for that runtime and fingerprint until local runtime proof exists.
- [ ] 3.7 If required setup is missing and the adapter supports inactive config, save as
  `Installed / Needs setup` and exclude the server from runs until setup is resolved.
- [ ] 3.8 If required setup is missing and the adapter cannot keep the server inactive,
  block install before writing active runtime config and show the missing setup keys.
- [ ] 3.9 Keep registry-sourced servers MCP-only and out of Plugins as plugin execution
  items.
- [ ] 3.10 Display plugin-sourced MCP servers with source attribution only after the
  prerequisite Plugin MCP ownership behavior has landed; defer approve/revoke/enable
  to Plugins.

## 4. Local Verification

- [ ] 4.1 Add local verification state keyed by machine-local runtime, server name,
  registry entry fingerprint, and config fingerprint.
- [ ] 4.2 Transition `Installed / Needs setup` to `Ready to verify` only after all
  required setup is resolved without exposing secret values to renderer state.
- [ ] 4.3 Observe real Claude runs and upgrade to `Verified on Claude` only after the
  Phase-0 probe proves Locus can observe the required MCP signals and a tool call
  succeeds.
- [ ] 4.4 Observe real Locus-managed Codex app-server runs and upgrade to
  `Verified on Codex` only after Codex field-materialization and observability proof
  gates pass and a tool call succeeds.
- [ ] 4.5 Add an explicit Check action that is connect/list-only by default.
- [ ] 4.6 Allow explicit Check to call a tool only when Locus has classified that tool
  as safe and side-effect-free; otherwise require a user-initiated real run for
  tool-call proof.
- [ ] 4.7 Record failure reasons such as missing env, missing auth, unsupported adapter
  field, process launch failure, connection failure, tool-list failure, tool-call
  failure, and unavailable observability.

## 5. Validation

- [ ] 5.1 Unit tests for official-registry normalization, provenance/fingerprint
  classification, setup classification, redaction, mutable-ref warnings, and
  install/setup/verified/deferred status transitions.
- [ ] 5.2 Tests proving setup resolution keeps secrets out of renderer state.
- [ ] 5.3 Tests proving missing required setup either saves an inactive
  `Installed / Needs setup` server excluded from runs or blocks install when inactive
  state is unavailable.
- [ ] 5.4 Tests proving browse/preview/install do not execute registry server
  commands, package managers, Docker, MCP server processes, or MCP tools.
- [ ] 5.5 Tests proving explicit Check does not call unsafe/unclassified tools.
- [ ] 5.6 Manual proof: official-registry MCP server installed to Claude; real Claude
  run discovers, connects, lists tools, and calls a tool.
- [ ] 5.7 Manual proof for Codex app-server only if proof gates pass; otherwise record
  Codex deferred/unavailable reason and verify the UI does not offer fake Codex
  verified support.
- [ ] 5.8 `bun run ts:check`.
- [ ] 5.9 `bun run lint`.
- [ ] 5.10 Architecture guard.
- [ ] 5.11 `openspec validate add-mcp-registry-install --strict --no-interactive`.
- [ ] 5.12 Record the resolved MCP registry install behavior in
  `docs/ideas/settings-per-tab-audit.md`.
