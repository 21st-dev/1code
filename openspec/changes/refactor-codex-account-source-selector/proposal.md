# Change: Refactor Codex account source selection

## Why
The model selector currently carries both concrete Codex models and Codex account sources. Phase 1 split the visual groups, but users can still mistake "Codex ChatGPT" and "Codex API Key" for models because they remain selectable rows inside the model menu.

Codex source and model selection are also coupled: some Codex models are ChatGPT-only and must not be selectable through the API-key path. Moving account source out of the model menu needs an explicit compatibility design instead of a cosmetic component move.

## What Changes
- Move first-party Codex account source selection out of the model option list and into a distinct source control near the Codex model picker.
- Keep Codex model rows focused on concrete OpenAI model choices.
- Preserve provider-profile rows as provider choices rather than first-party account sources.
- Enforce source/model compatibility in the UI before runtime startup, including ChatGPT-only Codex models such as `gpt-5.3-codex-spark`.
- Localize new account-source labels, disabled states, and compatibility messages in English and Simplified Chinese.

## Impact
- Affected specs: `provider-routing-ux`, `ui-localization`
- Affected code: `src/renderer/features/agents/components/agent-model-selector.tsx`, `src/renderer/features/agents/main/chat-input-area.tsx`, `src/renderer/features/agents/main/new-chat-form.tsx`, `src/renderer/features/agents/atoms/index.ts`, `src/renderer/features/agents/lib/models.ts`, `src/renderer/features/agents/lib/acp-chat-transport.ts`, `src/renderer/features/agents/main/active-chat.tsx`, `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`, `src/renderer/lib/i18n/dictionaries.ts`
- Non-goals: no Codex runtime adapter changes, no provider gateway changes, no transport authentication changes, and no provider-profile storage schema changes.
