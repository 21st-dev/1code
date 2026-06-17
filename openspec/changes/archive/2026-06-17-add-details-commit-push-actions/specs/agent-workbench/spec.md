## ADDED Requirements
### Requirement: Details Changes Commit And Push Actions
The Details Changes widget SHALL provide first-class commit and push actions for the current project workspace by reusing existing local git and GitHub workflow owners.

#### Scenario: User commits selected changes from Details
- **WHEN** a project chat has local changed files in the Details Changes widget
- **THEN** the widget shows an editable commit message control for the selected files
- **AND** committing uses the existing selected-file commit path rather than a separate git implementation
- **AND** the widget refreshes local diff and sync status after a successful commit

#### Scenario: User publishes or pushes from Details
- **WHEN** the current branch has no upstream or has unpushed commits
- **THEN** the widget shows an explicit publish or push action with the relevant sync count when available
- **AND** the push action uses the existing branch push path
- **AND** a commit does not automatically push unless the user invokes the push action separately

#### Scenario: Expanded diff keeps advanced git actions
- **WHEN** the branch needs pull, force-push, merge, rebase, or other advanced sync actions
- **THEN** the compact Details widget does not add duplicate advanced controls
- **AND** the expanded diff surface remains the owner for those broader git operations

#### Scenario: Draft PR flow remains confirmed
- **WHEN** the user prepares or creates a draft pull request from the Details Changes widget
- **THEN** the widget uses the existing GitHub workflow preparation and confirmation flow
- **AND** no GitHub pull request is created without explicit confirmation
