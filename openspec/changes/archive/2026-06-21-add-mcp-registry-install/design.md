## Context

The current MCP tab can add, remove, refresh, OAuth, and list MCP servers for
Claude and Codex. `refactor-runtime-mcp-config-service` extracts that existing
behavior into a Runtime MCP Config service with per-runtime adapters before this
change begins.

Registry install adds product behavior on top of that owner: official registry
browsing, install preview, provenance, setup state, install status, verification,
and future runtime expansion.

## Goals / Non-Goals

**Goals:**

- Let users browse the official MCP registry and install entries to supported
  runtimes.
- Ship Claude registry install only after a real Claude run proves installed server
  usability.
- Attempt Codex app-server support only behind explicit field-materialization and
  observability proof gates; defer it honestly if proof fails.
- Separate install success from verified usability.
- Store local runtime verification state per machine, runtime, server, entry
  fingerprint, and config fingerprint.
- Preserve import-preview semantics: import links remain preview-only; registry
  install uses its own `McpRegistryInstallPreview` while reusing redaction
  primitives.
- Align plugin-provided MCP source display with the Plugin MCP ownership delivered by
  `add-runtime-native-plugin-execution`.

**Non-Goals:**

- Not a guarantee that every official-registry entry works on every machine.
- Not a Plugins marketplace or plugin execution path.
- Not the Runtime MCP Config service extraction; that is the prerequisite
  `refactor-runtime-mcp-config-service`.
- Not automatic package install, Docker start, MCP server launch, or MCP tool call
  during browse/preview/install.

## Decisions

### Prerequisite Service Owner

This change depends on `refactor-runtime-mcp-config-service`. Registry install uses
the Runtime MCP Config service and runtime adapters created there. It must not add a
second route-local MCP write/status path.

### Provider Choice

The initial registry provider is the official MCP registry. Before implementation
normalizes entries, it must record the concrete API/schema used for list, search, and
detail. If the official registry cannot provide the required stable fields, the
provider decision must be updated before implementation proceeds.

### Runtime Targeting

Claude is the required first runtime target. A Claude registry install is complete
only when a real Claude run can consume the installed configuration, connect, list
tools, and successfully call at least one tool.

Codex is not a separate version. It is a conditional target in the same product
change. Codex app-server registry support opens only when both are true:

- the Codex app-server adapter can represent the entry's required config fields, and
- Locus can collect enough runtime proof for Codex app-server.

If either condition fails, Codex is shown as deferred/unavailable for registry install
or verification. The UI must not present `Verified on Codex` without proof.

### Public Registry Install Is Not Public Registry Proof

The UI can offer install for normalized official-registry entries, but registry
metadata creates only declared compatibility. Local proof creates verified
compatibility.

Status model:

- `Available`: registry entry is visible.
- `Installable`: a runtime adapter can materialize and write the entry's required
  config fields.
- `Installed / Unverified`: config write succeeded, but no local runtime proof exists.
- `Installed / Needs setup`: config or a local install record exists, but required
  env, header, token, OAuth, local dependency, or runtime auth setup is missing; the
  server is disabled or excluded from runs.
- `Ready to verify`: required setup is resolved and the runtime adapter can include
  the server in a user-triggered verification check or real run.
- `Failed check`: runtime connection, tool listing, or verification failed.
- `Verified on Claude` / `Verified on Codex`: local runtime proof exists for that
  runtime, entry fingerprint, and server config fingerprint.
- `Codex deferred`: Codex app-server field support or observability proof is missing;
  no Codex install or verified claim is offered.

Registry self-claims remain displayed as declared metadata and never become a
verified badge.

### Phase-0 Observability Probe

Before automatic verified-state upgrades are designed, implementation must prove what
the runtime actually exposes:

- Claude Agent SDK: whether Locus can record MCP server connection, tool-list, and
  tool-call success for registry-installed servers.
- Codex app-server: whether Locus can record equivalent connection, tool-list, and
  tool-call success signals.

If a runtime lacks one of those signals, the verified-state mechanism for that
runtime is narrowed to the signals Locus can truthfully observe. If a tool-call signal
cannot be observed, `Verified` cannot be produced from passive run observation for
that runtime.

### Required Setup And Activation

Registry entries may require setup before the server can safely run: env var names,
secret values, HTTP headers, bearer-token env references, OAuth login, runtime auth,
or local dependencies. The install preview must show required and optional setup keys
with renderer-safe redaction before any write.

