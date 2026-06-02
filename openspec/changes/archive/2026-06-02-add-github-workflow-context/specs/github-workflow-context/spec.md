## ADDED Requirements

### Requirement: GitHub Workflow Status
The system SHALL detect GitHub workflow readiness for the currently selected local project or worktree without storing GitHub credentials in Locus.

#### Scenario: GitHub CLI is authenticated
- **WHEN** the selected project has a GitHub remote and the user's local `gh` is installed and authenticated
- **THEN** the app shows GitHub workflow context as available
- **AND** it shows the current branch and repository identity
- **AND** it does not read, request, or persist a GitHub access token

#### Scenario: GitHub CLI is missing
- **WHEN** the selected project has a GitHub remote but `gh` is not available in the app shell environment
- **THEN** the app shows that GitHub workflow context is unavailable because GitHub CLI is missing
- **AND** it does not attempt GitHub API calls through another credential path

#### Scenario: GitHub CLI is not authenticated
- **WHEN** the selected project has a GitHub remote and `gh` is installed but unauthenticated
- **THEN** the app shows an unauthenticated state
- **AND** it offers an explicit path to run `gh auth login` outside Locus-managed credential storage

#### Scenario: Project is not a GitHub repository
- **WHEN** the selected project does not have a GitHub remote
- **THEN** the app does not show GitHub issue, pull request, checks, or review-comment actions as available for that project

### Requirement: Current Pull Request Context
The system SHALL provide read-only current pull request context for the selected branch when a matching GitHub pull request exists.

#### Scenario: Current branch has a pull request
- **WHEN** the user opens GitHub workflow context for a branch with a matching pull request
- **THEN** the app shows the pull request number, title, URL, state, base branch, review decision, and checks summary
- **AND** the app provides an explicit action to attach that pull request context to the active agent conversation

#### Scenario: Current branch has no pull request
- **WHEN** the user opens GitHub workflow context for a branch without a matching pull request
- **THEN** the app shows that no pull request is associated with the current branch
- **AND** read-only pull request actions remain unavailable until a pull request exists or the user imports a pull request URL

#### Scenario: User sends pull request context to an agent
- **WHEN** the user chooses to send pull request context to the active agent conversation
- **THEN** the app attaches a bounded normalized context block or attachment
- **AND** the selected runtime remains unchanged
- **AND** Claude Code, Codex, and provider-profile-backed runs receive the same normalized pull request context

### Requirement: GitHub Issue and Pull Request Import
The system SHALL let users import a GitHub issue or pull request URL as an agent-ready task without changing the selected runtime.

#### Scenario: User imports a GitHub issue URL
- **WHEN** the user submits a valid GitHub issue URL for the current repository or an explicitly accepted GitHub repository URL
- **THEN** the app loads the issue title, number, URL, state, labels, body summary, and comments summary
- **AND** it renders an issue task card that can be sent to the active agent conversation

#### Scenario: User imports a GitHub pull request URL
- **WHEN** the user submits a valid GitHub pull request URL
- **THEN** the app loads the pull request title, number, URL, state, base/head branches, body summary, checks summary, and review summary
- **AND** it renders a pull request task card that can be sent to the active agent conversation

#### Scenario: User submits an invalid or unsupported URL
- **WHEN** the user submits a URL that is not a supported GitHub issue or pull request URL
- **THEN** the app rejects the import
- **AND** it explains that the URL must point to a GitHub issue or pull request
- **AND** no agent conversation is started automatically

### Requirement: Checks and CI Log Context
The system SHALL expose bounded read-only check and CI log context for a pull request so users can hand failing-check evidence to an agent.

#### Scenario: Pull request checks are available
- **WHEN** a pull request has check runs or workflow runs visible through the user's GitHub CLI authentication
- **THEN** the app shows a checks summary with pass, fail, pending, and skipped states where available
- **AND** failing checks provide an explicit action to load more detail

#### Scenario: User attaches a failing check log
- **WHEN** the user chooses to send a failing check log to the active agent conversation
- **THEN** the app loads a bounded relevant log excerpt
- **AND** it redacts known secret-like values before attachment
- **AND** it attaches the log context only after the user selects the check

#### Scenario: CI log is too large
- **WHEN** a CI log exceeds the configured GitHub context size limit
- **THEN** the app truncates or summarizes the log using a deterministic boundary
- **AND** the attached context clearly indicates that the log was truncated

### Requirement: Review Feedback Context
The system SHALL expose unresolved pull request review feedback as read-only agent context.

#### Scenario: Pull request has unresolved review comments
- **WHEN** a pull request has review comments visible through the user's GitHub CLI authentication
- **THEN** the app shows the comments grouped by file or conversation where available
- **AND** each group can be selected for agent context handoff

#### Scenario: User sends review comments to an agent
- **WHEN** the user selects review comments and sends them to the active agent conversation
- **THEN** the app attaches the selected comments with pull request number, file path, comment author, comment text, and relevant diff hunk where available
- **AND** the app does not automatically reply to or resolve GitHub review threads

### Requirement: User-Confirmed Draft Pull Request Creation
The system SHALL support draft pull request creation only after the user reviews and confirms the final request.

#### Scenario: User prepares a draft pull request
- **WHEN** the selected branch has local commits or diff suitable for a pull request
- **THEN** the app may prepare a pull request title, body, base branch, and draft setting for user review
- **AND** no GitHub pull request is created during preparation

#### Scenario: User confirms draft pull request creation
- **WHEN** the user confirms the final pull request title, body, base branch, and draft setting
- **THEN** the app creates the pull request through the user's local GitHub CLI authentication
- **AND** it shows the created pull request URL
- **AND** it refreshes the current pull request context

#### Scenario: User cancels draft pull request creation
- **WHEN** the user cancels before confirmation
- **THEN** the app does not run a pull request creation command
- **AND** no GitHub mutation occurs

### Requirement: Runtime-Agnostic GitHub Context Boundary
The system SHALL keep GitHub workflow context as a Locus platform capability rather than a Claude Code-only or Codex-only feature.

#### Scenario: User switches runtimes before sending context
- **WHEN** GitHub context is loaded and the user switches the active runtime from Claude Code to Codex or a provider-profile-backed agent
- **THEN** the loaded GitHub context remains available
- **AND** sending the context uses the same normalized content regardless of runtime

#### Scenario: Runtime has native GitHub support
- **WHEN** the selected runtime also has native GitHub features
- **THEN** Locus may still provide its own GitHub context cards
- **AND** the app must not require users to enable that runtime's native GitHub integration before using Locus GitHub workflow context
