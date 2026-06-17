## ADDED Requirements

### Requirement: Details Default Layout
The Details sidebar SHALL apply an environment-first default widget order and default visibility, without overriding a user's persisted order or visibility.

#### Scenario: Default order on a workspace with no stored preference
- **WHEN** a project workspace has no persisted Details widget order
- **THEN** the default order is environment-first (workspace info, then changes/diff, then todo and plan, then mcp/trace/usage/error, with terminal and browser as lower launchers)

#### Scenario: User preference is respected
- **WHEN** the user has a persisted widget order or visibility for a workspace
- **THEN** the default is not applied over it

### Requirement: Details Auto-Open Policy
Opening of the Details sidebar SHALL distinguish an explicit user action from a context auto-open, and only the context auto-open path is policy-gated.

#### Scenario: Explicit user action still opens
- **WHEN** the user explicitly opens or expands a Details widget
- **THEN** the panel opens as before
- **AND** the policy gates only context auto-open, not user actions

#### Scenario: Allowed context auto-open events
- **WHEN** a plan is produced or a run error occurs
- **THEN** the context auto-open path may open the panel and expand the relevant widget

#### Scenario: Context auto-open respects a user-collapsed panel and quick chat
- **WHEN** the user has collapsed the Details panel, or the chat is a folderless quick chat
- **THEN** context events do not force the panel open

### Requirement: Terminal Default Placement
The terminal SHALL default to the bottom panel as its primary surface, with the Details terminal widget acting as a compact launcher/status.

#### Scenario: Default terminal surface
- **WHEN** the user opens the terminal with no persisted preference
- **THEN** it opens in the bottom panel
- **AND** the Details terminal widget launches or focuses that bottom terminal rather than hosting a separate session

#### Scenario: Persisted terminal mode is normalized
- **WHEN** a returning user has a persisted terminal display mode
- **THEN** it is normalized to a valid surface without a hard reset

### Requirement: Quick-Chat Details Degradation
IF a Details inspector is shown for a folderless chat, it SHALL show only runtime-relevant widgets and no repository widgets. This requirement does not by itself mandate showing a Details panel for folderless chats.

#### Scenario: Details shown for a folderless chat is restricted
- **WHEN** a Details inspector is shown for a folderless chat
- **THEN** it shows only usage, trace, and error widgets
- **AND** it does not show info, diff, terminal, mcp, plan, browser, or the file surface
- **AND** this matches the formal quick-chat surface scope

#### Scenario: Folderless gating uses workspace-kind semantics
- **WHEN** the implementation decides Details content for a folderless chat
- **THEN** it uses the existing folderless / missing-worktree semantics rather than a hard `projectId === null` check

#### Scenario: No forced panel
- **WHEN** a folderless quick chat does not otherwise show a Details inspector
- **THEN** this requirement does not force one to open

### Requirement: Workspace Environment Provenance Split
Static workspace environment state SHALL be displayed primarily in the Details panel, while message-level git provenance remains in the chat stream.

#### Scenario: Static environment state
- **WHEN** the user views current workspace environment state (project, branch, diff summary, terminal, file, browser)
- **THEN** the Details panel is the primary display and the chat stream does not duplicate that static readout

#### Scenario: Message-level provenance is preserved
- **WHEN** a turn produces git activity such as a commit, a PR, or a file change
- **THEN** the in-chat git-activity badge for that message is preserved as provenance and a jump entry
- **AND** it is not removed by the environment de-duplication
