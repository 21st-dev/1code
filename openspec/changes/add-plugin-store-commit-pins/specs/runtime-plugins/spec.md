## ADDED Requirements

### Requirement: Plugin Store Commit Pins
The system SHALL model plugin store entries with immutable source pins before install or update approval.

#### Scenario: Store entry has immutable source pin
- **WHEN** Locus previews a store plugin entry with a full commit SHA and bounded package metadata
- **THEN** Locus shows the repo, commit, path, package hash when available, runtime, target mode, and declared capabilities
- **AND** labels the pin as review metadata rather than proof of safety

#### Scenario: Store entry uses mutable source ref
- **WHEN** a store plugin entry uses `latest`, a branch name, an unresolved tag, or another mutable ref for an approved write action
- **THEN** Locus blocks install or update approval
- **AND** reports that an immutable commit pin is required

### Requirement: Store Candidate Review Preview
The system SHALL compute store install and update previews without executing plugin code.

#### Scenario: User previews a store install
- **WHEN** the user opens a not-installed pinned store candidate
- **THEN** Locus computes a bounded candidate review document
- **AND** shows manifest, target mode, source pin, package hash, permissions, MCP declarations, and controlled UI declarations
- **AND** does not write plugin files

#### Scenario: User previews a store update
- **WHEN** an installed plugin has a pinned store update candidate
- **THEN** Locus compares the installed review document with the candidate review document
- **AND** shows bounded diffs for review-relevant fields
- **AND** does not execute candidate plugin code

### Requirement: Exact Candidate Approval
The system SHALL bind store install and update approval to the exact current candidate.

#### Scenario: User approves pinned candidate
- **WHEN** the user approves a store candidate
- **THEN** Locus stores the store entry id, commit pin, package hash when available, candidate fingerprint, and approval timestamp
- **AND** does not approve MCP activation, controlled UI actions, or developer trusted-code execution

#### Scenario: Candidate changes after approval
- **WHEN** the store entry commit, package hash, target mode, permissions, MCP declarations, controlled UI declarations, or candidate fingerprint changes after approval
- **THEN** previous approval no longer authorizes install or update
- **AND** Locus requires a new review of the changed candidate

### Requirement: Store Install And Update Writes
The system SHALL perform store install and update writes only after exact-candidate approval and backup-first validation.

#### Scenario: Approved candidate is installed or updated
- **WHEN** the user installs or updates an approved current candidate
- **THEN** Locus validates the candidate again in the main process
- **AND** backs up replaced package metadata before replacement when an installed package exists
- **AND** writes only paths contained in the intended plugin package directory
- **AND** records installed source pin, package hash, and backup metadata

#### Scenario: Candidate package escapes target directory
- **WHEN** a store candidate package contains path traversal, symlink escape, or files outside the intended plugin package directory
- **THEN** Locus blocks the install or update
- **AND** reports the package containment failure in Doctor/Debug

### Requirement: Store Target Mode Restrictions
The system SHALL prevent remote store entries from enabling developer trusted-code mode.

#### Scenario: Store entry requests developer trusted-code
- **WHEN** a remote store candidate declares `developer-trusted-code`
- **THEN** Locus blocks install or update approval
- **AND** explains that developer trusted-code is only available for explicitly registered local developer directories

#### Scenario: Store entry declares MCP or controlled UI
- **WHEN** a store candidate declares MCP servers or controlled UI contributions
- **THEN** Locus includes those declarations in the candidate review preview
- **AND** keeps MCP approvals and controlled UI action grants separate after install or update

### Requirement: Store Pin Diagnostics
The system SHALL report store pin and candidate review status in Settings > Plugins and Doctor/Debug.

#### Scenario: Store candidate is stale or blocked
- **WHEN** a store candidate approval is stale, mutable, hash-mismatched, missing required hash metadata, or blocked by target-mode policy
- **THEN** Settings > Plugins and Doctor/Debug show the reason
- **AND** do not describe the candidate as verified safe or marketplace trusted
