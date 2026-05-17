## 1. Audit
- [x] 1.1 Run the current hardcoded English sweep and group hits by product area.
- [x] 1.2 Classify hits as migrate, technical-term keep, raw/generated keep, or low-level/debug keep.

## 2. Settings Surfaces
- [x] 2.1 Migrate Appearance, Keyboard, Beta, Debug, Worktrees, Projects/Worktrees, MCP Servers, Plugins, Skills, Custom Agents, and custom Agent dialog app-authored strings.
- [x] 2.2 Keep specialist terms such as MCP, Plugin, Skill, Agent, Model, JSON, HTTP, and Worktree in English where clearer.

## 3. Chat and Sidebar Surfaces
- [x] 3.1 Migrate sub-chat selector/sidebar labels, placeholders, toasts, archive popover, mobile header, and chat rename dialog.
- [x] 3.2 Migrate active chat shell toasts and app-authored action labels without changing user or AI message bodies.
- [x] 3.3 Migrate agent diff view, image viewer controls, MCP server indicator, usage labels, slash-command loading/empty states, and help popover.

## 4. Shared Utility Surfaces
- [x] 4.1 Migrate Mermaid viewer controls, Open In menu labels, MCP approval dialog, Kanban workspace toasts/context actions, and remaining commit/push action toast shells.
- [x] 4.2 Leave platform chrome, icon titles, raw diagnostics, and base UI primitive helper labels out of scope unless product-visible.

## 5. Validation
- [x] 5.1 Run `openspec validate complete-ui-localization-coverage --strict --no-interactive`.
- [x] 5.2 Run `openspec validate ui-localization --strict --no-interactive`.
- [x] 5.3 Run the hardcoded English sweep and update the intentional exclusion note.
  Remaining scan hits are intentional: editor/platform names (`VS Code`, `JetBrains`, `Windows`), provider/model/protocol names (`OpenAI Codex`, `Claude Code`, `HTTP (SSE)`, `Sonnet`, `Opus`, `Haiku`), credential/API labels (`Base URL`, `Codex API Key`, `OpenAI API Key`, `Bearer Token`), product/debug names (`React Scan`, app logo), framework icon titles, window chrome labels, and code comments/examples.
- [x] 5.4 Run `bun run ts:check`.
- [x] 5.5 Smoke-check English and Simplified Chinese language switching in the Electron UI where practical.
  Static language-switch coverage was verified by dictionary parity plus build/type checks; interactive Electron UI switching was not launched to avoid disrupting the active desktop session.
- [x] 5.6 Run `bun run build`.
