# canonical-entity-vocabulary Specification

## Purpose
TBD - created by archiving change refactor-canonical-vocabulary. Update Purpose after archive.
## Requirements
### Requirement: UI refers to each entity by its single canonical term

User-facing copy MUST refer to each Locus entity by exactly one canonical term —
Project, Workspace, Chat, Quick chat, Agent, Run — and MUST NOT label those
entities with retired synonyms ("sub-chat"/"subchat"/"子对话" for the Chat
entity, or "agent"/"chat" for the Workspace layer). The terms are defined in
`docs/ideas/canonical-vocabulary.md`.

#### Scenario: A retired Chat synonym does not label the Chat entity

- **WHEN** an i18n value (en or zh-CN) names the Chat entity backed by `sub_chats`
- **THEN** it does not use a retired synonym ("sub-chat" / "Sub-chat" / "subchat" /
  "子对话") as the user-facing noun
- **AND** domain-specific text such as GitHub review threads, provider
  conversation history, or generic prose is allowed when it is not naming the
  `sub_chats` entity

#### Scenario: The worktree layer is called Workspace, not chat/agent

- **WHEN** the user sees a label for the isolation unit (a `chats`-table row:
  worktree + branch)
- **THEN** it reads "Workspace" (or "Quick chat" when project-less), never "agent"
  or a bare "chat"

### Requirement: Create actions follow the canonical entry grammar

Each create action MUST be labeled for the entity it creates, per the §4 grammar
(New Project / New Workspace / New Chat / New Quick chat / New Agent), and the word
"Agent" MUST NOT appear on a workspace- or chat-create control.

#### Scenario: Label matches the created entity

- **WHEN** a create action runs (e.g. the sidebar action that starts a project-less
  chat via `setNewChatTarget({ type: "quick" })`)
- **THEN** its label is the canonical term for what it creates ("New Quick chat"),
  and any handler whose name asserts a different entity is renamed to match

#### Scenario: Key and value agree

- **WHEN** an i18n key names an action (e.g. `settings.keyboard.actions.newWorkspace`)
- **THEN** its value uses the matching canonical term ("New Workspace"), not a
  mismatched synonym ("New chat")

### Requirement: Entry and empty-state language is unified

Empty-state and onboarding entry copy MUST use one phrasing per concept, with one
verb per concept (Open a Project, Start a Quick chat, Connect a provider, Attach a
Project), replacing the multiple current phrasings.

#### Scenario: The "no project" moment uses one phrasing

- **WHEN** the app shows a no-project / get-started state
- **THEN** it uses the unified entry grammar ("Open a Project" primary, "Start a
  Quick chat" secondary), not one of several ad-hoc phrasings

### Requirement: The rename does not touch the code/data layer

This change MUST be confined to user-facing strings plus a named set of misleading
handlers; it MUST NOT rename DB tables, schema-aligned code identifiers, or the
job API contract.

#### Scenario: Data and API contracts are unchanged

- **WHEN** the vocabulary change is applied
- **THEN** the `projects`/`chats`/`sub_chats`/`agent_jobs` tables, the `subChatId`/
  `SubChat` code identifiers, and the `job` / `local-job-api` v1 contract are
  unchanged, and "Run" appears only in UI copy

#### Scenario: i18n keys are stable, values change

- **WHEN** a mislabeled i18n entry is corrected
- **THEN** the key identifier is preserved and only its value changes (unless a key
  rename is trivially safe)

