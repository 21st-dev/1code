## Context

Phase 1 of the settings reconciliation (`docs/ideas/settings-reconciliation-ledger.md`).
The removals look trivial but two of them have non-obvious dependency chains that
must be cut in the right order, and one (`enableTasks`) changes a flag read at
runtime. This doc records what is safe to delete, what must stay, and how the
behavior-preserving claim holds.

## Goals / Non-Goals

**Goals:**
- Delete only state with **zero** functional consumers, leaving observable behavior
  identical.
- Make the `enableTasks` default explicit instead of a hidden control-less flag.
- Add a guard so the dead/orphan state cannot silently return.

**Non-Goals:**
- No SaaS-fork removal (teams/billing), no tab IA reorg, no decision on the
  code-theme/usage-budget orphans (they have live readers). Those are later slices.
- No localStorage migration. Orphaned keys are left to be ignored.

## Decisions

- **Cut the model-profile chain top-down.** `activeConfigAtom` is the derived
  selector and has zero readers outside `atoms/index.ts`; it is the root. Remove it
  first, then `modelProfilesAtom`, `activeProfileIdAtom` (which fed only it), and
  `networkOnlineAtom` (a non-persisted plain atom read only by `activeConfigAtom`
  and never written — beyond the original persisted-atom list, but dead once the
  selector is gone), then any helper that goes to zero references
  (`OFFLINE_PROFILE`, `getOfflineProfile`, and the local `ModelProfile` type).
  **Keep**
  `customClaudeConfigAtom` and `normalizeCustomClaudeConfig` — `App.tsx` still
  reads both for legacy provider-config migration — and keep the offline-mode atoms
  (`selectedOllamaModelAtom`, `autoOfflineModeAtom`,
  `showOfflineModeFeaturesAtom`), which the Beta tab uses live. Alternative
  considered: delete the whole offline subsystem — rejected, those atoms have live
  readers.
- **Inline `enableTasks` to `true` at its one consumer** (`ipc-chat-transport.ts`)
  rather than keep the atom. The default is already `true` and there is no UI to
  change it, so the explicit constant preserves behavior and removes a misleading
  flag. Alternative: add a Beta toggle for it — rejected as scope creep; if tool
  gating is wanted later it is a deliberate feature, not a leftover.
- **Guard via the existing `scripts/check-architecture-guards.mjs`**, matching the
  precedent set by `assertChatMessageModelOwner`. `assertNoDeadSettingsState`
  greps for persisted atoms with zero readers and exported tab modules that the
  switcher never reaches. The tab check must be module/reachability-aware rather
  than simple exported-name matching, because current exports can be aliases (for
  example `AgentsProjectWorktreeTab` is an alias of the rendered
  `AgentsProjectsTab`). If the implementation wants name-based checks, first make
  `settings-tabs/index.ts` the real Settings tab registry. Static grep is
  sufficient and cheap; no runtime cost.

## Risks / Trade-offs

- **Stale `enableTasks=false` in a user's localStorage** → Before this change there
  was no UI to set it false, so the only way it could be false is a removed legacy
  toggle. Mitigation: accept it — the documented/default behavior is ON, and a beta
  tool-gating flag silently stuck off would itself be a bug. Note in the PR.
- **A helper looks unused but is re-exported** → Mitigation: confirm zero refs with
  grep across `src/` (not just `src/renderer`) before deleting each helper; rely on
  `ts:check` to catch any missed import.
- **The tab guard flags alias exports as dead** → Mitigation: check module
  reachability from `settings-content.tsx`, or normalize `settings-tabs/index.ts`
  into a real registry before enforcing name-based tab coverage.
- **The guard produces false positives on legitimately UI-less app-state atoms**
  (onboarding flags, `sessionInfoAtom`) → Mitigation: the guard targets persisted
  atoms with zero readers, not "atoms without a settings control"; app-state atoms
  have readers and pass.

## Migration Plan

1. Land removals + `enableTasks` inline + guard in one behavior-preserving change.
2. Verify: `bun run ts:check`, settings/store tests, the architecture guard
   (including a deliberate reintroduction to confirm it fails), and a manual smoke
   that Settings opens and every tab renders.
3. Rollback: pure revert — no schema/persistence migration to undo.
