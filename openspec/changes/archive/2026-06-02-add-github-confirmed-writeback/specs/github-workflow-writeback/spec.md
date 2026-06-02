## ADDED Requirements

### Requirement: Confirmed GitHub Write-Back Boundary
The system SHALL execute GitHub write-back actions only after the user explicitly confirms the exact action and target in Locus.

#### Scenario: User confirms a GitHub mutation
- **WHEN** the user reviews a write-back action that shows the repository, pull request number, action type, and user-visible text or state change
- **AND** the user confirms the action
- **THEN** the app executes the GitHub mutation through the user's local `gh` authentication
- **AND** it does not store a GitHub token in Locus

#### Scenario: User cancels a GitHub mutation
- **WHEN** the user cancels the confirmation dialog before final confirmation
- **THEN** the app does not execute any GitHub write-back command
- **AND** no public GitHub state is changed

#### Scenario: GitHub write-back is unavailable
- **WHEN** `gh` is missing, unauthenticated, the selected project is not a GitHub repository, or no pull request target is available
- **THEN** the app disables write-back actions
- **AND** it explains the missing requirement inline

### Requirement: Pull Request Comment Write-Back
The system SHALL let users post an editable comment to the current pull request after confirmation.

#### Scenario: User posts a pull request comment
- **WHEN** the user opens a pull request comment write-back action
- **THEN** the app shows an editable comment body and the target pull request
- **AND** the app posts the comment only after final confirmation
- **AND** it shows success with a GitHub URL or clear completion state when available

#### Scenario: Pull request comment body is empty
- **WHEN** the comment body is empty or whitespace-only
- **THEN** the app prevents confirmation
- **AND** it does not run a GitHub mutation

### Requirement: Review Thread Reply Write-Back
The system SHALL let users reply to a loaded unresolved review thread after confirmation.

#### Scenario: User replies to a review thread
- **WHEN** the user opens a reply action for a loaded unresolved review thread
- **THEN** the app shows the file path, thread context, editable reply body, and target pull request
- **AND** the app posts the reply only after final confirmation
- **AND** it does not automatically resolve the review thread

#### Scenario: Review thread target is missing
- **WHEN** the selected review thread does not have a GitHub thread identifier
- **THEN** the app disables the reply action
- **AND** it explains that the thread cannot be written back from the loaded context

### Requirement: Pull Request State Write-Back
The system SHALL let users mark a draft pull request ready for review and request reviewers only after confirmation.

#### Scenario: User marks a draft pull request ready
- **WHEN** the current pull request is a draft
- **AND** the user confirms "mark ready for review"
- **THEN** the app marks the pull request ready through `gh`
- **AND** it refreshes the current pull request context

#### Scenario: User requests reviewers
- **WHEN** the user enters one or more reviewer logins and confirms the request
- **THEN** the app requests those reviewers through `gh`
- **AND** it shows success or an inline error tied to the reviewer request action

#### Scenario: Reviewer list is empty
- **WHEN** the reviewer list is empty or only contains invalid empty entries
- **THEN** the app prevents confirmation
- **AND** it does not run a GitHub mutation

### Requirement: Write-Back Result Handling
The system SHALL show write-back results and failures in the GitHub workflow UI.

#### Scenario: GitHub write-back succeeds
- **WHEN** a confirmed GitHub write-back action succeeds
- **THEN** the app shows the result inline on the relevant GitHub card
- **AND** it refreshes related current PR or review-comment context where useful

#### Scenario: GitHub write-back fails
- **WHEN** a confirmed GitHub write-back action fails
- **THEN** the app shows a normalized inline error
- **AND** it avoids exposing raw command output unless it has been bounded and redacted
