# Qwen CLI Status Visibility Automated Verification

Date: 2026-06-26

Scope: automated checks for the Qwen CLI configuration visibility change. This
is not a real Electron GUI smoke.

## Commands

- `/opt/homebrew/bin/bun test tests/qwen-cli-status.test.ts tests/provider-routing-ux.test.ts`
- `/opt/homebrew/bin/bun run ts:check`
- `PATH="/opt/homebrew/bin:/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /opt/homebrew/bin/bun run lint`
- `PATH="/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /opt/homebrew/bin/openspec validate add-qwen-cli-status-visibility --strict --no-interactive`

## Results

- Qwen CLI status and provider-routing UX tests passed: 21 pass, 0 fail.
- Follow-up Qwen CLI status regression passed after parse-error hardening:
  10 pass, 0 fail, 43 assertions.
- TypeScript check passed.
- OpenSpec strict validation passed.
- Changed-line lint passed. Biome reported diagnostics only outside changed
  lines, and the repository lint wrapper ignored those legacy diagnostics.

## Security Boundary Checked

- Qwen settings summary exposes auth type, selected model, provider groups,
  bounded model labels, env-key names, `.env` presence, and sanitized origins.
- Tests verify API key values, `.env` values, settings env values, URL
  credentials, and query secrets do not appear in the renderer payload.
- Malformed Qwen settings parse errors now return fixed safe wording with only
  optional numeric location metadata; tests verify both prefixed and unprefixed
  secret fragments next to the JSON error do not appear in `parseError`.
- Source guard verifies Qwen remains runtime-managed and is not added as a
  Provider Profile target.
