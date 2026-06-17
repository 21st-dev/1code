# Change: Refine Details sidebar layout and open policy (phase 3a)

## Why

Phases 1–2 made the DetailsSidebar the single owner of Plan, Diff, Terminal, Local Browser, and File Viewer. What remains is **presentation/policy** — how the unified panel is ordered, when it opens, where the terminal primarily lives, and how it degrades for folderless quick chats. These were deliberately deferred from the structural phases.

Today the widget order, auto-open behavior, terminal default placement, and quick-chat panel content are incidental rather than intentional, and "environment" information is shown in two places (the Details panel and in-chat git activity badges) without a clear split.

This change is policy/layout only — no new surfaces, no new ownership, and (per review) no bundled performance work.

## What Changes

- **Default widget order** in the Details stack reflects an environment-first mental model: workspace info / branch → changes (diff) → todo / plan → trace / usage / mcp / error. (The commit/push action is out of scope — separate change `add-details-git-commit-push-actions`.)
- **Auto-open policy** for `use-open-details-widget`: today the returned callback **always** `setDetailsSidebarOpen(true)` (`use-open-details-widget.ts:23`). Split into a **user-action** path (explicit user click — opens as now) versus a **context auto-open** path (a plan is produced, a run error appears) that is policy-gated: it must not override a user-collapsed panel and is suppressed for folderless quick chats.
- **Terminal default placement**: make the bottom panel the primary/default terminal surface; the Details terminal widget is a compact launcher/status. Both already exist since Phase 1, but the current default is `"details"` (`terminal/atoms.ts:35`), so this flips the default and must update the existing terminal-mode tests + normalize persisted mode.
- **Quick-chat Details degradation (conditional)**: today the Details panel / expanded widget mount **only when `worktreePath` is present** (`active-chat.tsx:7197`/`:7098`), so a folderless quick chat shows no Details at all. This change does **not force** opening a new panel for quick chats. The requirement is conditional: **if** a Details inspector is shown for a folderless chat, it shows only runtime-relevant widgets (usage/trace/error) and no repository widgets. Gate on the existing `isFolderlessChat` / missing-`worktreePath` semantics, **not** a hard `projectId === null` check. Whether to introduce a quick-chat Details panel at all is an explicit opt-in decision, captured as a `general-assistant-chat` scope clarification rather than a forced mount.
- **Environment provenance split** (corrected): the Details panel is the primary display for *static workspace environment state* (project/branch/diff/terminal/file/browser); in-chat git-activity badges remain as *message-level provenance and jump entries*. **Enumerate first** — current `GitActivityBadges` / `SubChatStatusCard` appear to be mostly message-level provenance, so the default is to keep them; only dedup a readout once it is confirmed to be purely static-env duplication.

## Impact

- Affected specs: `agent-workbench` (ADDS layout/open-policy requirements), `general-assistant-chat` (ADDS a quick-chat Details inspector scope clarification)
- Baseline: `main` with Phases 1–2 shipped (`a90e2a9`).
- Affected code:
  - `src/renderer/features/details-sidebar/atoms/index.ts` (default `WIDGET_REGISTRY` order / default visibility), `details-sidebar.tsx`
  - `src/renderer/features/details-sidebar/use-open-details-widget.ts` (auto-open policy)
  - terminal default placement wiring (`terminal/atoms.ts`, `terminal-mode-switcher.tsx`, `details-sidebar/sections/terminal-*`)
  - quick-chat degradation: Details widget visibility/content gating on `isFolderlessChat` / missing-`worktreePath` semantics
  - env split: `src/renderer/features/agents/ui/git-activity-badges.tsx` / `sub-chat-status-card.tsx` (keep message-level provenance; drop static-env duplication)
- Non-goals:
  - Commit/push action (`add-details-git-commit-push-actions`, phase 3b).
  - Streaming/render performance (`optimize-chat-stream-code-highlighting`, phase 3c); widget-query lazy-load is a separate future change pending a profile.
  - No new widgets, surfaces, or ownership changes.
