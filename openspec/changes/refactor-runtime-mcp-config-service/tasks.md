## 1. Service Extraction

- [x] 1.1 Add Runtime MCP Config service and per-runtime adapter contracts.
- [x] 1.2 Move existing Claude MCP list/status/add/remove/refresh/auth/session
  materialization behavior into the Claude adapter.
- [x] 1.3 Move existing Codex MCP list/status/add/remove/refresh/auth/session
  materialization behavior into the Codex adapter, preserving current Codex scope
  and field limitations.
- [x] 1.4 Replace or delegate current `claude.ts` and `codex.ts` MCP helper/call
  sites so routes validate inputs and call the service instead of owning MCP
  business behavior.
- [x] 1.5 Remove old route-local helpers that duplicate service-owned MCP
  write/status behavior in the same commit.
- [x] 1.6 Update `docs/OWNERSHIP_MAP.md`: Runtime MCP Configuration owner becomes
  the Runtime MCP Config service; Claude/Codex routes are thin callers; runtime
  specifics live in adapters.

## 2. Regression Coverage

- [ ] 2.1 Add behavior tests proving existing Claude MCP add/remove/list/status and
  project/global scope behavior are preserved.
- [ ] 2.2 Add behavior tests proving existing Codex MCP add/remove/list/status/auth
  behavior and current limitations are preserved.
- [ ] 2.3 Add runtime materialization tests proving Claude and Codex runs receive the
  same MCP server inputs before and after extraction.
- [x] 2.4 Add architecture guard or focused tests proving routes delegate to the
  Runtime MCP Config service and do not keep a second MCP config write/status path.

## 3. Validation

- [x] 3.1 `bun run ts:check`.
- [x] 3.2 `bun run lint`.
- [x] 3.3 Architecture guard.
- [x] 3.4 Targeted MCP route/service tests.
- [ ] 3.5 Existing Settings > MCP manual add/remove/refresh/auth smoke.
- [x] 3.6 `openspec validate refactor-runtime-mcp-config-service --strict --no-interactive`.
