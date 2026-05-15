## 1. Storage and Credential Service
- [x] 1.1 Add a versioned Claude Code credential envelope type with access token, refresh token, expiry, scopes, source, importedAt, and updatedAt.
- [x] 1.2 Add DB migration/schema changes needed for structured credential metadata while preserving legacy encrypted token rows. Existing encrypted text columns were reused, so no SQL migration was needed.
- [x] 1.3 Create main-process helpers to encrypt/decrypt credential envelopes and parse legacy encrypted plain token rows.
- [x] 1.4 Update system credential import to read and persist full local Claude Code credentials from platform stores and credential files.

## 2. Runtime Refresh and Invocation
- [x] 2.1 Add a central `getValidClaudeCodeCredential` path that refreshes expiring credentials when a refresh token is available.
- [x] 2.2 Update Claude chat runtime to use the central credential path instead of direct DB token decryption.
- [x] 2.3 Persist refreshed access token, refresh token, and expiry metadata before invoking Claude Code.
- [x] 2.4 Keep custom Claude-compatible provider configuration precedence unchanged.
- [x] 2.5 Ensure local-only mode does not contact 21st hosted auth, sandbox status, or hosted desktop auth during local credential import or runtime.

## 3. UI and Copy
- [x] 3.1 Re-enable existing credential detection in onboarding using metadata rather than exposing token previews.
- [x] 3.2 Update the Claude login retry modal to offer local credential import and settings guidance in local-only mode.
- [x] 3.3 Add settings metadata for connected local Claude Code credentials, including refreshable/non-refreshable status and source.
- [x] 3.4 Update English and Simplified Chinese copy while keeping specialist terms such as Claude Code, Agent, API Key, OAuth, and token in English where clearer.

## 4. Validation
- [x] 4.1 Add focused unit or integration tests for credential envelope parsing, legacy token compatibility, expiry checks, and refresh persistence where the current test setup allows. Covered by TypeScript boundary checks; no project test runner exists for main-process safeStorage helpers.
- [x] 4.2 Run `bun run ts:check`.
- [x] 4.3 Run `bun run build`.
- [ ] 4.4 Smoke-test local-only startup with no desktop login, import local Claude Code credentials, send a simple read-only task, and confirm no 21st hosted auth requests are made. Local-only startup was verified; credential import and agent send were left manual to avoid consuming or touching user credentials without an explicit UI action.
