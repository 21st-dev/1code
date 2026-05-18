# Change: Add local Claude Code credential import

## Why
Local-only mode blocks the existing 21st hosted Claude Code auth sandbox, so Claude Code subscription users need a first-class way to use credentials already present on their own machine. The old system-token import path was disabled because it imported only a short-lived access token, which can expire after a few hours and leave local chats broken.

## What Changes
- Add a local Claude Code credential import flow that reads complete Claude Code credentials from the user's system credential store or Claude credentials file without contacting 21st hosted auth.
- Store the imported access token, refresh token, expiry, scopes, and source metadata in main-process secure storage.
- Refresh expiring Claude Code access tokens locally through Anthropic's token endpoint when a refresh token is available, then persist the updated credential before agent invocation.
- Update onboarding and auth-retry UI so local-only mode offers local credential import and settings guidance instead of forcing the hosted sandbox OAuth flow.
- Keep hosted sandbox OAuth behind the existing local-only guard for internal/hosted builds, but do not use it as the default local-first path.
- Add validation and smoke-test coverage for importing existing Claude Code credentials, refreshing expired tokens, and running a simple local Claude Code agent request without 21st hosted auth.

## Impact
- Affected specs: `claude-code-credentials`
- Affected code:
  - `src/main/lib/claude-token.ts`
  - `src/main/lib/trpc/routers/claude-code.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/db/schema/index.ts`
  - `drizzle/*`
  - `src/renderer/features/onboarding/anthropic-onboarding-page.tsx`
  - `src/renderer/components/dialogs/claude-login-modal.tsx`
  - `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
- Validation:
  - `openspec validate add-local-claude-code-credentials --strict --no-interactive`
  - `bun run ts:check`
  - `bun run build`
  - local Electron smoke test in local-only mode with no desktop login and no 21st hosted auth calls
