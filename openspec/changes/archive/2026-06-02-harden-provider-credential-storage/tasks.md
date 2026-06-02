## 1. OpenSpec
- [x] 1.1 Add provider credential storage proposal, design, and spec deltas.
- [x] 1.2 Validate `harden-provider-credential-storage` with strict OpenSpec checks.

## 2. Main Process Credential Storage
- [x] 2.1 Make secure-storage encryption fail closed when `safeStorage` is unavailable or encryption fails.
- [x] 2.2 Keep legacy base64 decrypt support read-only for compatibility.
- [x] 2.3 Remove new plaintext `.json` auth fallback writes from `AuthStore`.
- [x] 2.4 Add a main-process Codex API-key store with save/status/read/remove operations.
- [x] 2.5 Add Codex tRPC procedures for save/status/remove without returning plaintext keys.

## 3. Codex Runtime Flow
- [x] 3.1 Remove `authConfig.apiKey` from Codex chat input.
- [x] 3.2 Resolve app-managed Codex API keys inside main before ACP startup and inject `CODEX_API_KEY` only there.
- [x] 3.3 Keep provider-profile and ChatGPT auth paths separate from app-managed API-key injection.

## 4. Renderer Migration and UI
- [x] 4.1 Remove `codexApiKeyAtom` renderer persistence.
- [x] 4.2 Add legacy localStorage migration through the main-process save mutation.
- [x] 4.3 Update onboarding/settings/model selection/transport code to use status-only Codex API-key state.
- [x] 4.4 Clear legacy renderer localStorage after migration attempts and prompt for re-save on failure.

## 5. Tests and Verification
- [x] 5.1 Add tests that prevent reintroducing renderer Codex API-key localStorage persistence.
- [x] 5.2 Add tests that Codex chat no longer accepts `authConfig.apiKey`.
- [x] 5.3 Add tests that secure-storage does not produce new base64/plaintext fallback writes.
- [x] 5.4 Add tests that legacy base64 decrypt remains read-only compatible.
- [x] 5.5 Run `openspec validate harden-provider-credential-storage --strict --no-interactive`.
- [x] 5.6 Run `bun test tests`.
- [x] 5.7 Run `bun run ts:check`.
- [x] 5.8 Run `bun run build`.
- [x] 5.9 Run `git diff --check`.
