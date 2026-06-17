# Design: Refine Details sidebar layout and open policy (phase 3a)

Policy/presentation only. No new surfaces or ownership; builds on the unified Details model from Phases 1–2.

## Context

- Details stack is `WIDGET_REGISTRY` (`info`, `todo`, `plan`, `terminal`, `diff`, `mcp`, `trace`, `usage`, `error`, `browser`) with per-workspace visibility/order atoms.
- Context-driven open goes through `use-open-details-widget.ts` (force-opens the Details tab + expands a widget).
- Terminal has both a Details expanded widget and a bottom-panel mode (`terminal-mode-switcher.tsx`) since Phase 1.
- Quick-chat surface scope (formal, archived) already excludes repository surfaces (workbench/kanban/terminal/diff/PR/worktree/MCP); the Details panel content should match.
- In-chat git activity is `GitActivityBadges` keyed by `subChatId` (message/turn-scoped provenance), distinct from the panel's static workspace state.

## Goals / Non-Goals

- Goals: intentional default order; a clear auto-open policy; terminal default = bottom; quick-chat Details degradation; a correct env state-vs-provenance split.
- Non-goals: commit/push (3b); streaming/query perf (3c); new widgets/surfaces.

## Decisions

### 1. Default widget order (environment-first)
- Default order: `info` → `diff` (changes) → `todo` → `plan` → `mcp` → `trace` → `usage` → `error`; `terminal` and `browser` are launchers lower in the stack. Users can still reorder/hide via the existing mechanisms; this only changes defaults.

### 2. Auto-open policy (user-action vs context auto-open)
- Today `use-open-details-widget.ts` returns a callback that **always** `setDetailsSidebarOpen(true)` (`:23`). Split the concern: an **explicit user action** opens as now; a **context auto-open** is policy-gated.
- Context auto-open is allowed only for a small event set (plan produced → plan widget; run error → error widget); it must **not** override a user-collapsed panel and is **suppressed for folderless quick chats**. Encode this as explicit policy rather than ad-hoc callers.

### 3. Terminal default = bottom
- The bottom panel becomes the default/primary terminal surface; the Details terminal widget is a compact launcher/status that opens/focuses the bottom terminal. No new sessions/atoms — reuse Phase 1 wiring.
- The current default is `"details"` (`terminal/atoms.ts:35` `normalizeTerminalDisplayMode` / storage default). Flipping it requires updating the existing terminal-mode tests and normalizing persisted mode so existing users land sensibly (no hard reset).

### 4. Quick-chat Details degradation (conditional, not a forced panel)
- Today the Details panel / expanded widget mount **only when `worktreePath` is present** (`active-chat.tsx:7197`/`:7098`), so folderless chats show no Details. This change does **not** force a quick-chat Details panel.
- The rule is conditional: **if** a Details inspector is shown for a folderless chat, restrict it to the non-repository set (`usage`/`trace`/`error`) and hide `info`/`diff`/`terminal`/`mcp`/`plan`/`browser` + the file surface.
- Gate on the existing **`isFolderlessChat` / missing-`worktreePath`** semantics, not a hard `projectId === null` check. Whether to introduce a quick-chat Details panel at all is an explicit opt-in (see the `general-assistant-chat` scope clarification), decided at implementation, not mandated by this spec.

### 5. Environment provenance split (corrected)
- Details panel = primary display of **static workspace environment state** (project, branch, diff summary, terminal, file, browser).
- In-chat `GitActivityBadges` = **message-level provenance / jump entries** (a commit, a PR, a file activity produced by that turn). Keep these.
- Only remove duplicated **static** environment readouts from the chat stream; never remove per-message git provenance.

## Risks / Trade-offs

- Changing default order/visibility for existing users: respect already-persisted per-workspace order/visibility; only change the defaults applied when none is stored.
- Terminal default flip: ensure users who relied on the right-side terminal still have the launcher; normalize persisted mode rather than hard-reset.
- Env split is a judgment call per badge — enumerate which in-chat readouts are static-env (dedup) vs message provenance (keep) before editing.

## Migration / Sequencing

- Order: (a) default order + default visibility; (b) quick-chat degradation gating; (c) auto-open policy; (d) terminal default = bottom + persisted-mode normalization; (e) env split in the chat badges.
- Independent of 3b and 3c.
