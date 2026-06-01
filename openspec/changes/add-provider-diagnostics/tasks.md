## 1. OpenSpec
- [x] 1.1 Add provider diagnostics proposal, design, tasks, and spec deltas.
- [x] 1.2 Validate `add-provider-diagnostics` with strict OpenSpec checks.

## 2. Diagnostic Model and Main Process
- [x] 2.1 Add shared provider diagnostic status types and categories.
- [x] 2.2 Replace generic profile test status with structured diagnostic checks
      while preserving backward-compatible rendering of existing status rows.
- [x] 2.3 Add token-aware redaction for active provider tokens, gateway tokens,
      custom header values, OAuth tokens, and derived authorization headers.
- [x] 2.4 Add lightweight endpoint, auth, model, protocol, streaming, tool,
      vision, gateway, and runtime preflight checks where supported.
- [x] 2.5 Persist only renderer-safe diagnostic summaries.

## 3. Renderer
- [x] 3.1 Show diagnostic categories and check details in Settings > Models.
- [x] 3.2 Keep plaintext secret values out of rendered status, toast messages,
      and editable profile metadata.

## 4. Verification
- [x] 4.1 Add unit tests for diagnostic classification and redaction.
- [x] 4.2 Add regression tests proving diagnostics/list/status payloads do not
      expose plaintext provider tokens or custom header values.
- [x] 4.3 Run `openspec validate add-provider-diagnostics --strict --no-interactive`.
- [x] 4.4 Run targeted Bun tests for provider profiles and credential storage.
- [x] 4.5 Run `bun run ts:check`, `bun run build`, and `git diff --check`.
- [x] 4.6 Capture local desktop smoke evidence for the diagnostics UI.
