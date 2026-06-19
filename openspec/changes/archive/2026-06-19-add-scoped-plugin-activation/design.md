## Context

Locus now has runtime-native plugin loading for Claude and Codex through isolated
runtime configuration. Current enablement is stored globally in
`plugin-review-state.json`, so a plugin enabled for one run becomes eligible for all
managed runs until disabled.

## Goals

- Let a project, chat, or sub-chat declare an explicit runtime-native plugin
  selection.
- Preserve global enablement as the default inherited behavior.
- Keep review, safe mode, drift, MCP approval, and staging fail-closed gates as the
  final authority.
- Ensure disabled/unselected plugins are absent from the next generated runtime
  configuration.

## Non-Goals

- Do not add a new plugin install mechanism.
- Do not bypass manifest review or MCP approval.
- Do not execute plugin code in the Locus process.

## Decisions

- Store scoped selections in the existing plugin review state file because the state
  is part of local plugin governance, not chat message content.
- Use `mode: "inherit" | "custom"` per scope. `inherit` falls back to the next less
  specific scope; `custom` means only listed plugin review keys are eligible before
  normal gates run.
- Precedence is `subChatId > chatId > projectId > global`.
- Store review keys, not plugin source strings, because review keys are already the
  durable plugin governance identifier in this code path.

## Risks

- A deleted project/chat could leave orphaned scope records. This is acceptable for
  local state v1; records are inert unless the same id is used again.
- Settings > Plugins is mostly global. The first UI should make scope explicit and
  avoid implying install/review is scoped.
