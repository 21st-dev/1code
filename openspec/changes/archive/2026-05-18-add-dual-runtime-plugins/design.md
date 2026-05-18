## Context
Claude Code plugins and Codex plugins use different package roots and metadata formats:

- Claude Code: `~/.claude/plugins/marketplaces/<marketplace>/.claude-plugin/marketplace.json`
- Codex: `~/.codex/plugins/cache/<collection>/<plugin>/<version>/.codex-plugin/plugin.json`

The existing plugin execution path is Claude-specific: plugin enablement is stored in Claude settings, plugin commands/skills/agents are only consumed after Claude plugin enablement, and plugin MCP servers are wired into Claude MCP configuration. Codex plugin packages are already present on disk in Codex's cache, but this app does not currently own a Codex plugin enable/disable API.

## Decisions
- Treat the Plugins settings page as a runtime-aware package browser.
- Keep runtime package discovery separate from shared capability pages.
- Preserve Claude plugin enable/disable behavior, but do not auto-approve MCP servers on enable.
- Show Codex plugins as read-only installed packages with their exposed commands, skills, agents, and MCP server declarations.
- Continue routing reusable capabilities to shared Settings pages: Skills, App Agents, and MCP Servers.

## Non-Goals
- No Codex plugin installation or update flow.
- No cross-runtime plugin conversion.
- No shared plugin enable switch that claims to affect Claude and Codex at the same time.
- No remote marketplace search.
