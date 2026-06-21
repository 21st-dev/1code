## ADDED Requirements

### Requirement: Each setting lives in the tab matching its concept

Every setting control MUST appear in the Settings tab whose subject matches the
setting, and MUST NOT be duplicated across tabs. Local-model/offline config belongs
in Models; agent-behavior toggles (e.g. rollback) in Preferences; view/appearance
toggles (e.g. the Kanban view, code theme) in Appearance; keyboard-navigation
settings in Keyboard only.

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

### Requirement: No empty or vestigial settings tab ships

The Settings surface MUST NOT ship a tab with no real content. Once its settings are
relocated, the emptied tab MUST be removed (component, switcher case, and nav entry),
which the existing `assertNoDeadSettingsState` guard enforces by requiring every
`agents-*-tab.tsx` module to be rendered.

#### Scenario: The emptied Beta tab is removed

- **WHEN** Rollback and Offline are relocated out of the Beta tab
- **THEN** the Beta tab component, its switcher case, and its nav entry are deleted,
  and no orphaned `agents-beta-tab.tsx` module remains

### Requirement: Relocations preserve persisted settings

Moving or renaming a setting control MUST preserve its localStorage key so existing
user preferences keep their values; no relocation may reset a stored preference.

#### Scenario: A relocated/renamed toggle keeps its value

- **WHEN** a user who had set a toggle launches the build where that toggle moved
  tabs (or its atom was renamed, e.g. `betaKanban*` → `kanban*`)
- **THEN** the setting reads its previous value from the unchanged storage key

### Requirement: Developer-only affordances survive relocation

A hidden developer affordance attached to a removed surface MUST be relocated, not
lost.

#### Scenario: The dev-mode unlock survives Beta removal

- **WHEN** the Beta tab (which hosted the 5-click dev-mode unlock) is removed
- **THEN** the unlock is still reachable, relocated to repeated clicks on the
  About-tab version number
