# Settings IA Manual Smoke Evidence

Provider call authorization: not required

This file tracks the GUI evidence required before `refactor-settings-ia` task
5.6 can be checked. Do not mark the manual smoke complete from source inspection
alone; the scenarios below require an actual Settings UI session.

## Scenario: moved-controls-and-preserved-values

Status: blocked

Evidence required:
- Isolated app userData directory used for the run.
- Pre-seeded or pre-existing values for relocated settings.
- Models tab shows Local models / Offline controls.
- Preferences tab shows Rollback.
- Appearance tab shows Kanban.
- Keyboard tab remains the only Ctrl+Tab control.
- Values persist after closing/reopening Settings or restarting the app.

Current status:
- Code/test validation has passed, but GUI verification is blocked in this
  sandbox by local listen permission and Electron startup limitations.

## Scenario: notifications-group

Status: blocked

Evidence required:
- Preferences tab screenshot or observation showing the Notifications section.
- Sound, desktop, and focused-window notification toggles are present together.
- Toggle changes persist through Settings close/reopen or app restart.

Current status:
- Code/test validation has passed; GUI observation is still missing.

## Scenario: code-theme-pickers

Status: blocked

Evidence required:
- Appearance tab screenshot or observation showing light and dark code-block
  theme pickers.
- Selecting a light and dark theme writes the existing storage keys without
  resetting defaults.
- A code block preview or rendered code block uses the selected theme where
  applicable.

Current status:
- Shiki theme-list verification passed; GUI picker behavior is still missing.

## Scenario: about-version-debug-unlock

Status: blocked

Evidence required:
- About tab version number is visible.
- Five clicks on the version number unlock the Debug tab.
- Beta tab is absent from the settings sidebar.
- Debug gating still uses the existing dev tools unlock state.

Current status:
- Source and architecture guards prove Beta removal and unlock relocation, but
  actual click behavior is still missing in a GUI session.
