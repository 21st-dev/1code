## Context

The "third cut" of the reconciliation, after dead-state removal (1) and fork
de-SaaS (2). The Settings *state* is clean; this fixes *placement*. It is almost
entirely cut-and-paste of existing controls between tab components, plus one tab
deletion, one orphan surfaced, and one hidden affordance relocated. The risk is not
"will it break" but "don't reset user prefs and don't lose the dev unlock."

## Goals / Non-Goals

**Goals:**
- Put every setting in the semantically-correct tab; de-duplicate; group notifications.
- Remove the emptied Beta tab; relocate its dev-mode unlock to About.
- Surface the code-theme orphan as a real control.

**Non-Goals:**
- No redesign of any tab's internal content/layout (that is the next, per-tab line).
- No `usageBudget` work (defer — implies a budget-feature product call).
- No vocabulary work (Codex owns ③+④); reuse canonical terms for any new label.
- No behavior change to what a toggle does; no DB/persistence migration.

## Decisions

- **Move controls, preserve storage keys.** Each relocation is a JSX move + atom
  import move between tab components. Keys are never changed, so prefs survive. The
  one rename (`betaKanbanEnabledAtom` → `kanbanViewEnabledAtom`) keeps its
  `preferences:beta-kanban-enabled` key (rename the symbol, not the key) — same
  pattern as Phase 2's billing rename.
- **Delete Beta, don't hollow it.** Once Rollback + Offline move out, the Beta tab is
  empty. Delete the component file, the `settings-content.tsx` case, and the
  `settings-sidebar.tsx` nav entry. The cut-1 `assertNoDeadSettingsState` guard
  *requires* this — an `agents-beta-tab.tsx` that exists but isn't rendered fails the
  check, so the guard turns "did we finish the deletion?" into a CI assertion.
- **Relocate the dev unlock to About.** The 5-click `DEVTOOLS_UNLOCK_CLICKS` counter
  currently fires on the Beta nav item (`settings-sidebar.tsx`). Move it onto the
  About-tab version number (`v{currentVersion}`) — a conventional "tap version to
  unlock" affordance. `devToolsUnlockedAtom` and the Debug-tab gating are unchanged.
- **Surface code-theme, defer usage-budget.** `vscodeCodeThemeLightAtom`/`DarkAtom`
  are `string` theme ids already read by `use-code-theme.ts`; add light/dark code-block
  theme pickers in Appearance using the existing theme list. `usageBudget` is left
  alone — surfacing it is a feature decision, not placement, and out of scope.
- **Notifications = a section, not a tab.** Three toggles get a labeled "Notifications"
  group inside Preferences. A dedicated tab is overkill for three controls; revisit if
  notification options grow.

## Risks / Trade-offs

- **A rename silently resets a pref** → Mitigation: keep every storage key byte-for-byte;
  the spec requires it; manual smoke that a pre-set toggle keeps its value.
- **Dev unlock lost on Beta deletion** → Mitigation: the relocation is a spec
  requirement + task; verify Debug tab still unlockable via About version clicks.
- **Surfacing code-theme changes behavior** (a previously-fixed value becomes
  user-editable) → acceptable and intended; it only exposes an existing atom, default
  unchanged.
- **Scope creep into tab internals** → Mitigation: Non-Goals are explicit; only the
  moved controls + the new code-theme picker touch tab *content*; nothing else is
  restyled.

## Migration Plan

1. Move the five control groups to their target tabs (keys preserved); de-dup ctrl-tab;
   add the Notifications group; rename the kanban atom symbol.
2. Surface the code-theme pickers in Appearance.
3. Delete the Beta tab (component + case + nav) and relocate the unlock to About.
4. Verify: `bun run check` (lint + guard + ts:check + tests) — the guard confirms the
   Beta module is gone. Manual smoke: each moved toggle is in its new tab and keeps its
   value; Debug still unlockable via About; code-theme picker works.
5. Rollback: pure revert; no persistence migration.

## Open Questions

- None blocking. Exact section ordering within Models/Appearance/Preferences is
  left to implementation; the placement decisions above are fixed.
