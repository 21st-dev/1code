## MODIFIED Requirements

### Requirement: Unified Details Inspector Ownership
The unified Details sidebar SHALL be the canonical right-side inspector owner for current-chat details covered by the Details widget registry, including Plan, Diff, Terminal, and the Local Browser.

#### Scenario: Details sidebar renders inspector widgets
- **WHEN** the user opens the Details sidebar for a chat with a local workspace
- **THEN** the sidebar can render workspace, todo, plan, terminal, diff, MCP, trace, usage, and error widgets according to widget availability
- **AND** widgets use the existing widget registry and visibility/order mechanisms rather than ad hoc renderer-owned panels

#### Scenario: Plan, Diff, and Terminal expand through the Details owner
- **WHEN** a user expands Plan, Diff, or Terminal from the Details sidebar
- **THEN** the expanded content is rendered through the DetailsSidebar-owned expanded widget model with one expanded widget active at a time
- **AND** the expanded renderer preserves the behavior of the sidebar it replaces, including plan render/build actions, full diff review and PR actions, and interactive terminal session controls
- **AND** collapsing returns the user to the stacked Details widget view

#### Scenario: Legacy separate inspector sidebars are removed
- **WHEN** this phase ships
- **THEN** Plan, Diff, and Terminal do not have separate user-facing right-side sidebars competing with the Details sidebar
- **AND** the `unifiedSidebarEnabledAtom` rollback flag and the Plan/Diff/Terminal legacy sidebar code path it gated are removed
- **AND** `use-agent-panel-conflicts` coordination is removed rather than replaced by another Plan/Diff/Terminal right-region mutual-exclusion hook

#### Scenario: Local Browser is a Details-owned surface
- **WHEN** the user opens the Local Browser for a chat with a local workspace
- **THEN** it is presented as a Details widget that expands through the Details-owned expanded renderer, not as an independent competing right-side sidebar
- **AND** its independent per-chat open-state and standalone sidebar mount are removed
- **AND** the Local Browser preview boundary, diagnostics capture, and capture-to-chat handoff behavior are preserved

#### Scenario: Folderless quick chats do not expose the Local Browser
- **WHEN** a folderless quick chat (no project) is active
- **THEN** the Local Browser is not offered
- **AND** this matches the established quick-chat surface scope for repository-centric surfaces
