# Change: Add Qwen CLI status visibility

## Why

Qwen currently appears as a runtime-managed engine in Locus, but Settings only says
that Qwen auth/model setup belongs inside Qwen Code. Users cannot see which Qwen
CLI auth type, model, or provider list Locus will inherit before starting a run.

## What Changes

- Add a renderer-safe Qwen CLI configuration summary to Qwen Settings when the
  Qwen runtime gate is enabled.
- Read only non-secret metadata from the user's Qwen Code settings and `.env`
  presence: selected auth type, selected model, provider groups, model labels,
  sanitized provider origins, configured env-key names, and parse/missing state.
- Keep Qwen runtime-managed: do not expose Qwen as a Locus Provider Profile
  target, do not route Qwen through the Locus provider gateway, and do not write
  Qwen auth/model/provider settings.

## Impact

- Affected specs: `qwen-cli-setup-guidance`
- Affected code: `src/main/lib/qwen/qwen-cli-status.ts`,
  `src/main/lib/trpc/routers/agent-runtime.ts`,
  `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`,
  `src/renderer/lib/i18n/dictionaries.ts`,
  `tests/qwen-cli-status.test.ts`
