# Change: Add scoped plugin activation

## Why

Runtime-native plugin activation is now safe per run, but the selection state is
still global. Users need project and session scoped plugin visibility so a managed
run can expose only the reviewed plugins selected for that workspace or thread.

## What Changes

- Add project, chat, and sub-chat scoped runtime-native plugin selection state.
- Resolve effective plugin visibility from the most specific scope, then apply the
  existing review, safe mode, activation identity, MCP, and staging gates.
- Expose scoped selection APIs and UI affordances without changing install or review
  ownership.
- Keep default behavior compatible by inheriting global enablement when no scoped
  selection exists.

## Impact

- Affected specs: `runtime-plugins`
- Affected code: plugin review state, Plugins router/API, Codex app-server plugin
  allowlist, Claude native plugin staging, Settings > Plugins UI
