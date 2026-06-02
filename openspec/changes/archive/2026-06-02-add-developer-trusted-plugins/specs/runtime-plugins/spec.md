## ADDED Requirements

### Requirement: Developer Trusted Plugin Mode
The system SHALL provide a developer trusted-code plugin mode that is available only for explicitly registered local developer plugin directories.

#### Scenario: User opens a local developer plugin
- **WHEN** the user registers a local developer plugin directory
- **THEN** Locus parses the developer plugin manifest without executing plugin code
- **AND** labels the plugin target mode as `developer-trusted-code`
- **AND** states that this mode is equivalent to running local code
- **AND** does not present the plugin as sandboxed, marketplace trusted, or Codex++ compatible

#### Scenario: Remote or cache package requests developer trust
- **WHEN** a remote marketplace, Codex cache, or ordinary runtime plugin package declares developer trusted-code metadata
- **THEN** Locus ignores the trusted-code request
- **AND** does not load executable plugin code from that package

### Requirement: Developer Trusted Plugin Gates
The system SHALL load developer trusted plugin code only when all current trust gates pass in the main process.

#### Scenario: Developer plugin is reviewed and trusted
- **WHEN** Developer Plugin Mode is enabled
- **AND** plugin safe mode is disabled
- **AND** the developer plugin manifest and entrypoint resolve inside the plugin directory
- **AND** the current plugin fingerprint is locally reviewed
- **AND** the current plugin fingerprint has a per-plugin trust acknowledgement
- **THEN** Locus may load the declared developer plugin entrypoint

#### Scenario: Developer plugin gate fails
- **WHEN** Developer Plugin Mode is disabled, plugin safe mode is enabled, the plugin fingerprint is new or changed, the trust acknowledgement is missing or stale, or the entrypoint escapes the plugin root
- **THEN** Locus does not import the developer plugin entrypoint
- **AND** reports the blocking reason in Settings > Plugins and Doctor/Debug

### Requirement: Developer Trust Review Binding
The system SHALL bind developer plugin trust acknowledgements to the current reviewed plugin fingerprint and executable content fingerprint.

#### Scenario: Developer plugin changes after trust
- **WHEN** the developer plugin manifest, entrypoint metadata, source pins, or review-relevant plugin metadata changes
- **THEN** previous trust acknowledgement no longer authorizes loading
- **AND** Locus requires the user to review and trust the new fingerprint before loading code

#### Scenario: Developer plugin entrypoint changes after trust
- **WHEN** the developer plugin entrypoint file content changes while manifest metadata stays the same
- **THEN** previous trust acknowledgement no longer authorizes loading
- **AND** Locus reports that executable content changed

#### Scenario: User revokes developer trust
- **WHEN** the user revokes trust for a developer plugin
- **THEN** Locus prevents future loads and invocations for that plugin
- **AND** preserves review history and plugin files

### Requirement: Developer Plugin Permission Disclosure
The system SHALL disclose developer plugin permissions as review metadata, not as same-process sandbox enforcement.

#### Scenario: Developer plugin declares permissions
- **WHEN** a developer plugin declares permissions or capabilities
- **THEN** Locus displays those declarations for review
- **AND** states that same-process developer plugin code is not confined by those labels
- **AND** does not describe the permissions as a security sandbox

### Requirement: Developer Plugin Recovery And Diagnostics
The system SHALL keep safe mode and Doctor/Debug available as recovery and diagnostic surfaces for developer trusted plugins.

#### Scenario: Safe mode is enabled before startup
- **WHEN** plugin safe mode is enabled
- **THEN** Locus blocks developer plugin loading before any entrypoint import
- **AND** still allows the user to view plugin metadata, diagnostics, and trust state
- **AND** allows the user to disable Developer Plugin Mode or revoke plugin trust

#### Scenario: Forced safe mode is requested before startup
- **WHEN** the user starts Locus with a forced safe-mode startup override
- **THEN** Locus blocks developer plugin loading before any entrypoint import
- **AND** keeps the core UI available for recovery actions

#### Scenario: Developer plugin fails to load
- **WHEN** a trusted developer plugin entrypoint fails during load
- **THEN** Locus records a bounded load error in Doctor/Debug
- **AND** does not dump plugin source code, provider secrets, OAuth tokens, or MCP secret values to the renderer

### Requirement: Developer Plugin UI Warnings
The system SHALL make the full-trust nature of developer plugins visible before trust is granted.

#### Scenario: User reviews developer plugin trust
- **WHEN** the user opens the trust panel for a developer plugin
- **THEN** Locus shows the local path, manifest identity, current fingerprint, trust status, and safe-mode status
- **AND** warns that trusting the plugin may run local code on this machine
- **AND** requires an explicit user action before storing the trust acknowledgement
