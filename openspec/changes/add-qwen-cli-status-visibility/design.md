## Context

Qwen Code is intentionally runtime-managed in Locus. The existing Settings gate
controls whether Locus exposes and starts `qwen --acp`, while Qwen Code itself
owns auth/model/provider setup through `/auth` and `~/.qwen/settings.json`.

The current UI is technically honest but leaves users without enough visibility:
they can see whether the CLI exists, but not what provider/model the CLI is
configured to use.

## Goals

- Show a clear, renderer-safe summary of the Qwen CLI configuration inherited by
  Locus.
- Preserve the existing boundary that Qwen provider/model/auth are managed by
  Qwen Code, not by Locus Provider Profiles.
- Make missing, unreadable, or invalid Qwen settings explicit without treating
  CLI detection as provider readiness.

## Non-Goals

- No Qwen Provider Profile target.
- No Locus provider gateway binding for Qwen.
- No Qwen API key, OAuth token, `.env` value, raw environment, or full settings
  JSON exposure to the renderer.
- No writes to `~/.qwen/settings.json` or `~/.qwen/.env`.
- No claim that provider connectivity was verified.

## Decisions

- Extend the existing `getQwenCliStatus` DTO instead of adding a second Qwen
  status route. This keeps CLI availability and inherited CLI configuration in
  the current Qwen setup owner.
- Parse Qwen settings in the main process and return only bounded metadata:
  selected auth type, selected model, provider group names, model ids/names,
  sanitized base URL origins, env-key names, `.env` presence, and parse status.
- Sanitize provider URL display by stripping credentials, path, query, and hash.
  Invalid or secret-like URLs are omitted from renderer metadata.
- Treat the summary as informational. It must not mark onboarding complete or a
  runtime run as ready.

## Risks / Trade-offs

- Qwen Code settings format may evolve. The parser should tolerate missing or
  differently shaped fields and show `unknown`/parse diagnostics rather than
  failing the whole CLI status.
- Provider model ids are not credentials, but still come from a user-owned file.
  Bound list sizes and string lengths before returning renderer metadata.

## Verification

- Unit tests cover settings missing, parse failure, selected auth/model summary,
  provider list bounds, env-key value redaction, and URL origin sanitization.
- Static UI tests or focused source assertions ensure Settings renders the new
  summary without adding a Qwen Provider Profile target.
