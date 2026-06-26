# Change: Gate Qwen Code runtime behind a Settings toggle

## Why

Qwen Code is currently exposed by the environment-only
`LOCUS_ENABLE_QWEN_CODE_RUNTIME` gate. That is useful for dev smoke runs, but it
is not a user-visible product setting. Users can already see passive Qwen CLI
setup guidance once the env gate is on, so the missing piece is a deliberate
Settings toggle that owns runtime exposure.

This is intentionally the smaller Qwen follow-up: runtime visibility only. It
does not bind Qwen to Locus Provider Profiles, gateway routing, or provider
credentials.

## What Changes

- Add a persisted, off-by-default `qwenRuntimeEnabled` runtime feature setting
  under the existing main-process runtime-feature settings owner.
- Replace product Qwen runtime exposure's env-only gate with the persisted
  Settings value.
- Keep `LOCUS_ENABLE_QWEN_CODE_RUNTIME` as a dev/test-only override, so existing
  tests and explicit smoke harnesses can still enable Qwen outside product
  gating.
- Add a Settings > Models experimental/advanced Qwen runtime toggle.
- When Qwen is off, hide Qwen runtime surfaces: manifest/engine option, Qwen
  onboarding path, and Qwen CLI setup section. Qwen chat/start/update/reset
  routes fail closed when called directly.
- When Qwen is on, keep the existing passive Qwen CLI setup guidance exactly in
  its current role: install/auth/docs/path guidance only, no install execution and
  no `~/.qwen` mutation.
- Preserve Qwen executable path override across toggling.

## Non-Goals

- No Qwen Provider Profile target.
- No Qwen provider-profile/gateway binding.
- No migration of Qwen auth/model/base URL out of the Qwen CLI's own config.
- No Qwen managed install or auth-file writes.
- No change to Kun's Settings gate.

## Impact

- Affected specs:
  - `qwen-code-runtime`
  - `qwen-cli-setup-guidance`
- Directly changed code:
  - `src/shared/agent-runtime-capabilities.ts`
  - `src/main/lib/agent-runtime/runtime-feature-settings.ts`
  - `src/main/lib/agent-runtime/runtime-registry.ts`
  - `src/main/lib/trpc/routers/agent-runtime.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  - `src/renderer/features/onboarding/components/panels/qwen-action.tsx`
  - tests for runtime settings, runtime registry, Qwen CLI setup guidance, and
    onboarding status
- Consumer surfaces verified without changing their owner logic:
  - `src/renderer/features/onboarding/lib/use-setup-status.ts`
  - `src/renderer/features/onboarding/lib/derive-setup-status.ts`
  - `src/renderer/features/onboarding/lib/onboarding-status.ts`
  - runtime-manifest consumers in chat and engine selectors that already follow
    manifests
