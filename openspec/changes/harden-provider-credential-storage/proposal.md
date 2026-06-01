# Change: Harden provider credential storage

## Why
Codex API-key onboarding still persists the key in renderer `localStorage` and sends the plaintext key with every chat request. The shared secure-storage helper also creates base64/plaintext fallback artifacts when Electron `safeStorage` is unavailable, which makes credential storage look encrypted when it is not.

## What Changes
- Move app-managed Codex API-key persistence into main-process storage encrypted by Electron `safeStorage`.
- Replace renderer Codex API-key persistence with status-only reads plus save/remove mutations.
- Remove new base64/plaintext fallback writes from shared credential encryption paths and desktop auth storage.
- Preserve read-only legacy base64/plaintext compatibility only for migration to encrypted storage or user re-entry prompts.
- Add tests covering renderer plaintext persistence removal, chat schema hardening, fail-closed secure storage, and legacy read compatibility.

## Impact
- Affected specs: `provider-credential-storage`
- Affected code: secure storage helper, desktop auth store, Codex tRPC router, Codex renderer onboarding/settings/model selection, Codex ACP transport, credential tests
