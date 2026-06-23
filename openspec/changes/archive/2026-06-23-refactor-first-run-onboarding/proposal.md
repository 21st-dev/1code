# Change: Refactor first-run onboarding

## Why

Current onboarding is split across `App.tsx` routing effects and five separate
full-screen pages. That hides the real setup state, auto-starts external login
flows, and makes provider, runtime, and project readiness feel like one blocker.

Recent work established clearer owners: Provider Profiles are the canonical
custom Claude path, Codex API keys live in main-process secure storage, Claude
Code credentials use the local credential owner, and repository selection can be
deferred for Quick chat. First-run onboarding should now present those facts
directly instead of acting as a chain of hidden gates.

## What Changes

- Replace the step-by-step full-screen gate with a single first-run setup surface
  that shows AI path, runtime/auth status, and project/Quick chat entry together.
- Require explicit user action before launching Claude Code or Codex browser/CLI
  login, importing local Claude credentials, or saving provider credentials.
- Derive onboarding readiness from existing main-process/runtime/provider owners
  and renderer-safe status queries, not from duplicated runtime or provider truth
  in the onboarding UI.
- Keep Claude API key and custom endpoint onboarding on the Provider Profile path,
  keep Codex API keys in main-process secure storage, and keep local Claude Code
  credentials in the Claude credential owner.
- Let users enter the app after one usable AI path is configured and project
  selection is either completed or intentionally deferred to Quick chat; secondary
  runtimes remain connect-later work in Settings.
- Localize new onboarding copy in English and Simplified Chinese and keep provider
  names, URLs, commands, model IDs, and raw diagnostics untranslated.

## Impact

- Affected specs: `first-run-onboarding` (new), `project-onboarding`,
  `provider-routing-ux`
- Related existing specs: `claude-code-credentials`, `codex-runtime-parity`,
  `provider-credential-storage`, `provider-runtime-bindings`,
  `ui-localization`, `local-only-cloud-guard`
- Affected code:
  - `src/renderer/App.tsx`
  - `src/renderer/features/onboarding/**`
  - `src/renderer/features/agents/components/codex-login-content.tsx`
  - `src/renderer/features/agents/hooks/use-claude-code-login-flow.ts`
  - `src/renderer/features/agents/hooks/use-codex-login-flow.ts`
  - `src/renderer/lib/atoms/index.ts`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - focused onboarding/provider/auth/i18n tests
- No database schema change is expected.
