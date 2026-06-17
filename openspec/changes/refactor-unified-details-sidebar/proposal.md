# Change: Unify Plan/Diff/Terminal under DetailsSidebar (phase 1)

## Why

The chat view currently has **multiple competing right-side inspector surfaces** for the same Plan, Diff, and Terminal concerns: the DetailsSidebar widget stack plus separate legacy Plan, Diff, and Terminal sidebars. They fight for the same region and are kept apart by a fragile mutual-exclusion hook (`use-agent-panel-conflicts.ts`) that tracks "who closed whom" and auto-restores. A rollback flag `unifiedSidebarEnabledAtom` (default `true`) gates two parallel implementations at once, and its own comment marks the legacy path for deletion "after Plan, Diff, and Terminal expanded entrypoints and legacy sidebar gates have one stable desktop release" (`src/renderer/features/details-sidebar/atoms/index.ts:207`).

This phase finishes that migration for Plan/Diff/Terminal: make the DetailsSidebar the single owner and product entrypoint for those inspector categories, turn their expanded views into DetailsSidebar-owned widget renderers, and delete the conflict hook and rollback flag. It is a structural consolidation with no new product features — the foundation the later right-side phases build on.

This is phase 1 of a sequenced right-side effort. Phase 2 folds the Local Browser and File Viewer into the same model; until then, those surfaces remain explicitly out of scope for the "single Details inspector" claim. Phase 3 does widget reordering, a first-class commit/push action, and quick-chat degradation.

## What Changes

- Make the unified DetailsSidebar widget stack the **single Details inspector owner** for Plan, Diff, and Terminal in the chat view.
- Convert the legacy Plan, Diff, and Terminal sidebars into **DetailsSidebar-owned expanded widget renderers** (reusing or refactoring the existing `expandedWidgetAtomFamily` / `expandedWidgetSidebarWidthAtom` mechanism), at behavior parity with the sidebars they replace.
- Collapse the Diff display modes from `side-peek | center-peek | full-page` to **Details-owned expanded diff + full-page**; remove `side-peek` as a separate competing sidebar.
- Remove Terminal `side-peek` as a separate competing surface; Terminal becomes a Details-owned expanded widget (its bottom-panel mode, if kept, is out of the right-region competition).
- Delete `use-agent-panel-conflicts.ts` and the mutual-exclusion/auto-restore bookkeeping once there is a single surface to manage.
- Remove the `unifiedSidebarEnabledAtom` rollback flag and the legacy code path it gates.
- Preserve all existing widget content and actions (info, todo, plan, diff, terminal, mcp, trace, usage, error) — no functional loss.

## Impact

- Affected specs: `agent-workbench` (modifies `Unified Details Inspector Ownership`; no new Details capability/spec owner)
- Baseline: this phase assumes `add-quick-chat-and-project-sidebar` is **merged first**; both edit `src/renderer/features/agents/main/active-chat.tsx`, so this work starts from that merged tree to avoid a large conflict on the most central file.
- Affected code:
  - `src/renderer/features/agents/main/active-chat.tsx` (remove legacy Plan/Diff/Terminal sidebar rendering and open-state wiring around `:4391`–`:4482`; drop the `unifiedSidebarEnabledAtom` branch at `:4418`)
  - `src/renderer/features/agents/hooks/use-agent-panel-conflicts.ts` (delete)
  - `src/renderer/features/details-sidebar/atoms/index.ts` (remove `unifiedSidebarEnabledAtom`; keep `expandedWidgetAtomFamily`, `expandedWidgetSidebarWidthAtom`)
  - `src/renderer/features/details-sidebar/details-sidebar.tsx`, `expanded-widget-sidebar.tsx`, `sections/changes-widget.tsx`, `sections/diff-section.tsx`, `sections/plan-section.tsx`, `sections/plan-widget.tsx`, `sections/terminal-section.tsx`, `sections/terminal-widget.tsx` (Details-owned expanded parity for plan/diff/terminal)
  - `src/renderer/features/agents/ui/agent-plan-sidebar.tsx`, diff sidebar content/header in `active-chat.tsx` (`:1342`–`:1554`), `src/renderer/features/terminal/terminal-sidebar.tsx` + `terminal/atoms.ts` (retire side-peek-as-separate-surface)
  - `src/renderer/features/details-sidebar/use-open-details-widget.ts` (programmatic open targets the unified panel only)
  - Tests referencing the deleted hook/flag/atoms
- Non-goals (deferred):
  - Folding the Local Browser and File Viewer into the unified model (phase 2); their existing side surfaces may remain in this phase.
  - Widget reordering, a first-class commit/push action, and quick-chat degradation (phase 3).
  - Any change to widget data/queries or new widgets.
  - Any quick-chat / folderless behavior — that lives in `add-quick-chat-and-project-sidebar` and later phases; this phase does not add a delta to `general-assistant-chat`.
