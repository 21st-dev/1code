## ADDED Requirements

### Requirement: Plugin Target Mode Classification
The system SHALL classify each discovered runtime plugin package with a Locus target mode that describes how Locus may use it.

#### Scenario: Existing runtime packages are metadata-only
- **WHEN** Locus discovers existing Claude Code or Codex plugin packages
- **THEN** each package is classified as `manifest-only`
- **AND** Locus may display metadata, component lists, source paths, and MCP declarations
- **AND** Locus does not execute arbitrary plugin JavaScript for that package

#### Scenario: Future controlled UI mode is unavailable
- **WHEN** a plugin would require Locus-owned settings pages, workbench panels, or command buttons
- **THEN** the package is not shown as executable through `controlled-ui`
- **AND** the UI explains that controlled UI execution requires a future approved Locus extension surface

#### Scenario: Future developer trusted code mode is unavailable
- **WHEN** a plugin would require local trusted code execution
- **THEN** the package is not shown as enabled through `developer-trusted-code`
- **AND** the UI does not imply that declared permissions sandbox local code

### Requirement: Reference-Only Codex++ Learning Boundary
The system SHALL treat Codex++ as a reference repository for governance patterns rather than a Locus plugin runtime dependency.

#### Scenario: Codex++ concepts are reviewed
- **WHEN** maintainers compare Codex++ with Locus
- **THEN** manifest metadata, safe mode, doctor/debug, reviewed commit pins, advisory updates, per-plugin data, and MCP declaration patterns may be tracked as learnable patterns
- **AND** app patching, re-signing, DOM patching, watcher repair, main-process tweak execution, native bridge defaults, and local-code-as-safe-plugin claims are excluded from direct adoption

#### Scenario: Codex++ repository is updated
- **WHEN** the Codex++ reference repository changes
- **THEN** Locus maintainers classify changes as learn, backlog, or ignore
- **AND** Locus does not change plugin execution behavior until a Locus OpenSpec change approves it

### Requirement: Plugin Update Review Guidance
The system SHALL provide review guidance for plugin and runtime updates without automatically installing or enabling new execution surfaces.

#### Scenario: Plugin metadata changes
- **WHEN** a plugin manifest, target mode, permissions, scope, MCP declaration, native capability, filesystem capability, network capability, or shell-related metadata changes
- **THEN** Locus presents the package as requiring review before new capabilities are trusted
- **AND** new MCP declarations remain pending until explicitly approved

#### Scenario: Codex Desktop changes
- **WHEN** Codex Desktop updates outside Locus
- **THEN** Locus plugin target-mode behavior remains independent of Codex++ patch repair state
- **AND** any Codex++ breakage is treated as external reference risk, not a Locus runtime failure

#### Scenario: Codex CLI/runtime changes
- **WHEN** the Codex CLI or runtime changes in a way that affects plugin discovery or execution capability
- **THEN** Locus updates runtime capability status before showing new plugin actions
- **AND** unsupported or degraded Codex plugin execution remains labeled honestly until a safe primitive exists

### Requirement: Target Mode UI Disclosure
The system SHALL show target mode, runtime ownership, trust posture, and execution status in Settings > Plugins.

#### Scenario: User selects a manifest-only plugin
- **WHEN** the user selects a `manifest-only` plugin
- **THEN** Settings > Plugins shows that Locus reads metadata only
- **AND** the detail view does not show controls that imply arbitrary code execution
- **AND** Codex packages remain read-only unless a future Locus-owned execution path exists

#### Scenario: User views plugin sources
- **WHEN** the user views plugin sources
- **THEN** the source detail explains whether the source is local, official, external, cache-backed, or read-only
- **AND** the source detail includes update-review guidance instead of automatic install/update controls

### Requirement: Plugin Recovery And Diagnostics Planning
The system SHALL keep recovery and diagnostics explicit before any plugin execution mode can be enabled.

#### Scenario: Plugin execution is not implemented
- **WHEN** the current plugin target mode is `manifest-only`
- **THEN** diagnostics are limited to metadata, source status, component discovery, and approval state
- **AND** safe-mode language states that arbitrary plugin code is not executed in this change

#### Scenario: Future execution mode is proposed
- **WHEN** a future change proposes `controlled-ui` or `developer-trusted-code` execution
- **THEN** that change must specify startup recovery, safe mode, permission visibility, revocation, logging, tests, and rollback behavior before implementation
