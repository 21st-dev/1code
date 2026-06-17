## ADDED Requirements

### Requirement: Onboarding provider/auth selection uses provider vocabulary

The onboarding provider/auth selector MUST be named for what it does — selecting a
provider and authentication mode — and MUST NOT use billing/payment vocabulary in
runtime-facing code identifiers, types, or page/component names, because the
application has no payment system. Legacy compatibility storage keys and stable
i18n key identifiers MAY keep their existing names when renaming them would create
unnecessary migration or translation churn. Its persisted key and stored values
MUST remain stable across the rename so no onboarding state migration is required.

#### Scenario: Selector is named for provider/auth, not billing

- **WHEN** the onboarding provider/auth selection state is read in the renderer
- **THEN** it is exposed under provider-auth naming (not `billingMethod` /
  `BillingMethod` / a "billing" page), and `App.tsx` routes onboarding on it exactly
  as before
- **AND** any remaining "billing" string in this selector/onboarding surface is
  limited to a documented legacy storage key or stable internal i18n key
  identifier, not a runtime-facing selector name

#### Scenario: Rename preserves persisted state

- **WHEN** a user who already chose a provider/auth mode launches the renamed build
- **THEN** their selection is still read from the unchanged storage key with the
  unchanged value, and onboarding does not restart

### Requirement: The renderer carries no inert multi-tenant team state

The renderer MUST NOT persist or thread multi-tenant team-scoped state that nothing
sets. Chat-list queries MUST NOT be gated on a team identifier that is always unset,
the chat-data adapter MUST NOT expose team-keyed parameters it ignores, and inert
`teamId` props MUST NOT be threaded through chat input or file-mention components.

#### Scenario: No unset team state ships

- **WHEN** the renderer fetches the agent chat list
- **THEN** it does so without a `teamId` argument or a team-based `enabled` gate, and
  no `selectedTeamId` / team-dialog state exists to persist
- **AND** chat input and file mention components do not accept or forward an inert
  `teamId` prop

#### Scenario: Behavior is unchanged by removal

- **WHEN** the team scaffolding is removed
- **THEN** the agent chat list still loads identically, because the adapter already
  queried `trpc.chats.list` unconditionally and ignored `teamId`/`enabled`
