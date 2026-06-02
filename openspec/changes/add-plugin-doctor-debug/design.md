## Context
The previous plugin slices established three important constraints:

- Plugin packages are manifest-only by default.
- Local update review fingerprints are advisory until a runtime gate consumes them.
- Safe mode and review gates are enforced for plugin MCP enablement/approval/runtime inclusion.

The remaining Phase 3 gap is visibility and consistency. Users need a Doctor/Debug surface that explains the exact local state, and all plugin-provided runtime components need the same fail-closed answer before Phase 4-6 work adds more capability.

## Goals
- Provide a structured Doctor report generated in the Electron main process.
- Show per-plugin Debug details in Settings > Plugins.
- Gate plugin commands, skills, and agents on the same reviewed-fingerprint and safe-mode state used by MCP.
- Keep all plugin Doctor/Debug output redacted and local-only.

## Non-Goals
- No plugin marketplace install/update.
- No controlled UI plugin execution.
- No developer trusted-code execution.
- No app.asar patching, re-signing, Codex Desktop DOM modification, or Codex++ compatibility layer.
- No secret-bearing MCP values in renderer output or logs.

## Decisions
- Doctor checks are generated from already-bounded metadata: plugin catalog entries, component counts, source status, update review metadata, safe mode, safety gate, and redacted MCP approval identifiers.
- Doctor does not recursively hash arbitrary plugin source files. The existing manifest review document remains the bounded fingerprint input.
- Safe mode is not a sandbox claim. UI wording must say it blocks Locus-managed plugin capabilities, not that plugin code is safe.
- Plugin commands, skills, and agents are runtime capabilities. They should only be discovered by Locus when the Claude plugin source is enabled, safe mode is off, and the current fingerprint is reviewed.
- Codex plugin cache entries remain read-only metadata regardless of Doctor status.

## Risks
- A broad Doctor surface can imply more safety than exists. Mitigation: use "reviewed", "blocked", "read-only", and "local metadata" wording, never "trusted" or "verified".
- Existing user/plugin data may contain enabled plugins that were enabled before the gate existed. Mitigation: discovery filters fail closed even if the enabled list contains the source.
- Renderer state can be stale or compromised. Mitigation: all allow/block decisions remain in main process helpers and routers.
