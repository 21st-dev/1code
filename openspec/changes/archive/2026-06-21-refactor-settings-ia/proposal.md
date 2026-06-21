## Why

After Phases 1–2 the Settings *state* is clean (no dead atoms, no fork ghosts),
but the Settings *layout* is still the source of the "混乱 / 迷惑" the user
reported: settings sit in the wrong tabs. Verified placement drift:

- Local-models / **Offline (Ollama)** config is buried in **Beta**, not Models.
- **Rollback** (`historyEnabled`) is in **Beta**, not with agent behavior.
- The **Kanban** view toggle (`betaKanbanEnabledAtom`) lives in the **Keyboard**
  tab and is still `beta`-named though its comment says "graduated from beta".
- `ctrlTabTargetAtom` is exposed in **two** tabs (Keyboard *and* Preferences).
- Three notification toggles sit in the **Preferences** junk drawer with no group.
- Two settings have a reader but **no control at all** (code-theme, usage-budget).
- After the moves above, the **Beta** tab is empty — yet it secretly hosts the
  dev-mode unlock (5 clicks on the Beta nav item).

This is the **information-architecture** slice (the "third cut"): move each setting
to its semantically-correct tab, remove the emptied Beta tab, and surface the one
orphan worth a control. It is **placement only** — it does not redesign the
internal content/layout of any tab (that is the separate, later per-tab line).

## What Changes

**Relocate settings to the right tab (storage keys preserved → no pref reset):**
- **Offline / Ollama** (`showOfflineModeFeaturesAtom`, `autoOfflineModeAtom`,
  `selectedOllamaModelAtom`) → **Models** as a "Local models" section.
- **Rollback** (`historyEnabledAtom`) → **Preferences** (agent-behavior).
- **Kanban** (`betaKanbanEnabledAtom`) → **Appearance**; rename the symbol to drop
  the `beta` prefix (e.g. `kanbanViewEnabledAtom`) keeping its storage key.
- **`ctrlTabTargetAtom`** → keep in **Keyboard** only; remove the Preferences copy.
- **Notifications** (`soundNotificationsEnabledAtom`, `desktopNotificationsEnabledAtom`,
  `notifyWhenFocusedAtom`) → a labeled **Notifications** section inside Preferences.

**Surface one orphan (the only new control):**
- **Code theme** (`vscodeCodeThemeLightAtom` / `vscodeCodeThemeDarkAtom`) → light/dark
  code-block theme pickers in **Appearance**. (It already has a reader; this gives it
  a UI.)

**Remove the emptied Beta tab, preserve the unlock:**
- Delete the `AgentsBetaTab` component + its `settings-content.tsx` case + its
  sidebar nav entry (the cut-1 guard requires the module be deleted, not orphaned).
- Relocate the dev-mode unlock (`DEVTOOLS_UNLOCK_CLICKS`) from the Beta nav item to
  **5 clicks on the About-tab version number** (`v{currentVersion}`).

Explicitly **out of scope:** the per-tab internal content/layout redesign of any
tab (Plugins / Models / Skills / MCP / etc.); the `usageBudget` orphan (defer — it
implies a "budget feature" product decision, not just placement); the ③+④
vocabulary work (Codex is doing it) — though any new label here uses canonical terms.

## Capabilities

### New Capabilities
- `settings-information-architecture`: every setting MUST live in the tab matching
  its concept, no empty/vestigial settings tab ships, control moves/renames preserve
  their storage keys, and developer-only affordances (the dev-mode unlock) survive
  relocation.

### Modified Capabilities
<!-- None at requirement level. Placement/relabeling only; no existing capability's
     behavior contract changes. The cut-1 `assertNoDeadSettingsState` guard still
     applies (every tab module must be rendered) and is satisfied by deleting the
     Beta module. -->

## Impact

- **Code (renderer):** the settings-tab components (`agents-models-tab`,
  `agents-preferences-tab`, `agents-appearance-tab`, `agents-keyboard-tab`,
  deleted `agents-beta-tab`), `settings-content.tsx` + `settings-sidebar.tsx` (nav
  group/tab list, unlock relocation), `agents-about-tab.tsx` (version-click unlock),
  `atoms/index.ts` (one symbol rename, key preserved), and i18n group/section labels.
- **Persistence:** all storage keys preserved → existing user preferences keep their
  values; no migration.
- **User-facing behavior:** toggles move location and one new control appears (code
  theme); no toggle changes what it does. Dev-mode unlock still reachable.
- **Guard:** existing `assertNoDeadSettingsState` enforces the Beta module deletion.
- **Docs:** mark the §1 IA-smell items resolved in the reconciliation ledger.
