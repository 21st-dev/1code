---
name: provider-security-review
description: Security checklist for custom Claude/Codex provider configuration and local agent auth flows.
---

Use this skill when reviewing provider configuration, custom models, API keys, auth modes, or local agent smoke tests.

Checklist:
- Confirm where the token originates and where it is stored.
- Verify plaintext secrets are not stored in renderer `localStorage`.
- Verify plaintext secrets are not sent from renderer to main after initial save unless explicitly required.
- Confirm request-time env construction happens in the main process.
- Check whether both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` modes are intentionally supported.
- Confirm logs redact or omit secrets.
- Confirm database storage is encrypted when storing credentials.
- Confirm stale `.env` values cannot silently override the selected secure provider config.
- Confirm error messages do not leak sensitive values.

Smoke-test evidence to collect:
- App can start in logged-out local mode.
- A local repo can be opened.
- The selected custom provider/model is used for an actual agent request.
- The agent can call basic tools such as `Bash`, `Glob`, and `Read` when appropriate.
- Provider dashboard or runtime logs show the expected model was used, without exposing secrets.

Report format:
- Confirmed secure behavior.
- Confirmed risks or regressions.
- Unknowns requiring verification.
- Minimal recommended fixes.
