# Design: Unified Plan/Diff/Terminal DetailsSidebar ownership (phase 1)

This phase is a structural consolidation, not a feature. It finishes the Plan/Diff/Terminal migration the codebase already started behind `unifiedSidebarEnabledAtom` and removes the fragile multi-surface coordination for those inspector categories.

## Context

- The DetailsSidebar is the existing canonical right inspector in `agent-workbench`, backed by a configurable widget stack with `WIDGET_REGISTRY` (`info`, `todo`, `plan`, `terminal`, `diff`, `mcp`, `trace`, `usage`, `error`); exactly `plan`, `diff`, `terminal` have `canExpand: true` (`src/renderer/features/details-sidebar/atoms/index.ts`).
- In parallel, the chat view still renders **legacy** Plan/Diff/Terminal sidebars as independent right surfaces, gated by `unifiedSidebarEnabledAtom` (default `true`) and coordinated by `use-agent-panel-conflicts.ts` (`active-chat.tsx:164`, sidebar atoms at `:4391`–`:4482`).
- The flag's own comment marks the legacy path for deletion once the expanded entrypoints reach parity and ship one stable release (`atoms/index.ts:207`).
- Diff has three display modes (`side-peek | center-peek | full-page`, `active-chat.tsx:1350`). `side-peek` is the mode that competes with the DetailsSidebar and drives most of the conflict bookkeeping.
- The expanded-widget mechanism already exists: `expandedWidgetAtomFamily` (which widget is expanded) + `expandedWidgetSidebarWidthAtom` (default 500). Current code renders that expanded state through `ExpandedWidgetSidebar`, which is physically another `ResizableSidebar`; this phase must make it a DetailsSidebar-owned expanded renderer rather than an independently opened product sidebar.
- Local Browser and File Viewer also have right-side surfaces today, but they are explicitly deferred to phase 2 and are not part of this phase's single-owner claim.

## Goals / Non-Goals

- Goals: one Details inspector owner for Plan/Diff/Terminal; plan/diff/terminal expanded renderers at parity; delete the conflict hook and rollback flag; zero functional loss for the migrated surfaces.
- Non-goals: local browser / file viewer folding (phase 2); reorder / commit-push / quick-chat degradation (phase 3); new widgets or new data.

## Decisions

### 1. One Details inspector owner for Plan/Diff/Terminal
- The DetailsSidebar is the only product owner and entrypoint for Plan, Diff, and Terminal inspector details. Plan, Diff, and Terminal are no longer separate user-facing right sidebars.
- "Expanded widget" means the expanded state is owned by the DetailsSidebar widget model (`expandedWidgetAtomFamily` + `expandedWidgetSidebarWidthAtom`) and only one widget can be expanded at a time.
- The implementation may either render the expanded widget inside the physical DetailsSidebar shell or refactor/retain `ExpandedWidgetSidebar` as a DetailsSidebar-owned expanded renderer. If `ExpandedWidgetSidebar` remains, it must not have independent open state, legacy fallback routing, or competing product semantics; it is just the widened/expanded renderer for the selected Details widget. Collapsing returns to the stacked widget view.

### 2. Parity before deletion (the gating rule)
- Before deleting any legacy sidebar, the corresponding Details-owned expanded widget must reach **behavior parity**:
  - Plan: plan title, loading/error states, rendered/plaintext toggle, copy, plan markdown render, build/promote action, plan-file open/refetch behavior — whatever `agent-plan-sidebar.tsx` does today.
  - Diff: full diff header/content behavior currently in `DiffSidebarRenderer` (`active-chat.tsx:1342`–`:1554`), including file list, per-file diff, viewed/selection state, review/create-PR entrypoints, branch/git status actions, conflict actions, discard refresh, and full-page review.
  - Terminal: interactive terminal session at parity with `TerminalSidebar`, including tabs/new/close/rename actions, `scopeKey` continuity, `tabId` / `initialCommands` propagation, theme background, and existing bottom-panel mode if retained.
- Parity is the precondition; deletion of legacy code happens only after the widget covers the sidebar's behavior.

### 3. Diff modes: two states, not three
- Collapse `side-peek | center-peek | full-page` to **Details expanded diff** (the diff widget expanded through the Details-owned expanded renderer) and **full-page** (explicit deep multi-file review).
- Remove `side-peek` as a separate sidebar. `center-peek` folds into `full-page`. This removes the diff↔details space contention.
- Persisted `agents:diffViewDisplayMode` values of `side-peek` or `center-peek` must be migrated or normalized to a valid post-change state so returning users do not auto-open a removed sidebar or land in an invalid mode.

### 4. Terminal: Details-owned expanded widget, off the right-region competition
- Terminal becomes a Details-owned expanded widget. Preserve the existing bottom-panel terminal mode outside the right region unless a separate approved change removes it; it must not depend on `unifiedSidebarEnabledAtom` after that flag is deleted.
- Persisted terminal display state must be normalized so `side-peek` no longer means "open a separate right sidebar".

### 5. Delete the conflict hook and the flag
- With a single Details owner for Plan/Diff/Terminal, mutual exclusion among those inspector panels is unnecessary. Delete `use-agent-panel-conflicts.ts` and its call site, plus the auto-close/auto-restore `useRef` bookkeeping.
- Remove `unifiedSidebarEnabledAtom` and the legacy branch it gates; `use-open-details-widget.ts` opens the unified panel unconditionally.

### 6. Preserve programmatic open, but scoped to the unified panel
- Context-driven opening (e.g. open the plan widget when a plan is produced) continues via `use-open-details-widget.ts`, now targeting only the DetailsSidebar-owned expanded widget model (no legacy sidebar branch). Auto-open *policy* (when force-open is allowed, quick-chat suppression) is deferred to phase 3.

## Risks / Trade-offs

- `active-chat.tsx` is large and central; this is the highest-risk edit. Mitigation: start from the merged `add-quick-chat-and-project-sidebar` tree, and land parity per surface (plan, then diff, then terminal) before removing each legacy path, rather than deleting everything at once.
- Parity gaps are the main functional risk; each widget needs a concrete parity checklist verified before its legacy sidebar is removed.
- Persisted user state for the removed atoms/modes (legacy sidebar open flags, diff side-peek/center-peek, terminal side-peek, `overview:unifiedEnabled=false`) should be ignored/migrated cleanly so a returning user does not land in a broken layout.
- A wording risk remains around over-broad single-panel claims because Local Browser and File Viewer are deferred. This phase must avoid claiming that every right-side surface is gone; it only removes Plan/Diff/Terminal as competing Details inspector surfaces.

## Migration / Sequencing

- Order within this phase: (a) bring plan/diff/terminal widgets to parity in the Details-owned expanded renderer; (b) remove diff `side-peek`/`center-peek`, terminal right-side `side-peek`, and the legacy Plan/Diff/Terminal sidebars surface-by-surface; (c) preserve or explicitly re-home terminal bottom-panel mode outside the right-region competition; (d) delete `use-agent-panel-conflicts.ts`; (e) delete `unifiedSidebarEnabledAtom` and the legacy branch; (f) clean up tests and stale persisted atoms/modes.
- This phase must merge before phase 2 (local browser / file viewer folding) so those surfaces fold into a single, stable model.
