## Why

The fork carried web-SaaS assumptions into a local-first desktop app. A code
audit (`docs/ideas/settings-reconciliation-ledger.md` §3) shows two are still
embedded and misleading, even though neither does what its name claims:

1. Onboarding's provider/auth selector is named `billingMethodAtom` /
   `BillingMethod` / `billing-method-page` — but there is **no payment or Stripe
   logic anywhere**. Its values are provider/auth modes (`claude-subscription`,
   `api-key`, `custom-model`, `codex-subscription`, `codex-api-key`), and `App.tsx`
   routes the entire onboarding flow on it. It is load-bearing, just misnamed.
2. A multi-tenant "team" scaffold persists `selectedTeamIdAtom`, but **nothing ever
   sets it** (no setter; `createTeamDialogOpenAtom` is dead; `active-chat.tsx`
   shadows it with a local `null` stub). The team-keyed `getAgentChats` calls are
   already no-ops because the adapter ignores `teamId` and `enabled` and queries
   `trpc.chats.list` unconditionally.

This is a **behavior-preserving** Phase 2 of the reconciliation: rename the
misnamed selector to provider-auth vocabulary, and remove the inert team
scaffolding. No user-facing behavior changes.

## What Changes

**Part A — rename the misnamed onboarding selector (no behavior change, no migration):**

- Rename `billingMethodAtom` → `onboardingProviderModeAtom` and the `BillingMethod`
  type → `OnboardingProviderMode`, and the `billing-method-page.tsx` /
  `BillingMethodPage` → `onboarding-provider-page.tsx` / `OnboardingProviderPage`,
  across `App.tsx` and the onboarding pages. (Names are the recommended target;
  adjustable at review.)
- **Keep** the localStorage key `"onboarding:billing-method"` and the existing
  string values unchanged → no persisted-state migration, no routing change.
- Audit user-visible copy/i18n for the word "billing" where it means provider/auth;
  keep legacy storage keys and stable i18n key identifiers unchanged unless a rename
  is trivially safe, and adjust only visible strings if literally wrong.

**Part B — remove the inert team scaffolding (behavior-preserving):**

- Delete `createTeamDialogOpenAtom` (0 readers) and `selectedTeamIdAtom` (never set).
- Remove the local `selectedTeamIdAtom` stub and its read in `active-chat.tsx`.
- Drop the `{ teamId: selectedTeamId! }, { enabled: !!selectedTeamId }` arguments at
  the `getAgentChats.useQuery` sites (`agents-content.tsx`,
  `agents-subchats-sidebar.tsx`) and the `{ teamId }` keys at the `setData` sites
  (`active-chat.tsx`). Safe because `useAgentChats` / the adapter already ignore
  both (`trpc.chats.list.useQuery({})` runs unconditionally today).
- Delete the currently-dead `if (teamId)` optimistic update branch in
  `active-chat.tsx`; do not convert it into a new unconditional update path. The
  existing desktop `chats.list` cache update remains the behavior-preserving path.
- Remove the inert `teamId` prop/type plumbing from `ChatViewInner`,
  `ChatInputArea`, and `AgentsFileMention`.
- Simplify the `getAgentChats` adapter signatures to drop the now-unused team params.
- **Keep** `helperApisSetupPrompt*` — a real, wired feature, not residue.

Explicitly **out of scope** (separate, separately gated slices): the workbench
rename/demote; provider-contract UI faithfulness and the "claude privileged / codex
second-class" product decision; and the canonical **entity** vocabulary
(Project / Workspace / Chat / Agent / Sub-chat) change — a different vocabulary axis
that is gated on a vocabulary table.

## Capabilities

### New Capabilities
- `fork-residue-hygiene`: the renderer must not carry inert multi-tenant
  team-scoped state, and onboarding provider/auth selection must use provider-auth
  vocabulary rather than billing/payment vocabulary in runtime-facing code, because
  the app has no payment system. Legacy storage/i18n keys may stay stable for
  compatibility.

### Modified Capabilities
<!-- None. Behavior-preserving: the rename keeps key/values/routing identical, and
     the removed team state is already inert. `project-onboarding` already describes
     this step as "provider onboarding", so no requirement text changes. -->

## Impact

- **Code (renderer):** `src/renderer/lib/atoms/index.ts` (rename + 2 removals),
  `src/renderer/App.tsx`, the onboarding pages + `billing-method-page.tsx` (rename),
  and the chat-data team de-keying in
  `src/renderer/features/agents/lib/agent-chat-api.ts`,
  `agents-content.tsx`, `agents-subchats-sidebar.tsx`, `active-chat.tsx`,
  `chat-input-area.tsx`, and `agents-file-mention.tsx`.
- **Persistence:** the billing key and values are unchanged (no migration); the
  `agents:selectedTeamId` key simply stops being written (harmless orphan).
- **User-facing behavior:** none. Onboarding routing and chat fetching are identical.
- **Product gate:** there is no real teams/billing today, only SaaS-named
  scaffolding; this neither adds nor forecloses real teams/billing. Future real
  teams/billing must be built deliberately, not revived from this inert scaffold.
- **Docs:** mark the §3 fork-leftover rows resolved in the reconciliation ledger.
