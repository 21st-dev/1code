## MODIFIED Requirements
### Requirement: Each setting lives in the tab matching its concept

Every setting control MUST appear in the Settings tab whose subject matches the
setting, and MUST NOT be duplicated across tabs. Local-model/offline config belongs
in Models; agent-behavior toggles (e.g. rollback) in Preferences; view/appearance
toggles (e.g. the Kanban view, code theme) in Appearance; keyboard-navigation
settings in Keyboard only. Local command file management belongs in Commands,
not Skills.

#### Scenario: Offline config is in Models, not Beta

- **WHEN** the user looks for local-model / Ollama / offline settings
- **THEN** they are in the Models tab, not in a Beta tab

#### Scenario: The view toggle is in Appearance, not Keyboard

- **WHEN** the user looks for the Kanban view toggle
- **THEN** it is in Appearance, not the Keyboard tab, and its atom no longer carries
  a `beta` prefix

#### Scenario: A setting is not duplicated across tabs

- **WHEN** a setting (e.g. the Ctrl+Tab target) is presented
- **THEN** it appears in exactly one tab (Keyboard), not in two

#### Scenario: Command management is in Commands, not Skills

- **WHEN** the user wants to create, edit, or delete local command files
- **THEN** those controls appear in Settings > Commands
- **AND** Settings > Skills does not include a Commands sub-view or command file CRUD controls
