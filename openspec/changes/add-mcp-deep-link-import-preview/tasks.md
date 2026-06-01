## 1. OpenSpec
- [x] 1.1 Add MCP deep-link import preview proposal, design, tasks, and spec
      deltas.
- [x] 1.2 Validate `add-mcp-deep-link-import-preview` strictly.

## 2. Parser and Preview Model
- [x] 2.1 Add a shared renderer-safe MCP import preview type.
- [x] 2.2 Parse supported MCP import links into pending preview objects.
- [x] 2.3 Redact env/header values and expose only keys plus value-presence
      metadata.
- [x] 2.4 Default preview activation to disabled/pending and report any
      requested auto-enable state.
- [x] 2.5 Sanitize deep-link logging so raw URLs and secret query values are not
      logged.

## 3. UI
- [x] 3.1 Add a preview surface for parsed MCP imports.
- [x] 3.2 Show command/URL, args, env/header keys, redacted value presence,
      target runtime, scope, requested enabled state, and would-write paths.
- [x] 3.3 Keep apply/import/enable actions disabled or absent in this slice.

## 4. Verification
- [x] 4.1 Add parser tests for command, args, env, headers, runtime, scope, and
      enabled-state previews.
- [x] 4.2 Add negative tests proving env/header/OAuth/token values and raw deep
      links are not returned or logged.
- [x] 4.3 Run `openspec validate add-mcp-deep-link-import-preview --strict --no-interactive`.
- [x] 4.4 Run targeted MCP/deep-link tests and runtime safety regressions.
- [x] 4.5 Run `bun run ts:check`, `bun run build`, full `bun test tests`, and
      `git diff --check`.
- [x] 4.6 Capture local desktop smoke evidence for the preview UI.
