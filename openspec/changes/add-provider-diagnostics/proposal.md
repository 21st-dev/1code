# Change: Add provider diagnostics

## Why
Provider profiles can already be created, stored securely, and routed through
Claude/Codex gateway paths, but the current profile test records only a generic
success or failure message. Users need a trustworthy diagnosis that separates
endpoint reachability, authentication, model authorization, protocol support,
streaming, tool/vision capability, gateway conversion, and runtime startup
problems without exposing credentials.

## What Changes
- Add structured provider diagnostic runs for saved provider profiles.
- Classify failures into stable categories such as endpoint unreachable, auth
  failed, model denied, protocol mismatch, streaming unsupported, tool
  unsupported, vision unsupported, gateway failed, and runtime unavailable.
- Return renderer-safe diagnostic summaries and persist only sanitized status.
- Redact active provider tokens, gateway tokens, custom header values, OAuth
  tokens, and derived authorization headers before returning or storing errors.
- Keep diagnostics separate from MCP import, external config writes, and
  provider preset sharing.

## Impact
- Affected specs: `provider-diagnostics`
- Affected code: provider profile types, provider gateway diagnostics,
  provider profile tRPC router, Settings > Models diagnostic display, provider
  profile tests
