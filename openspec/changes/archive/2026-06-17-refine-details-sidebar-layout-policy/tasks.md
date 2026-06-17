# Tasks: Refine Details sidebar layout and open policy (phase 3a)

> Baseline: `main` with Phases 1–2 shipped (`a90e2a9`). Policy/presentation only.

## 1. Default widget order + visibility
- [x] 1.1 Set the default `WIDGET_REGISTRY` order to environment-first: `info` → `diff` → `todo` → `plan` → `mcp` → `trace` → `usage` → `error`, with `terminal`/`browser` as lower launchers.
- [x] 1.2 Only change defaults; respect already-persisted per-workspace order/visibility.

## 2. Quick-chat Details degradation (conditional)
- [x] 2.1 Decide (opt-in) whether a folderless chat shows a Details inspector at all — today it mounts only with `worktreePath` (`active-chat.tsx:7197`/`:7098`); do not force a new panel just to satisfy the spec.
- [x] 2.2 IF a Details inspector is shown for a folderless chat, restrict it to `usage`/`trace`/`error`; hide `info`/`diff`/`terminal`/`mcp`/`plan`/`browser` + the file surface. Gate on `isFolderlessChat` / missing-`worktreePath`, not a hard `projectId === null`.
- [x] 2.3 Confirm this matches the formal Quick Chat Surface Scope + the `general-assistant-chat` Details inspector scope clarification.

## 3. Auto-open policy
- [x] 3.1 In `use-open-details-widget.ts`, split the current always-`setDetailsSidebarOpen(true)` (`:23`) into a user-action path (opens as now) and a context auto-open path.
- [x] 3.2 Context auto-open is allowed only for plan-produced and run-error events; it must not override a user-collapsed panel and is suppressed for folderless quick chats.

## 4. Terminal default = bottom
- [x] 4.1 Flip the default terminal surface to the bottom panel (current default is `"details"` in `terminal/atoms.ts:35`); the Details terminal widget becomes a compact launcher/status.
- [x] 4.2 Reuse Phase 1 terminal sessions/atoms; normalize persisted terminal mode (no hard reset) and **update the existing terminal-mode tests** for the new default.

## 5. Environment provenance split
- [x] 5.1 Enumerate in-chat readouts in `git-activity-badges.tsx` / `sub-chat-status-card.tsx`: classify each as static-env (dedup) vs message-level provenance/jump (keep).
- [x] 5.2 Remove only the duplicated static-env readouts; keep per-message git provenance and jump entries.

## 6. Verification
- [x] 6.1 Update/extend `tests/details-sidebar-entrypoints.test.ts` for default order, quick-chat degradation, and auto-open policy.
- [x] 6.2 Run `openspec validate refine-details-sidebar-layout-policy --strict --no-interactive`.
- [x] 6.3 Run `bun run lint`, `bun run ts:check`, targeted tests, and `bun run architecture:check`.
- [x] 6.4 Verification smoke: project chat shows environment-first order + terminal at bottom; targeted tests cover folderless Details degradation, plan/error auto-open suppression after collapse, and preserving in-chat git provenance without duplicating static environment state.
