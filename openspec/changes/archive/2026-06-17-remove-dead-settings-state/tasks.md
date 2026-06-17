## 1. Confirm the removal set (pre-flight greps)

- [x] 1.1 Re-confirm zero references across `src/` (not just `src/renderer`) for
  `useNativeFrameAtom`, `betaGitFeaturesEnabledAtom`, `betaUpdatesEnabledAtom`,
  `simulateOfflineAtom` — excluding each atom's own definition line.
- [x] 1.2 Re-confirm `activeConfigAtom` has zero readers outside
  `src/renderer/lib/atoms/index.ts`, and that `modelProfilesAtom` /
  `activeProfileIdAtom` feed only `activeConfigAtom`.
- [x] 1.3 Confirm `customClaudeConfigAtom` still has its `App.tsx` reader (it must
  be KEPT) and that the offline-mode atoms (`selectedOllamaModelAtom`,
  `autoOfflineModeAtom`, `showOfflineModeFeaturesAtom`) are read by the Beta tab
  (KEPT).
- [x] 1.4 Confirm `AgentsCustomAgentsTab` (`agents-custom-agents-tab.tsx`) is only
  exported from `settings-tabs/index.ts` and never rendered by `settings-content.tsx`.
- [x] 1.5 Confirm `enableTasksAtom`'s only consumer is `ipc-chat-transport.ts` and
  its default is `true`.

## 2. Remove zero-reference dead atoms

- [x] 2.1 Delete `useNativeFrameAtom`, `betaGitFeaturesEnabledAtom`,
  `betaUpdatesEnabledAtom`, `simulateOfflineAtom` from `atoms/index.ts` (and any
  now-unused type/import they pulled in).

## 3. Remove the dead model-profile / active-config subsystem

- [x] 3.1 Delete `activeConfigAtom` (the derived selector with zero readers).
- [x] 3.2 Delete `modelProfilesAtom` and `activeProfileIdAtom` (fed only the deleted
  selector). Also removed `networkOnlineAtom`, which after 3.1 was read by nothing
  and written by nothing (its "updated from main process" comment was stale).
- [x] 3.3 Delete helpers left at zero references after 3.1–3.2 (`OFFLINE_PROFILE`,
  `getOfflineProfile`, and any local `ModelProfile` type that becomes unused).
  KEEP `customClaudeConfigAtom` and `normalizeCustomClaudeConfig` because
  `App.tsx` still uses them for legacy provider-config migration.
- [x] 3.4 `bun run ts:check` is green after the chain removal.

## 4. Remove the dead Settings tab

- [x] 4.1 Delete `src/renderer/components/dialogs/settings-tabs/agents-custom-agents-tab.tsx`.
- [x] 4.2 Remove its `export { AgentsCustomAgentsTab }` line from
  `settings-tabs/index.ts`; confirm nothing else imports it.

## 5. Resolve the enableTasks orphan

- [x] 5.1 In `ipc-chat-transport.ts`, replace the `enableTasksAtom` read with the
  literal default (`true`), preserving current behavior.
- [x] 5.2 Delete `enableTasksAtom` from `atoms/index.ts`.

## 6. Add the re-drift guard

- [x] 6.1 Add `assertNoDeadSettingsState` to `scripts/check-architecture-guards.mjs`:
  fail if a persisted `atomWithStorage` in `atoms/index.ts` has zero readers (direct
  or via a read derived atom), or if a settings-tab module exported from
  `settings-tabs/index.ts` is never reached by `settings-content.tsx`. Do not rely
  on exported component-name matching alone; account for same-file aliases such as
  `AgentsProjectWorktreeTab` / `AgentsProjectsTab`, or first replace
  `settings-tabs/index.ts` with a true tab registry. (Implemented with transitive
  atom liveness + module-path tab reachability, so the alias passes.)
- [x] 6.2 Confirm the guard PASSES on the cleaned tree, and FAILS when a
  zero-reader atom or an unrendered exported tab module is deliberately
  reintroduced. Include a passing alias case so `AgentsProjectWorktreeTab` does not
  become a false positive. (Verified: passes clean; a probe `__deadProbeAtom`
  triggered the dead-atom failure; the `AgentsProjectWorktreeTab` alias passes.)

## 7. Validation

- [x] 7.1 `bun run ts:check`.
- [x] 7.2 Run existing settings/store/atom tests. (Full suite: 999 pass / 0 fail.)
- [x] 7.3 Run the architecture guard check (incl. the new assertion).
- [x] 7.4 `openspec validate remove-dead-settings-state --strict --no-interactive`.
- [ ] 7.5 Manual smoke: open Settings, confirm every tab in the sidebar renders and
  no tab is missing/broken; confirm TodoWrite/Task tools still appear in a chat run.
  (Deferred to the review/QA pass — not run in this session. Static coverage:
  `assertNoDeadSettingsState` enforces every tab module is rendered by the switcher,
  `enableTasks` is hardcoded `true`, and `ts:check` + the full test suite are green.)
- [x] 7.6 Mark the §2/§4 rows resolved by this change in
  `docs/ideas/settings-reconciliation-ledger.md`.
