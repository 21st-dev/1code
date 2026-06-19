## Why

`add-runtime-native-plugin-execution` proved Codex app-server loads plugin skills
from `CODEX_HOME`, but did not yet bind that load path to a Locus-controllable
runtime boundary. Without that boundary, review, safe mode, MCP approval, and
identity gates cannot reliably prevent globally enabled plugins from reaching a
managed run.

## What Changes

- Use an isolated per-run `CODEX_HOME` as the Codex app-server plugin control
  primitive, with only Locus-approved plugin cache entries staged into it before
  app-server startup.
- Wire Locus-managed Codex runs so only reviewed, enabled, identity-approved, and
  MCP-approved-or-filtered plugin components reach the managed thread.
- Keep fail-closed behavior for disabled, unreviewed, drifted, safe-mode-blocked,
  staging-failed, and unapproved-MCP plugins.
- Record app-server proof showing seeded allowed plugin components are visible in
  the isolated home and sampled global plugins do not leak into the run.

## Impact

- Affected specs: `runtime-plugins`
- Affected code: `src/main/lib/codex/*`,
  `src/main/lib/plugins/runtime-native-activation.ts`, plugin proof scripts/tests,
  Settings > Plugins Codex status UI
