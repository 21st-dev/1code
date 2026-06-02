## Context
Provider profile storage and the local provider gateway already exist. Claude
runtime runs can resolve a `provider-profile:<id>` model source to a loopback
Anthropic-compatible gateway. Codex runtime runs can receive a provider profile
ID from the renderer and use ACP runtime config overrides to route through the
loopback Responses-compatible gateway.

The remaining risk is not a missing second implementation. The risk is that
this binding behavior could regress silently, leak secrets through renderer or
logs, or be confused with persistent mutation of global CLI config.

## Goals
- Keep renderer inputs limited to non-secret provider profile IDs.
- Resolve provider secrets only in the Electron main process.
- Pass runtimes loopback gateway URLs and process-local gateway tokens rather
  than upstream provider credentials.
- Ensure Codex provider-profile sessions do not inherit stale `CODEX_API_KEY` or
  `OPENAI_API_KEY` values from shell/process environments.
- Ensure Codex provider-profile sessions do not inherit unrelated provider
  credentials such as Anthropic, OpenAI, Codex, or generic token/secret env vars.
- Scope local gateway tokens to the profile and protocol endpoint they were
  issued for.
- Reject or scrub secret-bearing provider profile headers before they can be
  stored as plaintext metadata.
- Preserve explicit early failure for provider profiles that do not target the
  requested runtime.

## Non-Goals
- External config scan, backup, apply, or restore.
- New runtime gateway protocols beyond the existing Anthropic, OpenAI Chat, and
  OpenAI Responses compatibility layer.
- Broad Settings UI redesign.

## Design
The implementation should avoid reworking runtime adapters. Instead, extract the
Codex provider-profile binding construction into a small tested helper:

- environment assembly
- ACP `-c` config override construction
- auth method selection
- redacted argument previews for logs

The existing Claude binding path remains validated through provider gateway and
desktop smoke evidence. If the smoke uncovers a concrete Claude gap, fix that
gap in the same vertical slice with a focused regression test.

## Security Notes
- Main-process runtime config may contain gateway tokens; renderer payloads may
  not.
- Log output may include provider source, profile ID/name status, and redacted
  ACP args, but not upstream provider tokens or gateway tokens.
- Normal runtime starts must not write `~/.codex/config.toml`,
  `~/.codex/auth.json`, or `~/.claude/settings.json`.
- Provider profile custom headers are treated as metadata only. Authentication
  belongs in the profile auth mode and encrypted token field, not in plaintext
  custom headers.
- Legacy renderer-stored Claude provider tokens should be cleared after a
  migration attempt even when secure storage is unavailable, forcing an explicit
  re-save through the main-process secure storage path.
