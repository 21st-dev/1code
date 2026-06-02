## Context
Locus already has MCP visibility and some runtime-specific MCP management, but
there is no safe import preview contract for links or shared presets. The first
slice should be deliberately small and reversible: parse payloads into pending
preview objects and display exactly what would be affected.

## Goals
- Make hidden command arguments, env values, headers, runtime target, and
  activation state visible before import.
- Ensure env/header values are represented as redacted presence metadata.
- Keep all parsed previews renderer-safe.
- Avoid every external config write and activation path in this change.
- Add tests proving malicious or secret-bearing payloads are sanitized.

## Non-Goals
- Do not apply imported MCP entries.
- Do not enable MCP servers from a deep link.
- Do not write `~/.codex`, `~/.claude`, `.mcp.json`, skills, prompts, or project
  files.
- Do not build provider preset sharing or quick switch.
- Do not build a general backup/restore workflow.

## Decisions
- Support a small JSON payload shape for `locus://mcp/import?...` and the dev
  protocol equivalent.
- Treat any unsupported or oversized payload as invalid before rendering.
- Store pending import previews only in memory/UI state for the first slice.
- Preserve raw values only long enough to build redacted metadata in main or
  shared parser code; renderer-facing objects contain keys and value presence,
  not values.
- Default `enabled` to `false` in the preview even when a payload requests
  activation, and surface the requested state as a warning.
- Sanitize protocol logging by logging only scheme, host, pathname, and redacted
  query-key names.

## Risks / Trade-offs
- Preview-only import is not immediately productive for users who expect one
  click installation. That is intentional; apply/backup/restore needs a separate
  approved slice.
- MCP ecosystems use multiple link formats. This first slice should reject
  unknown payloads rather than guessing and hiding fields.
