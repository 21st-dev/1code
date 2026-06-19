## 1. State And API

- [x] 1.1 Add scoped runtime-native plugin selection records to plugin review state.
- [x] 1.2 Add helpers to read, write, normalize, and resolve effective scoped
  selections with `subChatId > chatId > projectId > global` precedence.
- [x] 1.3 Add Plugins router procedures for reading and updating scoped selections.

## 2. Runtime Integration

- [x] 2.1 Pass project/chat/sub-chat scope context into Codex app-server plugin
  allowlist resolution.
- [x] 2.2 Apply effective scoped selections before Codex isolated home staging.
- [x] 2.3 Apply effective scoped selections before Claude native plugin staging.
- [x] 2.4 Keep unselected, disabled, unreviewed, drifted, safe-mode-blocked, and
  unapproved-MCP plugins absent from generated runtime config.

## 3. UI

- [x] 3.1 Show global vs scoped plugin activation state in Settings > Plugins.
- [x] 3.2 Allow switching a project/chat/sub-chat scope between inherited and custom
  selection.
- [x] 3.3 Keep install, review, and MCP approval messaging global and honest.

## 4. Validation

- [x] 4.1 Add unit tests for scoped selection normalization and precedence.
- [x] 4.2 Add Codex allowlist/staging tests for unselected plugins.
- [x] 4.3 Add Claude staging tests for scoped selected plugins.
- [x] 4.4 `bun run ts:check` passes.
- [x] 4.5 `openspec validate add-scoped-plugin-activation --strict --no-interactive`
  passes.
