## 1. Pre-flight (lock the behavior-preservation argument)

- [x] 1.1 Re-confirm `useAgentChats` ignores its args/opts (calls
  `trpc.chats.list.useQuery({})`) and the `getAgentChats` util's `setData`/`getData`
  ignore `teamId` (use `utils.chats.list...({})`). This is the whole no-op argument
  for Part B.
- [x] 1.2 Re-confirm `selectedTeamIdAtom` has no setter anywhere (always `null`) and
  `createTeamDialogOpenAtom` has zero readers.
- [x] 1.3 Confirm there is no Stripe/payment logic behind `billingMethod` — values
  are provider/auth modes only; routing lives in `App.tsx`.
- [x] 1.4 Confirm `helperApisSetupPrompt*` is a live feature (agents-layout,
  anthropic-onboarding-page, claude-login-modal) and stays.

## 2. Part A — rename onboarding selector to provider-auth vocabulary

- [x] 2.1 In `atoms/index.ts`, rename `BillingMethod` → `OnboardingProviderMode` and
  `billingMethodAtom` → `onboardingProviderModeAtom`, **keeping** the storage key
  `"onboarding:billing-method"` and all value strings unchanged.
- [x] 2.2 Update consumers to the new names: `App.tsx` (all onboarding routing),
  the renamed page, `anthropic-onboarding-page.tsx`,
  `api-key-onboarding-page.tsx`, `codex-onboarding-page.tsx`.
- [x] 2.3 Rename the page file/component `billing-method-page.tsx` /
  `BillingMethodPage` → `onboarding-provider-page.tsx` / `OnboardingProviderPage`
  (and the in-file `BillingOption*`/`billingOptions` → `ProviderOption*`/
  `providerOptions`); update `onboarding/index.ts` and the `App.tsx` import.
- [x] 2.4 Grep user-visible copy/i18n for "billing"/"账单" that means provider/auth;
  visible copy already reads "Connect AI Provider", so the legacy storage key and
  stable `onboarding.billing.*` i18n key identifiers are kept unchanged (no churn).
- [x] 2.5 `bun run ts:check` green after the rename.

## 3. Part B — remove inert team scaffolding

- [x] 3.1 Delete `createTeamDialogOpenAtom` and `selectedTeamIdAtom` from
  `atoms/index.ts`.
- [x] 3.2 In `active-chat.tsx`, remove the local `selectedTeamIdAtom` stub (and the
  commented import) and its read; drop the `{ teamId }` keys at the
  `getAgentChats.setData(...)` sites.
- [x] 3.3 Delete the currently-dead `if (teamId)` optimistic update branch in
  `active-chat.tsx` instead of converting it into a new unconditional
  `getAgentChats.setData(...)` path. Keep the existing desktop `chats.list` cache
  update unchanged.
- [x] 3.4 In `agents-content.tsx` and `agents-subchats-sidebar.tsx`, drop the
  `selectedTeamId` read and call `getAgentChats.useQuery()` with no `teamId` arg and
  no team-based `enabled` gate.
- [x] 3.5 Remove the inert `teamId` prop/type plumbing from `ChatViewInner`,
  `ChatInputArea`, and `AgentsFileMention`.
- [x] 3.6 Simplify the `getAgentChats` adapter in `agent-chat-api.ts` to drop the
  now-unused `teamId` parameters from `useQuery`/`setData`/`getData`/`invalidate`,
  leaving the `trpc.chats.list` call shape unchanged.
- [x] 3.7 `bun run ts:check` green after the removal.

## 4. Validation

- [x] 4.1 `bun run ts:check`.
- [x] 4.2 Run the full test suite (chat/store/onboarding tests included). 999 pass / 0 fail.
- [x] 4.3 Run the architecture guard (`assertNoDeadSettingsState` must still pass —
  the renamed atom keeps a reader; the removed team atoms are gone).
- [x] 4.4 `openspec validate refactor-fork-saas-residue --strict --no-interactive`.
- [ ] 4.5 Manual smoke: a fresh onboarding run still routes correctly through
  provider selection; an already-onboarded profile does **not** restart onboarding
  (storage key/value preserved); the agent chat list still loads.
  (Deferred to the review/QA pass — not run in this session. Static coverage: the
  storage key and value strings are unchanged so routing is identical; the team
  query path was already inert; `ts:check` + full suite green.)
- [x] 4.6 Mark the §3 fork-leftover rows resolved in
  `docs/ideas/settings-reconciliation-ledger.md`.
