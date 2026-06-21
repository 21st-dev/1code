# mcp-registry-install Specification

## Purpose
Define registry-backed MCP browsing, install, setup, and local verification
semantics while keeping Claude proof, Codex deferred states, and runtime MCP
ownership explicit.
## Requirements
### Requirement: Prerequisite MCP Ownership

Registry install SHALL use the Runtime MCP Config service created by
`refactor-runtime-mcp-config-service` and SHALL NOT reintroduce route-local MCP
config business logic.

#### Scenario: Registry install uses the service owner

- **WHEN** the renderer previews, installs, checks, or verifies a registry MCP server
- **THEN** the request is routed through the Runtime MCP Config service and its
  runtime adapters
- **AND** registry install does not add a second Claude or Codex route-local MCP
  write/status implementation

### Requirement: Official Registry Provider

The system SHALL use the official MCP registry as the initial registry provider, with
normalization based on the provider's concrete API/schema.

#### Scenario: Provider schema is recorded before implementation

- **WHEN** implementation begins registry normalization
- **THEN** the official MCP registry list/search/detail API shape and entry fields are
  recorded
- **AND** normalization, provenance, setup, and preview logic are based on that real
  schema rather than a hypothetical registry model

#### Scenario: Provider cannot support required fields

- **WHEN** the official MCP registry cannot provide the stable fields required for
  install preview, provenance, setup classification, or fingerprints
- **THEN** implementation stops before registry install is exposed
- **AND** the provider decision is updated through OpenSpec before continuing

### Requirement: Runtime Proof Gates

The system SHALL prove runtime observability and adapter field support before claiming
verified registry support for a runtime.

#### Scenario: Claude observability is probed first

- **WHEN** Claude registry verification is implemented
- **THEN** Locus first proves whether Claude Agent SDK runs expose MCP connection,
  tool-list, and successful tool-call signals that can be recorded
- **AND** automatic `Verified on Claude` upgrades are limited to signals Locus can
  truthfully observe

#### Scenario: Codex app-server proof gates must pass

- **WHEN** Codex app-server registry support is implemented
- **THEN** Locus first proves the app-server adapter can represent required registry
  config fields and that app-server runs expose the required MCP proof signals
- **AND** if either proof gate fails, Codex registry support is marked deferred or
  unavailable rather than verified

### Requirement: Claude Required Target And Codex Honest Fallback

The system SHALL make Claude the required first registry runtime target and SHALL keep
Codex app-server support conditional on proof.

#### Scenario: Claude registry install is accepted

- **WHEN** a registry server is installed to Claude
- **THEN** acceptance requires a real Claude run to discover the server, connect, list
  tools, and successfully call at least one tool

#### Scenario: Codex cannot be proven

- **WHEN** Codex app-server cannot represent required registry fields or cannot produce
  end-to-end runtime proof
- **THEN** the UI marks Codex registry support as deferred or unavailable
- **AND** the app does not offer `Verified on Codex` or imply Codex registry support is
  complete
- **AND** Claude-only registry install may still ship

### Requirement: Public Registry Installability Is Separate From Verified Usability

The system SHALL allow normalized official-registry entries to be installed after
preview and confirmation, but SHALL NOT present install success as verified runtime
usability.

#### Scenario: Registry entry installs as unverified

- **WHEN** a user confirms installation of a normalized registry entry
- **AND** all required setup is already resolved
- **THEN** the app writes or stages the runtime MCP configuration through the Runtime
  MCP Config service
- **AND** the server is marked `Installed / Unverified` for that runtime and entry
  fingerprint until local runtime proof exists

#### Scenario: Registry claim remains declared metadata

- **WHEN** a registry entry declares support for Claude, Codex, or another runtime
- **THEN** the UI may display that claim as declared metadata
- **AND** it does not display `Verified on Claude` or `Verified on Codex` from the
  registry claim alone

### Requirement: Required Setup Keeps Registry Servers Inactive

The system SHALL prevent registry-installed MCP servers with missing required setup
from becoming active in any runtime run.

#### Scenario: Preview shows missing required setup

- **WHEN** a registry entry requires env, header, token, OAuth, local dependency, or
  runtime auth setup
- **THEN** the install preview shows the required and optional setup keys, missing
  setup keys, and runtime setup blockers
- **AND** renderer-facing metadata redacts secret values and exposes only keys,
  redacted presence, required/optional status, and missing/resolved status

#### Scenario: Missing setup can be saved inactive

- **WHEN** required setup is missing
- **AND** the target runtime adapter can keep the incomplete server disabled or
  excluded from runs
- **THEN** Locus may save the server as `Installed / Needs setup`
- **AND** the server is not included in Claude or Codex app-server runs, not launched,
  and not connected until required setup is resolved

#### Scenario: Missing setup blocks install when inactive state is unavailable

- **WHEN** required setup is missing
- **AND** the target runtime adapter cannot safely keep the incomplete server disabled
  or excluded from runs
