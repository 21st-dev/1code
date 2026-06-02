## Context
The existing provider profile foundation already stores secrets in main-process
secure storage, exposes renderer-safe profile metadata, and starts Claude/Codex
runs through a local gateway. The remaining gap is observability: a failed
profile test does not explain which layer failed.

Diagnostics must improve trust without broadening the secret surface. Renderer
callers should receive typed status and redacted text only. Runtime startup
should continue to resolve provider credentials in the main process.

## Goals
- Diagnose provider profile setup through typed checks.
- Keep endpoint, auth, model, protocol, streaming, tool, vision, gateway, and
  runtime failures distinct.
- Persist a compact, renderer-safe diagnostic snapshot on the profile.
- Preserve existing provider profile storage and gateway boundaries.
- Add negative tests that secret-bearing strings are not returned or persisted.

## Non-Goals
- Do not add MCP import or deep-link preview in this change.
- Do not write or rewrite `~/.codex`, `~/.claude`, MCP config, skills, prompts,
  or external runtime config.
- Do not add quick switch, preset sharing, or provider pricing tables.
- Do not guarantee that every provider supports Claude and Codex equally.

## Decisions
- Reuse the saved provider profile as the diagnostic target; callers pass a
  profile id, not plaintext credentials.
- Run diagnostics in the main process where provider credentials can be read.
- Store diagnostics as JSON in the existing profile status column when possible
  to avoid a migration for the first slice.
- Represent each check with a stable `id`, `status`, optional `category`, and
  redacted message.
- Treat unsupported optional capabilities as `unsupported`, not `failed`.
- Run runtime startup checks as preflight checks only; they should validate
  local runtime executables and profile compatibility before provider work.
- Make redaction token-aware by redacting exact active token/header/gateway
  values before applying generic regex redaction.

## Risks / Trade-offs
- Some providers report sparse errors. Diagnostics should classify conservatively
  and include a sanitized message rather than inventing certainty.
- Tool and vision checks can be expensive or inconsistently supported. They
  should be opt-in or lightweight capability probes in the initial slice.
- A profile can pass endpoint/auth/model checks but still fail during full agent
  execution. The UI should present diagnostics as setup confidence, not a
  guarantee of all future requests.
