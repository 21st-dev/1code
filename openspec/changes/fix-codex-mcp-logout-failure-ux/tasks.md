## 1. Implementation

- [x] 1.1 Add a focused Settings MCP UX spec for Codex logout failures.
- [x] 1.2 Update Settings > MCP so failed Codex logout does not refresh into a
  logged-out state and leaves retry available.
- [x] 1.3 Show an explicit failure panel/toast with manual cleanup guidance and
  the Codex CLI/keyring error source.
- [x] 1.4 Add focused regression coverage for the failure UX contract.
- [x] 1.5 Run targeted tests and `openspec validate fix-codex-mcp-logout-failure-ux --strict --no-interactive`.
