## 1. Design And State Boundaries
- [x] 1.1 Confirm the source/model compatibility behavior for switching from ChatGPT to API key while a ChatGPT-only model is selected.
- [x] 1.2 Identify a shared compatibility helper for `isCodexApiKeySupportedModel` usage across new chat and active chat entrypoints.
- [x] 1.3 Confirm provider-profile selections remain outside the first-party account source control.

## 2. UI Implementation
- [x] 2.1 Add a Codex account source control near the Codex model picker in new chat and active chat entrypoints.
- [x] 2.2 Remove first-party `codex-source` rows from the model menu when the separate source control is present.
- [x] 2.3 Keep concrete OpenAI model options under the model picker and provider-profile options under provider-profile grouping.
- [x] 2.4 Add clear disabled/notice copy for ChatGPT-only models when API key source is active.

## 3. Compatibility And Persistence
- [x] 3.1 Preserve existing `CodexModelSource` persistence for global and per-sub-chat selections.
- [x] 3.2 Ensure source/model compatibility is resolved before send in both new chat and active chat flows.
- [x] 3.3 Keep Codex transport fallback behavior unchanged and covered by existing tests.

## 4. Localization And Tests
- [x] 4.1 Add English and Simplified Chinese labels for account source, source choices, and compatibility notices.
- [x] 4.2 Add targeted tests for source/model compatibility and selector rendering.
- [x] 4.3 Run `openspec validate refactor-codex-account-source-selector --strict --no-interactive`.
- [x] 4.4 Run `bun run lint`, `bun run ts:check`, and relevant targeted tests.
