# Change: Split chat composition into Engine + Model controls

## Why

The chat composition UI conflates two separate decisions — which runtime to run
and which model/credentials to use — and does it inconsistently across runtimes.
Today the second control is three different things: Claude/Codex share a combined
`AgentModelSelector` that also switches runtime when you pick a model
(`agent-model-selector.tsx`), Kun has a bespoke `KunProviderProfileSelector`, and
Qwen is a static label — on BOTH the new-chat form and the active-chat input
(`new-chat-form.tsx`, `chat-input-area.tsx`). The backend is already
runtime-neutral (manifests, runtime-dispatch route); the UI is not. This is a
responsibility split, not a rename.

## What Changes

- **Engine control** — one control selects the runtime (Claude Code / Codex /
  Qwen Code / Kun) and is the ONLY place the runtime changes. It surfaces
  manifest- and setup-derived status (experimental / unavailable / setup-required)
  by consuming the existing runtime capability manifest — no manifest data change.
  Setup-required or unavailable engines are non-runnable: they may be disabled or
  route to setup, but they do not start runs or create sub-chats.
- **Model control** — one control, identical in shape for every runtime, scoped to
  the selected Engine. It lists that runtime's sources/profiles/models/BYO and
  shows contextual options (Codex thinking + account source, Claude thinking)
  ONLY when the selected engine/model supports them. Its selected value is
  per-engine (reads/writes the existing `lastSelected{Claude,Codex,Kun}ModelSource`
  / `lastSelectedModelId` atoms). It NEVER switches the runtime.
- **Engine switch flow extends to all four runtimes, on both surfaces.**
  The existing "continue with a different provider → new sub-chat with history
  attachment + model-preference inheritance + confirm" flow is today typed
  `"claude-code" | "codex"` only (`active-chat.tsx`
  `handleContinueWithProvider`). This change generalizes the type AND the flow
  (including per-runtime model-preference inheritance, and the no-provider-profile
  case) to all four runtimes. Empty active sub-chats keep the existing lighter
  behavior and switch engine in place; non-empty active chats confirm and create a
  new sub-chat. The confirmation that lived inside `AgentModelSelector`
  (`CrossProviderConfirmDialog`) moves onto the Engine control.
- **Remove the three-way split.** `AgentModelSelector`'s runtime-switching is
  removed; `KunProviderProfileSelector` and the Qwen static label are replaced by
  the one Model control. Qwen renders a **runtime-managed** state (its
  `providerProfiles` is `degraded`), NOT a faked provider-profile parity, and no
  provider secrets reach the renderer.
- Vocabulary: the two controls are named **Engine** and **Model**.
- New Engine/Model labels, statuses, and setup actions are localized in English
  and Simplified Chinese.
- **Out of scope:** the Settings `agents-models` tab is NOT split this change
  (it mixes models/accounts/profiles/setup); splitting it into Engines / Providers
  is a focused follow-up to avoid an IA-rewrite blast radius.

## Capabilities

### Modified Capabilities
- `provider-routing-ux`: add the inline Engine/Model two-control contract — Engine
  as the sole runtime switch with manifest-derived status, a runtime-scoped Model
  control with contextual options that never switches runtime, the four-runtime
  engine-switch-starts-a-new-chat flow on both new-chat and active-chat surfaces,
  and runtime-managed Model state for runtimes without provider-profile parity.
  The existing Codex account-source and source/model-compatibility requirements
  are unchanged (account source remains a contextual option inside the Model
  control).

## Impact

- Affected code:
  - `src/renderer/features/agents/main/new-chat-form.tsx`,
    `chat-input-area.tsx` (replace the three-way second control with Engine +
    Model)
  - `src/renderer/features/agents/components/agent-model-selector.tsx` (drop
    runtime switching + `CrossProviderConfirmDialog`; becomes the Model control or
    is superseded by a runtime-neutral Model component)
  - new runtime-neutral Model control + Engine control components; remove
    `kun-provider-profile-selector.tsx`'s bespoke role
  - `src/renderer/features/agents/main/active-chat.tsx`
    (`handleContinueWithProvider` / `handleInputProviderChange` generalized from
    `"claude-code" | "codex"` to all runtimes; per-runtime model-pref inheritance)
  - renderer atoms for per-engine model source / selection
  - `src/renderer/lib/i18n/dictionaries.ts` (Engine/Model/status/setup copy in
    English and Simplified Chinese)
- Consumes the existing `agent-runtime-capabilities` manifest for status gating;
  no manifest data change.
- Secret safety unchanged: the renderer continues to handle only source/profile
  ids, never plaintext provider secrets.
- No backend/runtime behavior change; default runtimes and flags unchanged.