- **THEN** installation is blocked before writing active runtime config
- **AND** the UI reports the missing required setup keys

#### Scenario: Setup resolved before verification or runtime inclusion

- **WHEN** all required setup for an installed registry server is resolved
- **THEN** the server becomes `Ready to verify`
- **AND** it may be included only in a user-triggered Check or a real run that can
  produce local runtime proof

### Requirement: Local Runtime Verification

The system SHALL upgrade a registry-installed MCP server to verified status only from
local runtime evidence for the exact runtime and config fingerprint.

#### Scenario: Claude runtime proof is observed

- **WHEN** a Claude run discovers a registry-installed MCP server, connects to it,
  lists its tools, and successfully calls at least one tool
- **AND** the Phase-0 observability probe showed Locus can record those signals
- **AND** the observed tool result does not carry a runtime or domain-level error
  marker
- **THEN** the app records `Verified on Claude` for the local machine, server,
  runtime, entry fingerprint, and config fingerprint

#### Scenario: Codex app-server runtime proof is observed

- **WHEN** a Locus-managed Codex app-server run discovers a registry-installed MCP
  server, connects to it, lists its tools, and successfully calls at least one tool
- **AND** Codex app-server field-materialization and observability proof gates passed
- **THEN** the app records `Verified on Codex` for the local machine, server,
  runtime, entry fingerprint, and config fingerprint

#### Scenario: Verification is not safe or has not happened

- **WHEN** a server is installed but no safe verification action or real run has
  produced a successful tool call
- **THEN** the server remains `Installed / Unverified`
- **AND** the UI does not imply that the server has been proven usable

### Requirement: Explicit Check Is Safe By Default

The system SHALL keep user-triggered Check actions side-effect-safe by default.

#### Scenario: Check lists tools without invoking them

- **WHEN** the user runs Check for a registry-installed MCP server
- **THEN** Locus may connect to the server and list tools
- **AND** Check does not call arbitrary MCP tools by default

#### Scenario: Check calls only safe tools

- **WHEN** Check would call an MCP tool
- **THEN** the tool must be explicitly classified as safe and side-effect-free before
  invocation
- **AND** otherwise tool-call proof must come from a user-initiated real run

### Requirement: Registry Install Preview And Provenance

The system SHALL create a registry-specific install preview with provenance,
fingerprints, config details, runtime installability, setup state, and redacted secret
metadata before writing runtime config.

#### Scenario: User previews a registry install

- **WHEN** the user selects a registry entry for installation
- **THEN** the preview includes registry provider ID, entry ID, version/ref, source
  URL, package or distribution identifier when present, command or URL template,
  args, cwd, transport type, env schema, header schema, auth metadata, declared
  runtime support, adapter-derived installability, setup state, entry fingerprint,
  config fingerprint, and write targets
- **AND** env/header/token values are redacted from renderer-facing metadata

#### Scenario: Entry uses mutable or unknown provenance

- **WHEN** a registry entry uses `latest`, a branch name, an unresolved tag, a missing
  integrity hash, or unknown source pinning
- **THEN** the preview labels the provenance as mutable or unknown
- **AND** the user may explicitly confirm installation, but the entry is not presented
  as a pinned or Locus-verified template

#### Scenario: Import preview semantics remain unchanged

- **WHEN** registry install needs redacted preview behavior
- **THEN** it may reuse redaction primitives from MCP import preview
- **AND** it uses a registry-specific preview/apply flow rather than adding apply or
  enable semantics to `runtime-mcp-import-preview`

### Requirement: Management-Time Does Not Execute MCP Server Code

The system SHALL keep browse, preview, and install inert with respect to the target
MCP server while allowing runtime-owned config writers that only write or stage
configuration.

#### Scenario: Browse preview and install are inert

- **WHEN** the user browses, previews, or installs a registry MCP server
- **THEN** the app does not run the registry server command, start a package manager
  for that server, start Docker for that server, launch the MCP server, or call MCP
  tools

#### Scenario: Config writer is allowed

- **WHEN** the confirmed install writes runtime MCP configuration
- **THEN** the app may call a runtime-owned config writer or equivalent service adapter
- **AND** that writer must not launch the target MCP server as part of install

### Requirement: Plugin MCP Ownership Alignment

The system SHALL treat registry-sourced MCP servers as MCP-only extensions and SHALL
align plugin-sourced MCP display with the Plugin MCP ownership delivered by
`add-runtime-native-plugin-execution`.

#### Scenario: Registry-sourced server stays MCP-only

- **WHEN** a server was installed from the public registry
- **THEN** it is managed in the MCP surface as an MCP-only extension
- **AND** it is not listed in Plugins as a plugin execution item

#### Scenario: Plugin-sourced server defers to Plugins

- **WHEN** an MCP server shown in the MCP surface originates from a plugin
- **THEN** the MCP surface shows the plugin source
- **AND** approve, revoke, enable, and disable ownership follows the Plugins surface
  instead of a second independent MCP control
