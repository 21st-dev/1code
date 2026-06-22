## MODIFIED Requirements

### Requirement: Claude Required Target And Codex Honest Fallback

The system SHALL make Claude the required first registry runtime target, and SHALL
allow Codex app-server registry install only for targets whose config fields can be
safely materialized, while capping Codex status below `Verified on Codex` until a
post-execution runtime proof signal exists.

#### Scenario: Claude registry install is accepted

- **WHEN** a registry server is installed to Claude
- **THEN** acceptance requires a real Claude run to discover the server, connect, list
  tools, and successfully call at least one tool

#### Scenario: Codex target can be materialized

- **WHEN** a registry entry's required config fields can be safely materialized by the
  Runtime MCP Config service for Codex app-server
- **AND** required Codex runtime auth or setup resolves true from real Codex
  integration state computed in the main process, not from a renderer-reported flag
- **THEN** the UI offers Codex install and writes config through the Runtime MCP Config
  service together with the registry identity (provider, entry, target, and entry and
  config fingerprints)
- **AND** the installed Codex server is marked `Installed / Unverified` until a runtime
  check or run observes it

#### Scenario: Codex connect and tool-list check succeeds

- **WHEN** a Codex app-server check or run observes a registry-installed remote
  HTTP/SSE/streamable_http server ready with its tools listed
- **AND** the observed server is matched to its stored registry identity rather than a
  bare server name
- **THEN** the UI may mark the Codex server as connected with tools visible
- **AND** it does not display `Verified on Codex`, because the post-execution
  tool-result signal required for verification is not observable
- **AND** the connected state is distinct from `Installed / Unverified` and from
  `verified-local`

#### Scenario: Codex stdio or package target skips the connected check

- **WHEN** a registry-installed Codex server uses a stdio or package-launching transport
- **THEN** the connected check does not start the server process to list its tools
- **AND** the server remains `Installed / Unverified` until a safe launch path is
  defined by a separate explicitly confirmed change

#### Scenario: Codex target cannot be materialized

- **WHEN** Codex app-server cannot represent the entry's required config fields, or a
  required Codex runtime auth or setup cannot be safely materialized
- **THEN** the UI blocks Codex install for that entry and shows a concrete reason
- **AND** it does not silently write an unusable Codex configuration

#### Scenario: Codex never auto-verifies without the post-execution signal

- **WHEN** Codex app-server does not expose a post-execution MCP tool-result signal tied
  to the same server, tool, runtime, entry fingerprint, and config fingerprint
- **THEN** the app does not offer `Verified on Codex`
- **AND** Codex status remains at connected or unverified rather than verified
