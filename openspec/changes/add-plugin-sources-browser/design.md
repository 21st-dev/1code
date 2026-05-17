## Context
Claude Code plugins and Codex plugins have different ownership and installation formats. The app can safely inspect local Claude marketplace folders and Codex cache folders, but it should not imply that 1Code owns Codex plugin install state or that remote marketplace operations are available.

## Goals
- Expose local/cache plugin sources in the existing Plugins settings area.
- Make runtime boundaries visible before users inspect individual packages.
- Provide practical installation guidance without mutating any external runtime.

## Non-Goals
- No one-click remote marketplace install.
- No remote source indexing or ranking.
- No Codex plugin enable/disable management.
- No Claude marketplace cloning or update flow.

## Decisions
- Source discovery is derived from the same local directories used by plugin discovery:
  - Claude Code: `~/.claude/plugins/marketplaces/`
  - Codex: `~/.codex/plugins/cache/`
- A source is represented separately from a plugin package so the UI can show empty or missing roots.
- Source trust is a display label only. It is derived conservatively from known local/cache paths and does not certify package safety.
- The UI uses a simple Installed/Sources segmented switch inside the existing Plugins tab instead of adding another settings sidebar item.
