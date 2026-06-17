## Why

The Settings surface has never been reconciled since the fork: as features were
added and changed, settings state accreted but was never audited. A top-to-bottom
inventory (`docs/ideas/settings-reconciliation-ledger.md`) found persisted
settings that no code reads, a runtime flag with no control surface, and an entire
settings tab that is registered but never rendered. This is the first,
**behavior-preserving** slice of the reconciliation: remove the provably dead
state. It requires no product decision and is invisible to users — it only deletes
code that already does nothing.

## What Changes

- Remove four persisted settings atoms with **zero** references anywhere in
  `src/renderer` (each only writes localStorage; nothing reads them):
  `useNativeFrameAtom`, `betaGitFeaturesEnabledAtom`, `betaUpdatesEnabledAtom`,
  `simulateOfflineAtom`.
- Remove the dead local model-profile / active-config subsystem: `activeConfigAtom`
  (the derived selector — **zero** readers outside its own file), the atoms that
  feed only it, `modelProfilesAtom` and `activeProfileIdAtom`, and
  `networkOnlineAtom` (a **non-persisted** plain atom read only by `activeConfigAtom`
  and never written — its "updated from main process" comment is stale), plus any
  helpers (`OFFLINE_PROFILE`, `getOfflineProfile`, and the local `ModelProfile`
  type) left unreferenced after removal. **Keep** `customClaudeConfigAtom` and
  `normalizeCustomClaudeConfig` (live legacy migration path in `App.tsx`) and the
  offline-mode atoms `selectedOllamaModelAtom` / `autoOfflineModeAtom` /
  `showOfflineModeFeaturesAtom` (live in the Beta tab).
- Remove the dead Settings tab component `AgentsCustomAgentsTab`
  (`agents-custom-agents-tab.tsx`, ~1,058 lines) and its export from
  `settings-tabs/index.ts`. It is never rendered; the live "Custom Agents" tab is
  `AgentsAppAgentsTab`.
- Resolve the `enableTasksAtom` orphan: it has no settings control anywhere yet
  gates whether TodoWrite/Task tools are exposed (read in `ipc-chat-transport.ts`).
  Inline its single consumer to the literal default (`true`) and remove the atom,
  so the behavior is explicit instead of a hidden, unchangeable flag.
- Add a guard (`assertNoDeadSettingsState`, alongside the existing architecture
  guards) so a future reintroduction of a zero-reader persisted settings atom or a
  registered-but-unrendered settings tab fails the check — preventing re-drift.
  The tab guard must account for same-file aliases such as
  `AgentsProjectWorktreeTab` / `AgentsProjectsTab`, or first convert
  `settings-tabs/index.ts` into the true registry being checked.

Explicitly **out of scope** (later, separately gated slices): removing the
SaaS-fork leftovers (teams/billing); the tab information-architecture reorg; and
the code-theme / usage-budget orphans (those have live readers and need a UI
decision, not deletion).

## Capabilities

### New Capabilities
- `settings-state-integrity`: every persisted setting must have at least one
  functional reader, every registered Settings tab must be rendered, and a runtime
  capability flag must either expose a control or be a hardcoded default — no dead
  or orphan settings state ships.

### Modified Capabilities
<!-- None. This change is behavior-preserving: the removed atoms/selector/tab have
     zero functional consumers, so no existing requirement's behavior changes.
     It does not touch the live `agent-provider-profiles` system. -->

## Impact

- **Code (renderer):** `src/renderer/lib/atoms/index.ts` (atom + derived-selector
  removals), `src/renderer/components/dialogs/settings-tabs/agents-custom-agents-tab.tsx`
  (deleted) and `settings-tabs/index.ts` (export removed),
  `src/renderer/features/agents/lib/ipc-chat-transport.ts` (inline `enableTasks`).
- **Guards:** `scripts/check-architecture-guards.mjs` (new `assertNoDeadSettingsState`).
- **Persistence:** orphaned localStorage keys (e.g. `agents:model-profiles`,
  `preferences:windows-use-native-frame`) stop being written; existing stale keys
  are harmless and ignored. No migration needed.
- **User-facing behavior:** none. The removed code has no functional consumer; the
  `enableTasks` default (ON) is preserved.
- **Docs:** mark §2/§4 rows in `docs/ideas/settings-reconciliation-ledger.md` as
  resolved by this change.
