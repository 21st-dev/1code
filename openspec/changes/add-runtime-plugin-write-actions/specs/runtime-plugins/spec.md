## ADDED Requirements

### Requirement: Runtime Plugin Write Action Preview
The system SHALL preview every runtime-owned plugin marketplace write action before it can run.

#### Scenario: User previews a runtime marketplace action
- **WHEN** the user chooses a Codex or Claude Code marketplace add, update, upgrade, or remove action
- **THEN** the main process maps the typed action id to an allowlisted runtime CLI command
- **AND** returns the exact command, args, runtime, target, destructive flag, impact summary, and confirmation token
- **AND** the renderer does not provide raw command strings or arbitrary args

#### Scenario: User previews a runtime plugin action
- **WHEN** the user chooses a runtime plugin install, update, enable, disable, or uninstall action
- **THEN** the preview names the owning runtime and plugin selector
- **AND** only includes actions supported by that runtime's CLI
- **AND** does not describe the action as a Locus-native install, cross-runtime conversion, or plugin code execution

### Requirement: Confirmed Runtime Plugin Write Execution
The system SHALL execute runtime-owned plugin marketplace writes only after explicit user confirmation.

#### Scenario: User confirms a write action
- **WHEN** the user confirms the exact previewed runtime plugin action
- **THEN** the main process revalidates the action id, target, scope, and confirmation token
- **AND** spawns only the bundled owning runtime CLI with allowlisted args
- **AND** returns redacted stdout, stderr, command diagnostics, and reload guidance
- **AND** refreshes runtime marketplace inventory and plugin diagnostics after a successful write

#### Scenario: Confirmation does not match
- **WHEN** the confirmation token or destructive target confirmation does not match the preview
- **THEN** the system blocks execution before spawning any runtime CLI process
- **AND** reports the action as rejected rather than partially executed

### Requirement: Runtime-Specific Plugin Action Support
The system SHALL expose only runtime-supported plugin write actions.

#### Scenario: Codex plugin actions are shown
- **WHEN** a Codex plugin listing is available
- **THEN** Locus may offer Codex plugin add for not-installed plugins and Codex plugin remove for installed plugins
- **AND** may offer Codex marketplace add, list, upgrade, and remove actions
- **AND** does not show Codex enable, disable, install, or uninstall controls that the Codex CLI does not expose

#### Scenario: Claude plugin actions are shown
- **WHEN** a Claude Code plugin listing is available
- **THEN** Locus may offer Claude plugin install, update, enable, disable, and uninstall controls according to runtime-reported status
- **AND** may offer Claude marketplace add, list, update, and remove actions
- **AND** shows `/reload-plugins` guidance after plugin mutations instead of trying to run the slash command from Locus

### Requirement: Runtime Plugin Write Boundaries
The system SHALL keep runtime-owned plugin writes separate from Locus-native store installs and plugin execution surfaces.

#### Scenario: User performs a runtime write
- **WHEN** Locus runs a confirmed Codex or Claude Code plugin marketplace command
- **THEN** the command changes only that runtime's plugin or marketplace state
- **AND** does not install a Codex plugin into Claude Code or a Claude plugin into Codex
- **AND** does not translate plugin manifests between runtimes
- **AND** does not execute plugin JavaScript, hooks, MCP servers, native modules, app connectors, or developer trusted code in the Locus process

#### Scenario: Runtime write output contains sensitive text
- **WHEN** the runtime CLI writes stdout, stderr, errors, URLs, or environment-like text
- **THEN** Locus redacts tokens, passwords, bearer values, API keys, and credentialed URLs before exposing the output to the renderer
- **AND** Doctor and toast copy do not include raw secrets

## MODIFIED Requirements

### Requirement: Runtime Marketplace Read-Only Actions
The system SHALL keep runtime marketplace browsing read-only by default, while allowing separately confirmed runtime-owned write actions defined by this change.

#### Scenario: User refreshes runtime metadata
- **WHEN** the user refreshes plugins from the Sources or Marketplaces view
- **THEN** the app re-runs bounded read-only runtime inventory commands and local fallback scans
- **AND** does not add marketplaces, update marketplace snapshots, install packages, update packages, remove packages, enable plugins, disable plugins, or execute plugin code merely because the user refreshed

#### Scenario: User opens a write action
- **WHEN** the user chooses a supported runtime-owned marketplace or plugin mutation
- **THEN** the app opens a confirmation preview before any write occurs
- **AND** keeps the action visually separate from Locus-native pinned store installs
