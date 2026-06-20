## 1. Pre-flight

- [x] 1.1 Confirm current homes: Offline/Rollback in `agents-beta-tab.tsx`; Kanban +
  `ctrlTabTarget` in `agents-keyboard-tab.tsx`; `ctrlTabTarget` + 3 notification
  toggles in `agents-preferences-tab.tsx`; code-theme atoms read only by
  `use-code-theme.ts` (no control).
- [x] 1.2 Confirm the dev-mode unlock (`DEVTOOLS_UNLOCK_CLICKS`, `betaClickCountRef`)
  fires on the Beta nav item in `settings-sidebar.tsx`, and the About tab renders a
  version number (`v{currentVersion}`) to relocate it onto.
- [x] 1.3 Note every storage key that must be preserved across moves/renames
  (esp. `preferences:beta-kanban-enabled`).
  - 2026-06-20 preflight confirmed current homes:
    `agents-beta-tab.tsx` owns Offline/Ollama and Rollback controls;
    `agents-keyboard-tab.tsx` owns the Kanban readout and Ctrl+Tab readout;
    `agents-preferences-tab.tsx` owns a duplicate Ctrl+Tab selector plus the
    three notification toggles; `vscodeCodeThemeLightAtom` /
    `vscodeCodeThemeDarkAtom` are read by `use-code-theme.ts` and have no
    Settings control. Dev unlock currently lives in
    `features/settings/settings-sidebar.tsx` via `DEVTOOLS_UNLOCK_CLICKS` and
    `betaClickCountRef`, while `agents-about-tab.tsx` renders
    `v{data?.currentVersion ?? "..."}`. Storage keys to preserve:
    `agents:selected-ollama-model`, `agents:auto-offline-mode`,
    `agents:show-offline-mode-features`, `preferences:history-enabled`,
    `preferences:sound-notifications-enabled`,
    `preferences:desktop-notifications-enabled`,
    `preferences:notify-when-focused`, `preferences:beta-kanban-enabled`,
    `preferences:ctrl-tab-target`, `preferences:vscode-code-theme-light`, and
    `preferences:vscode-code-theme-dark`.

## 2. Relocate controls (preserve storage keys)

- [x] 2.1 Move the Offline / Ollama controls (`showOfflineModeFeaturesAtom`,
  `autoOfflineModeAtom`, `selectedOllamaModelAtom`) into `agents-models-tab.tsx` as a
  "Local models" section.
- [x] 2.2 Move Rollback (`historyEnabledAtom`) into `agents-preferences-tab.tsx`
  (agent-behavior).
- [x] 2.3 Move the Kanban toggle into `agents-appearance-tab.tsx`; rename
  `betaKanbanEnabledAtom` → `kanbanViewEnabledAtom` **keeping** the
  `preferences:beta-kanban-enabled` storage key; update all readers
  (`agents-sidebar`, `agents-layout`, `agents-content`).
- [x] 2.4 Remove the duplicate `ctrlTabTargetAtom` control from
  `agents-preferences-tab.tsx`; keep it in `agents-keyboard-tab.tsx` only.
- [x] 2.5 Group the 3 notification toggles (`soundNotificationsEnabledAtom`,
  `desktopNotificationsEnabledAtom`, `notifyWhenFocusedAtom`) under a labeled
  "Notifications" section in `agents-preferences-tab.tsx` (add the i18n label).

## 3. Surface the code-theme orphan

- [x] 3.1 Add light + dark code-block theme pickers in `agents-appearance-tab.tsx`
  bound to `vscodeCodeThemeLightAtom` / `vscodeCodeThemeDarkAtom`, using the existing
  code-theme list; defaults unchanged. (Leave `usageBudget` untouched — out of scope.)

## 4. Remove the emptied Beta tab + relocate the unlock

- [x] 4.1 Delete `agents-beta-tab.tsx`, its `"beta"` case in `settings-content.tsx`,
  and its entry in `settings-sidebar.tsx` (the `ADVANCED_TABS_BASE` list).
- [x] 4.2 Relocate the dev-mode unlock: move the `DEVTOOLS_UNLOCK_CLICKS` 5-click
  counter from the Beta nav item to the About-tab version number; keep
  `devToolsUnlockedAtom` + Debug-tab gating unchanged.
- [x] 4.3 Confirm nothing else imports `AgentsBetaTab` or references the removed
  `"beta"` `SettingsTab` id.

## 5. Validation

- [x] 5.1 `bun run ts:check`.
- [x] 5.2 `bun run lint` (changed-line biome) green.
- [x] 5.3 Run the architecture guard — `assertNoDeadSettingsState` must pass (proves
  the Beta module is fully deleted and every remaining tab module is rendered).
- [x] 5.4 Run the full test suite.
- [x] 5.5 `openspec validate refactor-settings-ia --strict --no-interactive`.
- [ ] 5.6 Manual smoke: each moved toggle is in its new tab and **keeps its prior
  value** (no pref reset); the Notifications group renders; the code-theme pickers
  work; the Debug tab is still unlockable via 5 clicks on the About version.
- 2026-06-20 added `manual-smoke-evidence.md` plus
  `bun run settings-ia:smoke:evidence` as the evidence gate for this GUI smoke.
  `manual-smoke-runbook.md` records the isolated launch and evidence steps for a
  GUI-capable local session.
  Current scenarios remain blocked by this sandbox's Electron startup and local
  listen restrictions, so this task stays unchecked until a GUI-capable local
  session records passed evidence.
- [x] 5.7 Mark the §1 IA-smell items resolved in
  `docs/ideas/settings-reconciliation-ledger.md`.
  - 2026-06-20 validation: `bun run ts:check`, `bun run lint`,
    `bun run architecture:check`, `openspec validate refactor-settings-ia
    --strict --no-interactive`, `openspec validate --all --strict
    --no-interactive`, and `bun -e` Shiki theme-list verification passed.
    Default parallel `bun run test` reproducibly fails in unrelated
    provider/voice local HTTP server tests with `EADDRINUSE` on `listen(0,
    "127.0.0.1")`; the same failing files pass individually, and the full suite
    passes with `bun test tests --max-concurrency=1` (1065 pass / 0 fail).
    Manual desktop smoke is still unchecked: this sandbox cannot launch Electron
    (`node_modules/electron/dist/Electron.app/.../Electron -e ...` exits 134 /
    SIGABRT), so Settings UI click validation must be run in a GUI-capable
    local session.
  - 2026-06-20 retry with isolated runtime state also remains blocked before UI:
    `HOME=/private/tmp/locus-settings-ia-home
    CODEX_HOME=/private/tmp/locus-settings-ia-home/.codex
    LOCUS_USER_DATA_DIR=/private/tmp/locus-settings-ia-smoke bun run dev`
    successfully builds main/preload, then fails starting the dev server with
    `listen EPERM: operation not permitted ::1:5173`. Manual UI smoke remains
    unchecked until a GUI/network-listen-capable local session can open Settings.
  - 2026-06-20 retry with
    `NODE_OPTIONS=--dns-result-order=ipv4first` moves the dev-server bind attempt
    to `127.0.0.1:5173`, but it still fails with `listen EPERM`, confirming the
    blocker is local listen permission in this sandbox rather than only IPv6
    loopback resolution.
