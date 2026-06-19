## Why

The MCP tab (`agents-mcp-tab.tsx`) is the healthiest extension surface, but it
only supports manual add and config import. There is no registry-backed way to
browse and install MCP servers. Since MCP is the cross-runtime execution substrate
for Claude and Locus-managed Codex app-server runs, this tab is the right home for
the real extension-store path.

The store bar is not "can browse" or "can write config." The product promise is:
install from a public registry, then the selected runtime can actually use the MCP
server in a real run. At the same time, public registry entries cannot be treated
as proven just because the registry claims compatibility.

This change must build on a clean MCP ownership boundary. Runtime MCP Config
service extraction is a prerequisite and is intentionally kept out of this change
so reviewers can first validate that existing MCP behavior was preserved.

## What Changes

Add an MCP registry install flow to the MCP tab on top of the prerequisite Runtime
MCP Config service.

Core decisions:

- **Service extraction is out of scope here.** `refactor-runtime-mcp-config-service`
  must land first. This change consumes that service; it does not perform the
  route-to-service refactor.
- **Initial registry provider is the official MCP registry.** Implementation records
  the concrete provider API/schema before normalization work begins. If the official
  registry does not expose the required stable read fields, this change blocks until
  the provider decision is updated rather than designing against an imaginary schema.
- **Claude is the required first runtime target.** Claude registry install must prove
  end-to-end use before this change can ship.
- **Codex is a conditional target, not a separate "v1."** Codex app-server support is
  attempted in the same product change, but only opens if proof gates pass. If Codex
  app-server cannot represent required config fields or cannot produce runtime proof,
  Codex install is marked deferred/unavailable and Claude-only registry install may
  still ship.
- **Public registry entries are broadly installable, not broadly verified.** Entries
  from the configured registry are install candidates after schema normalization,
  redacted preview, provenance display, setup classification, and explicit
  confirmation. Installability is separate from verified usability.
- **Install state is not proof.** A successful config write produces
  `Installed / Unverified`. Only local runtime evidence for the exact runtime and
  config fingerprint can upgrade a server to `Verified on Claude` or
  `Verified on Codex`.
- **Missing required setup stays inactive.** If a registry server needs required env,
  header, token, OAuth, local dependency, or runtime auth setup that is not resolved,
  Locus may save it only as `Installed / Needs setup` when the runtime adapter can
  keep it disabled or excluded from runs. If the adapter cannot keep the incomplete
  server inactive, install is blocked until setup is provided.
- **Verification observability is a Phase-0 proof gate.** Before designing automatic
  verified-state upgrades from real runs, Locus must prove that Claude and Codex
  app-server expose enough observable MCP signals. If a runtime does not expose those
  signals, automatic verified upgrades are disabled or narrowed for that runtime.
- **Explicit Check is conservative.** A user-triggered Check may connect and list
  tools. It may call a tool only when the tool is explicitly known to be safe and
  side-effect-free. Otherwise, tool-call proof must come from a user-initiated real
  run.
- **No server code executes during management.** Browse, preview, and install do not
  run the registry server command, start Docker/package managers for that server,
  launch the MCP server, or call MCP tools. Runtime-owned config writers may run only
  to write or stage configuration.
- **Plugin MCP ownership is a prerequisite.** This change starts after
  `add-runtime-native-plugin-execution` lands its Plugin MCP ownership rule.
  Registry-sourced entries are MCP-only. Plugin-sourced MCP servers are shown with
  source attribution but defer approve/revoke/enable ownership to Plugins.

## Capabilities

### New Capabilities

- `mcp-registry-install`: users can browse the official MCP registry, install
  normalized entries to supported runtimes through the Runtime MCP Config service,
  keep install/setup/verified states separate, and verify local runtime usability
  with real runtime evidence.

### Modified Capabilities

<!-- None. Runtime MCP Config ownership is introduced by
     refactor-runtime-mcp-config-service before this change starts. -->

## Impact

- **Renderer:** `agents-mcp-tab.tsx` gains a registry browse/detail/install surface
  and install/verification status states (`Available`, `Installable`,
  `Installed / Unverified`, `Installed / Needs setup`, `Ready to verify`,
  `Failed check`, `Verified on Claude`, `Verified on Codex`, `Codex deferred`).
- **Main:** add official-registry provider adapter, registry normalization,
  `McpRegistryInstallPreview`, setup classification/resolution, install orchestration,
  and local verification state on top of the Runtime MCP Config service.
- **Runtime:** Claude support is required. Codex app-server support is conditional on
  field materialization and observability proof; failure produces a deferred state,
  not a fake verified label.
- **Security/trust:** install is an explicit trust action with provenance,
  command/URL preview, env/header schema, entry fingerprint, mutable-ref risk
  disclosure, and secret redaction. It authorizes code that may run later during an
  agent run.
- **Dependency:** implementation begins after `refactor-runtime-mcp-config-service`
  and `add-runtime-native-plugin-execution` land.
