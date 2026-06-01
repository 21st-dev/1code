## Context
Locus is a local-first Electron app. Provider credentials should be owned by the main process because the renderer is not the security boundary. Existing Claude credentials and provider profiles already target main-process secure storage, but the Codex API-key path still uses renderer `localStorage`.

The shared `secure-storage` helper currently returns a `locus:v1:base64:` fallback when `safeStorage` is disabled or unavailable. `AuthStore` also writes a plaintext `.json` fallback when encryption fails. These fallbacks are useful for availability but conflict with the credential-security model.

## Goals
- Store new provider/Codex secrets only when Electron `safeStorage` encryption is available.
- Keep plaintext Codex API keys out of renderer persistence and out of recurring chat request payloads.
- Let the renderer display status such as `hasApiKey` and `encryptionAvailable` without reading the key.
- Migrate or discard legacy renderer-local Codex API-key data without using it as an ongoing auth path.
- Keep legacy base64/plaintext reads only for compatibility and migration.

## Non-Goals
- Do not build the full provider-profile gateway model in this change.
- Do not change bundled Codex CLI auth semantics beyond app-managed API-key injection.
- Do not store or use test credentials in source, tests, logs, OpenSpec, or fixtures.

## Decisions
- Add a main-process Codex API-key store under the app `userData` directory. The file contains only an encrypted `safeStorage` payload.
- Add Codex tRPC procedures for save/status/remove. Save receives plaintext only at the explicit user-save boundary; status and chat never return the key.
- Replace `authConfig.apiKey` in Codex chat input with a non-secret auth method selection. Main resolves and injects `CODEX_API_KEY` only when the user selected the API-key path and the encrypted key exists.
- Change `encryptStringForStorage()` to throw when secure storage cannot encrypt. `decryptStringFromStorage()` continues to read legacy `locus:v1:base64:` values so old data can be migrated or replaced.
- Change `AuthStore` to fail closed on new saves when encryption is unavailable. Legacy plaintext auth files are only migrated when secure storage is available.

## Risks / Trade-offs
- Systems without usable `safeStorage` can no longer save provider secrets. The app should surface this as a setup problem instead of silently writing plaintext.
- Existing renderer-local Codex keys cannot be silently reused if migration fails. The user must re-save the key once secure storage works.
- Existing legacy base64 rows remain readable. This is intentionally limited to compatibility and does not create new fallback credentials.

## Migration Plan
1. On renderer startup, detect the legacy Codex API-key `localStorage` entry.
2. Normalize it and call the main-process save mutation once.
3. Clear the legacy localStorage entry after the migration attempt so the renderer stops persisting plaintext.
4. If migration fails, prompt the user to re-save the key through the settings/onboarding UI.
