# Hardcoded English Sweep

## Commands Used

```sh
rg -n '>[A-Z][A-Za-z][^<{]{2,}<|placeholder=\"[A-Z][^\"]+\"|aria-label=\"[A-Z][^\"]+\"|title=\"[A-Z][^\"]+\"|toast\.(success|error|info|warning)\(\"[A-Z][^\"]+\"|toast\.(success|error|info|warning)\(`[^`]*[A-Z][^`]*`' src/renderer --glob '*.tsx' --glob '*.ts' --glob '!lib/i18n/dictionaries.ts'
```

## Final Sweep Added

- Chat branch creation dialog strings and toasts.
- Agent model selector, cross-provider confirmation dialog, model search, and model empty state.
- Quick comment reply popover.
- Agent plan sidebar loading, empty, error, view-mode, close, copy, and approve labels.
- Header open-sidebar button and tooltip.

## Intentional Exclusions

The sweep keeps these categories in English or mixed English/Chinese on purpose:

- Product, provider, and brand names: Claude Code, OpenAI Codex, GitHub, Linear, VS Code, JetBrains, Ollama, Sonnet, Opus, Haiku.
- Technical nouns that read more naturally for this audience in English: Agent, Model, MCP, PR, Branch, Worktree, Commit, Push, Pull, Fetch, Rebase, Merge, Diff, Terminal, Plan, Task, API Key, Base URL, JSON, HTTP, SSH, MIME, PID.
- User-authored or generated content: chat messages, agent responses, tool inputs/results, commands, branch names, file paths, markdown, code blocks, diffs, model IDs, prompts, and logs.
- Low-level shared primitives and platform chrome: icon `<title>` text, hidden `sr-only` close labels in base dialogs, resize handle helper labels, Windows title-bar controls, update-banner controls, and diagram/media viewer controls.
- Debug/developer surfaces: diagnostics, logs, prompt editors, raw config labels, JSON viewers, and internal state/error metadata.

## Known Follow-Up Areas

These are still worth migrating in a later batch if the goal becomes full-app coverage:

- Settings secondary tabs: Appearance, Keyboard, Beta, Debug, Projects/Worktrees, MCP Servers, Plugins, Skills, and Custom Agents.
- Peripheral chat panels: sub-chat selector/sidebar, archive popover, agent diff view, MCP server status popover, image fullscreen viewer, and mobile chat header.
- Shared utility surfaces: Mermaid diagram viewer, Open In menu, update banner, Kanban workspace context menus, and a few commit/push action toasts.
