# Settings IA Manual Smoke Runbook

Provider call authorization: not required

Use this runbook to complete task 5.6 in a GUI-capable local session. Do not
mark the task complete until `manual-smoke-evidence.md` has all scenarios marked
`passed` and `bun run settings-ia:smoke:evidence` agrees.

## Isolated Launch

Use throwaway runtime state so the smoke does not mutate daily Locus, Claude, or
Codex settings:

```bash
rm -rf /private/tmp/locus-settings-ia-home /private/tmp/locus-settings-ia-smoke
mkdir -p /private/tmp/locus-settings-ia-home/.codex

HOME=/private/tmp/locus-settings-ia-home \
CODEX_HOME=/private/tmp/locus-settings-ia-home/.codex \
LOCUS_USER_DATA_DIR=/private/tmp/locus-settings-ia-smoke \
NODE_OPTIONS=--dns-result-order=ipv4first \
bun run dev
```

If the dev server cannot bind to localhost, stop and keep the evidence scenarios
blocked. Do not check task 5.6 from source inspection alone.

## Seed Values

Before opening Settings, set or confirm non-default values for the moved
preferences. The exact mechanism can be UI setup or trusted local storage
inspection, but record which values were used:

- `agents:selected-ollama-model`
- `agents:auto-offline-mode`
- `agents:show-offline-mode-features`
- `preferences:history-enabled`
- `preferences:sound-notifications-enabled`
- `preferences:desktop-notifications-enabled`
- `preferences:notify-when-focused`
- `preferences:beta-kanban-enabled`
- `preferences:ctrl-tab-target`
- `preferences:vscode-code-theme-light`
- `preferences:vscode-code-theme-dark`

## Checks

Record observations for each scenario in `manual-smoke-evidence.md`:

- Models tab shows Local models / Offline controls and preserves the seeded
  offline values.
- Preferences tab shows Rollback and a grouped Notifications section containing
  sound, desktop, and focused-window notification toggles.
- Appearance tab shows Kanban plus light and dark code-block theme pickers; theme
  changes write the existing storage keys.
- Keyboard tab is the only Settings tab with the Ctrl+Tab target control.
- About tab shows the version number; five clicks on the version unlock Debug;
  Beta is absent from the sidebar.

Close and reopen Settings, or restart the app, before marking preservation
checks passed.

## Closeout

After recording passed evidence:

1. Change each scenario in `manual-smoke-evidence.md` from `blocked` to `passed`.
2. Check task 5.6 in `tasks.md`.
3. Run:

```bash
bun run settings-ia:smoke:evidence
bunx openspec validate refactor-settings-ia --strict --no-interactive
```
