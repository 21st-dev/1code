# Change: Add secure Claude-compatible provider configuration

## Why
Users can already enter a custom Claude model, token, and base URL, but the current path stores the token in renderer localStorage and only maps it to `ANTHROPIC_AUTH_TOKEN`. Claude Code-compatible third-party providers need first-class support for both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, plus a verified local agent smoke test.

## What Changes
- Move custom Claude provider credentials out of renderer localStorage into main-process secure storage using Electron `safeStorage`.
- Add an explicit provider auth mode so users can choose whether the token is exported as `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`.
- Preserve the existing model and base URL custom-provider flow while preventing raw tokens from being passed through renderer chat requests.
- Migrate any existing `agents:claude-custom-config` localStorage value into secure storage and clear the renderer-stored token.
- Redact provider secrets in logs and debug output.
- Add a documented smoke-test flow for logged-out local startup, local repo selection, provider setup, and a simple agent read task.

## Impact
- Affected specs: `claude-provider-config`
- Affected code:
  - `src/renderer/lib/atoms/index.ts`
  - `src/renderer/features/onboarding/api-key-onboarding-page.tsx`
  - `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  - `src/renderer/features/agents/lib/ipc-chat-transport.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/claude/env.ts`
  - `src/main/lib/db/schema/index.ts`
  - `drizzle/*`
- Validation:
  - `bun run build`
  - `bun run ts:check` or clear reporting of any remaining unrelated type debt
  - Electron dev smoke test from logged-out startup through a simple agent prompt
  - Third-party Anthropic-compatible endpoint smoke test using a provided test token/base URL
