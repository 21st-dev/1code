# Change: Make Codex MCP logout failures honest

## Why
Real isolated OAuth smoke showed that `codex mcp logout` can fail while deleting
OAuth credentials from the keyring, even after Codex MCP add/login/refresh works.
Settings must not imply that logout succeeded when the bundled Codex CLI reports
that credential deletion failed.

## What Changes
- Keep the Codex MCP server's connected/authenticated state unchanged when logout
  fails.
- Show an explicit failure message that OAuth credentials may still exist and
  that the error came from Codex CLI/keyring credential deletion.
- Keep the logout retry available and expose manual cleanup guidance.
- Do not delete or mutate Codex credentials outside the Codex CLI.

## Impact
- Affected specs: runtime-mcp-settings-ux
- Affected code: Settings > MCP renderer UX around Codex MCP logout failures
