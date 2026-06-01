# Change: Add MCP deep-link import preview

## Why
Runtime Center planning identified MCP deep links as a high-risk import surface:
links can hide command arguments, environment values, target runtime, target
scope, activation behavior, and file-write intent. Locus needs a preview-only
pending import path before any MCP preset sharing, activation, or external
config writes are considered.

## What Changes
- Add a renderer-safe parser and pending preview model for MCP import links.
- Show command or URL, args, env keys, redacted value presence, headers keys,
  target runtime, target scope, requested enabled state, and files that would be
  written.
- Default imported MCP entries to pending/disabled until a future explicit
  apply flow is approved.
- Sanitize raw deep-link logging so OAuth codes, states, tokens, env values, and
  headers are not written to logs.
- Keep this slice preview-only: no activation, no install, and no writes to
  `~/.codex`, `~/.claude`, MCP config, skills, prompts, or project files.

## Impact
- Affected specs: `runtime-mcp-import-preview`
- Affected code: deep-link parsing helpers, main-process protocol handler,
  settings/dialog preview surface, tests
