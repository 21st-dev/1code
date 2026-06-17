## Context
The current selector data model uses a mixed `FlatModelItem` union:

- `codex-source` for first-party Codex account source: `chatgpt` or `openai-api-key`
- `codex` for concrete OpenAI model IDs
- `provider-profile` for saved third-party or local provider profiles

Phase 1 made `codex-source` and `codex` separate groups in the menu. Phase 2 moves the first-party account source into its own control so the model menu represents models and provider choices more clearly.

## Goals
- Make "account source" and "model" visually and structurally distinct.
- Preserve existing Codex runtime behavior and source persistence.
- Keep provider profiles as explicit provider choices, not as first-party source toggles.
- Keep incompatible source/model combinations from reaching runtime startup.
- Keep bilingual UI coverage for all new app-authored labels and messages.

## Non-Goals
- Do not change Codex app-server, ACP fallback, provider gateway, or transport startup behavior.
- Do not change secure credential storage or provider profile schemas.
- Do not add a new runtime capability claim.
- Do not hide provider profiles that are already valid for Codex unless existing profile compatibility rules require it.

## Current Coupling
`CodexModelSource` is persisted globally and per sub-chat. It is read by chat creation, active chat continuation, and Codex transport startup. Concrete Codex models are filtered by source in chat entrypoints through `isCodexApiKeySupportedModel(modelId)`.

The important invariant is:

- API-key source must not select or start ChatGPT-only models.
- ChatGPT source may use ChatGPT-only models when the user's Codex/ChatGPT auth supports them.
- Provider-profile source is not the same as first-party ChatGPT/API-key source and should continue to route through provider-profile handling.

## Proposed UX
For Codex first-party runs, render a compact source control near the model selector:

- ChatGPT account
- OpenAI API key

The model picker then renders concrete OpenAI models and provider profile options. When the selected source is API key, ChatGPT-only models are disabled or filtered with an explicit explanation. If a user changes source to API key while a ChatGPT-only model is selected, the UI must choose one of these reviewed behaviors:

- switch to the first API-key-compatible model and show a short notice, or
- keep the source change pending until the user chooses a compatible model.

The implementation should pick one behavior and cover it with tests before completing this change.

## Implementation Notes
- Keep `CodexModelSource` as the persisted source type unless implementation evidence shows a migration is required.
- Prefer one shared helper for Codex source/model compatibility so `new-chat-form` and `chat-input-area` do not drift.
- `AgentModelSelector` should stop emitting `codex-source` rows once the new control is active.
- The transport layer should keep its current defensive fallback behavior; UI compatibility checks are a usability layer, not the final security boundary.
- Do not turn provider-profile source strings into first-party account source options.

## Verification
- Unit or component-level tests should cover account source rendering and incompatible model handling.
- Existing TypeScript, changed-line lint, OpenSpec validation, and relevant chat selector tests should pass.
- Manual smoke should verify English and Simplified Chinese labels where practical.
