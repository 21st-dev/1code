## Runtime Provider Binding Smoke

Date: 2026-06-02

Environment:
- `LOCUS_USER_DATA_DIR=/Users/ethan/Documents/GitHub/agent-code-for-me/tmp/runtime-binding-smoke-20260602-055037/user-data`
- `HOME=/Users/ethan/Documents/GitHub/agent-code-for-me/tmp/runtime-binding-smoke-20260602-055037/home`
- Local mock OpenAI-compatible provider: `http://127.0.0.1:19777/v1`

Evidence artifacts:
- Cropped window recording: `tmp/runtime-binding-smoke-20260602-055037/evidence/runtime-binding-smoke-window.mov`
- Full-screen interaction recording: `tmp/runtime-binding-smoke-20260602-055037/evidence/runtime-binding-smoke.mov`
- Cropped screenshot: `tmp/runtime-binding-smoke-20260602-055037/evidence/runtime-binding-smoke-clean.png`
- Dev app log: `tmp/runtime-binding-smoke-20260602-055037/evidence/dev-smoke.log`
- Mock provider log: `tmp/runtime-binding-smoke-20260602-055037/evidence/mock-provider.log`
- Seeded DB evidence: `tmp/runtime-binding-smoke-20260602-055037/evidence/db-seed.txt`

Observed result:
- The Electron dev app loaded in local mode with the isolated user data path.
- `Runtime Binding Smoke` appeared in Settings > Models > Advanced model routing.
- Diagnostics completed against the local mock provider.
- UI showed Endpoint, Auth, Model, Protocol, Streaming, Gateway, and Runtime checks as OK.
- UI showed `claude` and `codex` target runtime chips for the profile.
- The profile used `auth_mode=none`, no encrypted token, and only redacted metadata headers.
- A secret grep across smoke evidence and isolated user data found no seeded smoke token strings.
