## ADDED Requirements

### Requirement: Automatic Continuity Pack Injection
The system SHALL automatically inject continuity context into every model call for plan and agent modes.

#### Scenario: Build packs on code-oriented request
- **WHEN** a user submits a coding request in an active sub-chat
- **THEN** the system builds an Anchor Pack and a budgeted Context Pack
- **AND** injects both into the model call without requiring manual user action

#### Scenario: Incremental iteration reuses prior context
- **WHEN** a subsequent request is part of the same task fingerprint and repo state is unchanged
- **THEN** the system reuses cached context pack artifacts where valid
- **AND** injects a Delta Pack containing only changed context since the previous run

### Requirement: Hash-Based Continuity Caching
The system SHALL cache file summaries, search results, and rendered context packs using repo-aware hash keys with deterministic invalidation.

#### Scenario: File cache hit
- **WHEN** the requested file key `(repoRoot, filePath, blob/content hash)` exists and is valid
- **THEN** the system uses cached file summary/content metadata
- **AND** skips redundant file parse/summarize work

#### Scenario: Context pack invalidation
- **WHEN** head commit or changed-files hash differs from the key used to render a cached context pack
- **THEN** the cached context pack is considered invalid
- **AND** the system rebuilds and stores a new pack

### Requirement: Automatic Memory Capture on Meaningful Events
The system SHALL automatically capture structured memory artifacts when high-signal development events occur.

#### Scenario: Boundary-impacting refactor
- **WHEN** a run modifies boundary modules or invariants
- **THEN** the system drafts a snapshot artifact set including devlog entry and ADR stub
- **AND** stores artifacts with provenance linking to the run/session

#### Scenario: Direction change capture
- **WHEN** a previously active approach is abandoned during execution
- **THEN** the system drafts a rejected-approach note
- **AND** links it to the relevant task fingerprint

### Requirement: Governor-Based Snapshot and Rehydrate
The system SHALL monitor pressure signals and automatically trigger snapshot/rehydrate actions.

#### Scenario: Pressure remains low
- **WHEN** pressure metrics stay below configured thresholds
- **THEN** governor action is `ok`
- **AND** execution continues without session turnover

#### Scenario: Rehydrate trigger
- **WHEN** pressure metrics exceed rehydrate threshold
- **THEN** the system snapshots structured state
- **AND** starts a fresh continuation context carrying only structured state plus continuity packs

### Requirement: Budget and Rate-Limit Controls
The system SHALL enforce context budgeting and request-efficiency controls during continuity operations.

#### Scenario: New context exceeds budget
- **WHEN** proposed new context exceeds per-call new-context byte budget
- **THEN** the system trims lower-priority items
- **AND** preserves anchor and highest-priority delta/context items

#### Scenario: Rapid repeated edits
- **WHEN** repo/watcher events occur in bursts
- **THEN** the system debounces pack rebuilds by repo-state hash and task fingerprint
- **AND** avoids rebuilding packs for equivalent state

### Requirement: Safe Default Artifact Write Policy
The system SHALL default to writing memory artifacts without automatically committing them to active feature branches.

#### Scenario: Default policy
- **WHEN** artifacts are generated automatically
- **THEN** they are persisted locally in draft/managed form
- **AND** no automatic commit is made to the current feature branch

#### Scenario: Optional isolated commit path
- **WHEN** an operator enables automatic commits for memory artifacts
- **THEN** commits are restricted to a dedicated memory branch policy
- **AND** feature branches remain protected from automated artifact commits