If required setup is missing, Locus must not silently create an active broken server.
The service may save the server as `Installed / Needs setup` only when the target
runtime adapter can keep the server disabled or excluded from Claude/Codex runs until
setup is resolved. If the adapter cannot represent an inactive/pending server safely,
installation is blocked until the missing setup is provided.

Once setup is resolved, the status becomes `Ready to verify`. Secret values remain in
the main process or in runtime-owned secure storage; renderer-facing metadata contains
only setup keys, redacted presence, and missing/optional/required status.

### Explicit Check Safety

A user-triggered Check is diagnostic, not permission to invoke arbitrary tools. It may
connect and list tools. It may call a tool only when the tool is explicitly classified
as safe and side-effect-free by Locus-owned allowlist or official-registry metadata
that the implementation treats as advisory and verifies conservatively.

For all other tools, successful tool-call proof must come from a user-initiated real
agent run.

### Provenance And Preview Schema

Every install preview includes at least:

- Registry provider ID and entry ID.
- Entry name, version/ref, source URL, package/distribution identifier when present.
- Whether the version/ref is immutable, mutable, or unknown.
- Integrity hash or package hash when the registry provides one.
- Command or URL template, args, cwd, transport type.
- Env schema, header schema, auth/bearer token env references.
- Declared runtime support from the registry.
- Adapter-derived installability by runtime.
- Entry fingerprint and config fingerprint.
- Mutable/unpinned risk warnings.

Mutable refs such as `latest`, branch names, unresolved tags, or missing integrity
metadata may still be installed when the user confirms the risk, but they do not
become "Locus verified template" provenance. Local runtime verification still proves
only the exact entry/config fingerprint observed on this machine.

### Management-Time Is Inert

Browse, preview, and install must not execute the registry server command, start a
package manager or Docker image for that server, launch the MCP server, or call MCP
tools. The service may fetch registry metadata and may call runtime-owned config
writers that only write or stage configuration.

Runtime launch and MCP tool calls happen only during an explicit agent run or a
user-triggered Check that satisfies the safety rule above.

### Plugin MCP Ownership

This change depends on `add-runtime-native-plugin-execution` landing its Plugin MCP
ownership rule first.

Registry-sourced MCP servers are MCP-only. Plugin-sourced MCP servers may be shown
in the MCP tab with source attribution, but approve/revoke/enable ownership follows
Plugins. This change must not re-create plugin MCP approval controls.

## Risks / Trade-offs

- **Official registry entries may be broken or stale.** Mitigation:
  install/unverified split, local verification, clear failure reasons, no verified
  label from registry claims.
- **Official registry schema may not provide enough stable fields.** Mitigation:
  record the concrete schema before implementation; update the provider decision
  before coding if it cannot support the preview/provenance model.
- **Codex app-server may not meet proof gates.** Mitigation: keep Codex deferred
  rather than fabricating install or verified support; Claude-only registry install
  remains a valid outcome.
- **Mutable provenance still allows risky installs.** Mitigation: explicit warnings,
  entry fingerprints, and no "Locus verified template" claim for mutable refs.
- **Explicit Check could cause side effects.** Mitigation: default to connect/list
  only; allow tool calls only for conservatively classified safe tools.
- **Plugin MCP duplicate controls.** Mitigation: make plugin MCP ownership a
  prerequisite and only display source attribution from this change.

## Migration Plan

1. Confirm `refactor-runtime-mcp-config-service` has landed and routes use the Runtime
   MCP Config service.
2. Confirm `add-runtime-native-plugin-execution` has landed Plugin MCP ownership.
3. Record the official MCP registry API/schema used for the provider adapter.
4. Run Phase-0 observability probes for Claude and Codex app-server.
5. Add official-registry provider adapter and normalized registry entry model.
6. Add `McpRegistryInstallPreview`, provenance/fingerprint classification, required
   setup classification/resolution, redacted preview, and install confirmation.
7. Add MCP tab registry browse/detail/install UI with setup, install, and verification
   states.
8. Add local verification recording and display for Claude.
9. Add Codex app-server registry support only if field-materialization and
   observability proof gates pass; otherwise show Codex deferred/unavailable.
10. Verify with a real Claude run: installed registry server is discovered, connected,
    tools are listed, and at least one tool call succeeds.
11. Verify Codex app-server only if proof gates passed; otherwise record the deferred
    reason.
12. Rollback: remove registry UI/provider/install additions. Existing MCP configs
    remain valid runtime config; manual add/import behavior remains service-owned.

## Open Questions

- None for product scope. Codex support is conditional, not a separate product
  version.
