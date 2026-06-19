## Why

`add-runtime-native-plugin-execution` proved Codex app-server loads globally
installed/enabled plugin skills, but did not expose a Locus-controllable per-run
plugin filter. That blocks safe Codex runtime-native plugin execution because
review, safe mode, MCP approval, and identity gates cannot reliably prevent a
globally enabled plugin from reaching a managed run.

## What Changes

- Add or consume a Codex app-server per-run plugin control primitive such as an
  allowlist, denylist, isolated plugin home, or equivalent thread/run-scoped
  lifecycle API.
- Wire Locus-managed Codex runs so only reviewed, enabled, identity-approved, and
  MCP-approved-or-filtered plugin components reach the managed thread.
- Keep Codex native plugin execution blocked until positive and negative app-server
  proof shows the per-run control actually filters commands, skills, agents, hooks,
  and plugin MCP declarations.
- Preserve the existing fail-closed Codex plugin config override behavior until the
  new primitive is proven.

## Impact

- Affected specs: `runtime-plugins`
- Affected code: `src/main/lib/codex/*`,
  `src/main/lib/plugins/runtime-native-activation.ts`, plugin proof scripts/tests,
  Settings > Plugins Codex status UI
