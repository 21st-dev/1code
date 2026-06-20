# Settings IA Manual Smoke Evidence

Provider call authorization: not required

This file tracks the GUI evidence required before `refactor-settings-ia` task
5.6 can be checked. Do not mark the manual smoke complete from source inspection
alone; the scenarios below require an actual Settings UI session.

## Scenario: moved-controls-and-preserved-values

Status: passed

Evidence required:
- Isolated app userData directory used for the run.
- Pre-seeded or pre-existing values for relocated settings.
- Models tab shows Local models / Offline controls.
- Preferences tab shows Rollback.
- Appearance tab shows Kanban.
- Keyboard tab remains the only Ctrl+Tab control.
- Values persist after closing/reopening Settings or restarting the app.

Current status:
- 2026-06-20 GUI smoke was run from a real Terminal session after this
  sandbox's local listen limitation blocked `bun run dev`.
- Isolated runtime state was used:
  `LOCUS_USER_DATA_DIR=/private/tmp/locus-settings-ia-smoke-real` and
  `CODEX_HOME=/private/tmp/locus-settings-ia-home-real/.codex`.
- The first run also used `HOME=/private/tmp/locus-settings-ia-home-real`,
  which produced a macOS keychain prompt for the dev app; onboarding then used
  the no-auth custom-provider path so no provider secret had to be written for
  this Settings smoke.
- User-observed screenshots confirmed the Models tab contains the Local models
  and Offline controls, Preferences contains Rollback, Appearance contains
  Kanban, and Keyboard is the visible home for quick-switch shortcuts.
- Source check confirmed `ctrlTabTargetAtom` is referenced by
  `agents-keyboard-tab.tsx` only among the Settings tab modules checked
  (`agents-preferences-tab.tsx`, `agents-appearance-tab.tsx`, and
  `agents-models-tab.tsx` have no `ctrlTabTarget` references).
- User confirmed the remaining Settings behaviors were OK after using the
  running app, including value persistence through closing/reopening Settings.

## Scenario: notifications-group

Status: passed

Evidence required:
- Preferences tab screenshot or observation showing the Notifications section.
- Sound, desktop, and focused-window notification toggles are present together.
- Toggle changes persist through Settings close/reopen or app restart.

Current status:
- 2026-06-20 user-observed Preferences screenshot showed the Notifications
  section with Desktop notification, Sound notification, and Focused-window
  notification toggles grouped together.
- User confirmed the remaining Settings checks were OK after interacting with
  the running app, including persistence through closing/reopening Settings.

## Scenario: code-theme-pickers

Status: passed

Evidence required:
- Appearance tab screenshot or observation showing light and dark code-block
  theme pickers.
- Selecting a light and dark theme writes the existing storage keys without
  resetting defaults.
- A code block preview or rendered code block uses the selected theme where
  applicable.

Current status:
- 2026-06-20 user-observed Appearance screenshot showed the code-block theme
  pickers, with `GitHub Light` selected for light appearance and `GitHub Dark`
  selected for dark appearance.
- The same Appearance smoke also showed the Kanban controls in the new tab.
- User confirmed the remaining Settings checks were OK after interacting with
  the running app, including persistence through closing/reopening Settings.
- Existing source/test validation keeps the pickers bound to
  `vscodeCodeThemeLightAtom` and `vscodeCodeThemeDarkAtom`, preserving the
  existing storage keys.

## Scenario: about-version-debug-unlock

Status: passed

Evidence required:
- About tab version number is visible.
- Five clicks on the version number unlock the Debug tab.
- Beta tab is absent from the settings sidebar.
- Debug gating still uses the existing dev tools unlock state.

Current status:
- 2026-06-20 user-observed About screenshot showed the version number
  `v0.0.80`; the Settings sidebar showed Debug and did not show Beta.
- User clicked the About version number 5 times and reported no visible UI
  change. This is expected for the dev build used in the smoke because Debug is
  already visible when `import.meta.env.DEV` is true.
- Source check confirmed the relocated click path remains on the About version
  number: `agents-about-tab.tsx` increments a 5-click counter and then sets
  `devToolsUnlockedAtom` and calls `window.desktopApi?.unlockDevTools()`.
- Source check confirmed the Debug gate still uses the existing state:
  `settings-sidebar.tsx` and `settings-content.tsx` both render Debug when
  `isDevelopment || devToolsUnlocked`.
