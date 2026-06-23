## MODIFIED Requirements

### Requirement: Deferred Repository Selection

The system SHALL allow users to defer repository selection during onboarding and
enter the main app shell without a selected project, while keeping
project-dependent repository workflows unavailable until a project is selected.

#### Scenario: User skips repository selection

- **WHEN** the user has completed provider onboarding
- **AND** no valid project is selected
- **AND** the user chooses to select a repository later
- **THEN** the app opens the main shell
- **AND** folderless quick-chat creation remains available as a general assistant
  entry point
- **AND** project-dependent file mentions, diff, terminal, worktree, PR, and
  project MCP workflows remain unavailable until a project is selected or
  attached

#### Scenario: User selects a project after deferring

- **WHEN** the user deferred repository selection
- **AND** later opens, clones, or selects a project
- **THEN** the app records the project as the active project
- **AND** the deferred repository onboarding flag is cleared

#### Scenario: First-run setup offers start context

- **WHEN** first-run onboarding has one usable AI path
- **AND** no valid project is selected
- **THEN** onboarding offers Open Project, Clone from GitHub, and Start Quick chat
  as start-context actions
- **AND** choosing Start Quick chat records repository onboarding as deferred

#### Scenario: Project selection is not mixed with provider setup

- **WHEN** the user changes Claude, Codex, or Provider Profile setup during
  first-run onboarding
- **THEN** project selection and Quick chat deferral remain separate state
- **AND** changing the AI path does not delete a selected project or silently
  clear an intentional project deferral
