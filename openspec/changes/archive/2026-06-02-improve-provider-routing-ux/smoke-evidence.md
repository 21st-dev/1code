# Smoke Evidence

Date: 2026-06-02

Environment:
- Branch: `codex/cc-switch-runtime-center`
- App command: `bun run dev`
- App user data: `/Users/ethan/Documents/GitHub/agent-code-for-me/tmp/provider-routing-ux-smoke-20260602-063831/user-data`
- Mock provider: `http://127.0.0.1:19778/v1`

Artifacts:
- Screenshot: `/Users/ethan/Documents/GitHub/agent-code-for-me/tmp/provider-routing-ux-smoke-20260602-063831/evidence/provider-routing-ux-success.png`
- Recording: `/Users/ethan/Documents/GitHub/agent-code-for-me/tmp/provider-routing-ux-smoke-20260602-063831/evidence/provider-routing-ux-smoke-success.mov`
- Dev log: `/Users/ethan/Documents/GitHub/agent-code-for-me/tmp/provider-routing-ux-smoke-20260602-063831/evidence/dev-smoke.log`
- Mock provider log: `/Users/ethan/Documents/GitHub/agent-code-for-me/tmp/provider-routing-ux-smoke-20260602-063831/evidence/mock-provider.log`

Seeded profile:
- Name: `UX Routing Smoke`
- Protocol: `openai-chat`
- Auth mode: `none`
- Base URL: `http://127.0.0.1:19778/v1`
- Model: `ux-smoke-model`
- Targets: `claude`, `codex`, `helpers`, `local`

Result:
- The app opened Settings > Models in the real Electron window.
- The provider preset area rendered as chips with a side summary.
- The saved provider profile rendered as a first-class row with protocol, auth, runtime targets, defaults, and diagnostics.
- Clicking `测试` ran diagnostics against the mock provider.
- The profile status changed to `正常`.
- Diagnostics rendered endpoint, auth, model, protocol, streaming, tools, vision, gateway, and runtime target rows.
- The mock provider received two `POST /v1/chat/completions` calls with empty auth headers.

Secret scan:
- No `onboarding-redacted-sentinel`, gateway token name, provider token, `sk-*`, `Authorization`, or `Bearer ` strings were found in text evidence.
- SQLite profile check reported `auth_mode=none` and `has_token=0`.

Validation:
- `openspec validate improve-provider-routing-ux --strict --no-interactive`
- `bun test tests/provider-routing-ux.test.ts tests/provider-profile-storage-security.test.ts tests/i18n-dictionary.test.ts`
- `bun test tests/provider-routing-ux.test.ts tests/provider-profile-storage-security.test.ts tests/provider-runtime-binding.test.ts tests/provider-gateway-scope.test.ts tests/provider-profile-diagnostics.test.ts tests/provider-profile-transforms.test.ts tests/provider-credential-storage.test.ts tests/i18n-dictionary.test.ts`
- `bun run ts:check`
- `bun run build`
- `bun test tests`
- `git diff --check`
