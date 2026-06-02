# command-guide Specification

## Purpose
TBD - created by archiving change add-command-guide. Update Purpose after archive.
## Requirements
### Requirement: Command Guide Settings Surface
The system SHALL provide a read-only Command Guide in Settings that summarizes the local command capabilities available to the user.

#### Scenario: User opens Command Guide
- **WHEN** the user opens Settings > Commands
- **THEN** the app shows Locus slash commands, local command files, runtime CLI command summaries, and plugin-provided command counts
- **AND** the app labels the information as locally detected rather than authoritative provider documentation
- **AND** the app provides official provider documentation links for complete command references and update guidance

#### Scenario: No project is selected
- **WHEN** no project path is selected
- **THEN** the Command Guide still shows global user commands, bundled slash commands, runtime status, and plugin summaries
- **AND** project-scoped commands are labeled as unavailable until a project is selected

#### Scenario: User wants complete official command documentation
- **WHEN** the user needs the full Claude Code or Codex command reference
- **THEN** the Command Guide links to the official provider documentation instead of storing a copied manual
- **AND** it explains that provider documentation and changelogs remain the source of truth for official commands and updates

### Requirement: Official Command Index Snapshot
The system SHALL provide an on-demand official command index snapshot without treating it as a bundled manual or runtime update mechanism.

#### Scenario: User refreshes the official index
- **WHEN** the user clicks the official index update action
- **THEN** the app fetches selected Claude Code and Codex provider Markdown/llms sources
- **AND** parses CLI, slash command, and flag references where present
- **AND** stores the parsed command entries plus source URL, fetch timestamp, hash, and count in a local cache
- **AND** displays the cached snapshot in Settings > Commands

#### Scenario: Official source fetch fails
- **WHEN** a provider source cannot be fetched or parsed
- **THEN** the Command Guide shows the source-specific error state
- **AND** keeps any last cached or partially refreshed command index usable
- **AND** does not block local command detection

#### Scenario: Local runtime and official docs differ
- **WHEN** both local runtime help output and an official CLI snapshot are available
- **THEN** the Command Guide shows the local runtime count next to the official CLI count
- **AND** explains that differences can come from runtime version, bundled runtime lag, platform availability, or provider documentation changes
- **AND** does not imply that updating the official index updates the local runtime executable

### Requirement: Runtime CLI Detection
The system SHALL detect Claude Code and Codex runtime CLI metadata without requiring network access.

#### Scenario: Runtime executable is available
- **WHEN** the runtime executable can be run safely for help and version output
- **THEN** the Command Guide shows the executable path, version, and parsed top-level CLI subcommands
- **AND** the app indicates that the list comes from the local executable help output

#### Scenario: Runtime executable is unavailable
- **WHEN** the runtime executable is missing, non-executable, or times out
- **THEN** the Command Guide shows an unavailable state with the local error or hint
- **AND** the rest of the Command Guide remains usable

### Requirement: Slash Command Entry Point Clarity
The system SHALL make the chat `/` command entrypoint understandable from the command picker itself.

#### Scenario: User types slash in chat input
- **WHEN** the slash command picker opens
- **THEN** it labels the command list as Locus commands
- **AND** it indicates that custom commands come from local command files
- **AND** it does not imply that all provider CLI subcommands are directly executable as chat slash commands

