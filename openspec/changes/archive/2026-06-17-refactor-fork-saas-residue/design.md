## Context

Phase 2 of the settings/IA reconciliation, after `remove-dead-settings-state`. The
"fork ghost" framing was pressure-tested against code and partly overturned:
`billingMethod` is load-bearing (it routes onboarding) but misnamed, and the "team"
layer is inert but woven into the chat-data adapter. So this is a **rename + an
inert-scaffolding removal**, not a dead-code delete. Both parts must be provably
behavior-preserving.

## Goals / Non-Goals

**Goals:**
- Make onboarding's selector honestly named (provider/auth, not billing) with zero
  behavior or persistence change.
- Delete the inert team scaffolding so the renderer stops carrying always-null
  multi-tenant state.

**Non-Goals:**
- No real teams/billing feature, and no foreclosing one later.
- No change to onboarding routing, the chat-list query, or stored values/keys.
- Not the workbench rename, the provider-contract/claude-codex-privilege work, or
  the canonical **entity** vocabulary (Project/Workspace/Chat/Agent) change.

## Decisions

- **Rename the symbol/type/page, keep the key and values.** The localStorage key
  `"onboarding:billing-method"` and the value strings stay; only identifiers change
  (`billingMethodAtom` → `onboardingProviderModeAtom`, `BillingMethod` →
  `OnboardingProviderMode`, `BillingMethodPage` → `OnboardingProviderPage`). This
  guarantees no migration and that existing users keep their selection. Alternative
  considered: also rename the key/values to scrub "billing" fully — rejected, it
  forces a migration and risks resetting onboarding for zero functional gain.
  Stable i18n key identifiers may also keep their existing names when the visible
  copy is already provider/auth oriented; this avoids translation churn without
  preserving billing vocabulary in runtime-facing code.
- **Remove team scaffolding because the adapter already ignores it.**
  `useAgentChats(_args, _opts)` calls `trpc.chats.list.useQuery({})` unconditionally
  — it honors neither `teamId` nor `enabled`. The `setData({ teamId }, …)` adapter
  likewise writes `utils.chats.list.setData({}, …)`. So dropping `selectedTeamId`,
  the `enabled` gates, the `teamId` args, and the inert chat-input/file-mention
  `teamId` prop plumbing is provably a no-op. The dead `if (teamId)` optimistic
  update branch in `active-chat.tsx` must be deleted, not made unconditional; the
  existing desktop `chats.list` cache update remains the behavior-preserving path.
  Confirm this in the adapter before deleting (task gate), since it is the whole
  behavior-preservation argument.
- **No new name-forbidding guard.** Cut 1 added `assertNoDeadSettingsState`; here a
  guard that bans the strings `billingMethod`/`selectedTeamId` would prejudge the
  still-open product question of whether teams/billing are ever wanted. The
  `fork-residue-hygiene` spec documents the invariant; enforcement stays at review.

## Risks / Trade-offs

- **A `teamId`/`enabled` consumer is actually honored somewhere** → Mitigation: the
  pre-flight task re-reads `useAgentChats` and the `getAgentChats` util to confirm
  both are ignored before removal; `ts:check` + the chat tests catch a missed seam.
- **A user-visible string still says "billing"** → Mitigation: grep visible copy for
  "billing"/"账单" and align wording; keep i18n key identifiers stable to avoid
  unrelated churn.
- **Touching the freshly-refactored chat-data adapter (`agent-chat-api.ts`)** →
  Mitigation: only remove the ignored `teamId` params; do not alter the
  `trpc.chats.list` call shape or the canonical message hydration path.

## Migration Plan

1. Land Part A (rename) and Part B (team removal) — may be one PR or two; both are
   behavior-preserving and independent.
2. Verify: `bun run ts:check`, the full test suite, the architecture guard,
   `openspec validate --strict`, and a manual onboarding smoke (fresh + already-onboarded).
3. Rollback: pure revert; no persistence migration to undo (key/values untouched).

## Resolved Product Decisions

- **Teams/billing product gate:** approved premise — the current model has neither
  real teams nor real billing. This change does not add or block a future real one;
  if the product intends real teams or billing later, it must be built deliberately,
  not resurrected from this scaffolding.
- **Final rename target:** use `onboardingProviderModeAtom` /
  `OnboardingProviderMode` / `OnboardingProviderPage`.
