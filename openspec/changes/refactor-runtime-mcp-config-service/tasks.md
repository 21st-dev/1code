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

- [x] 2.1 Add behavior tests proving existing Claude MCP add/remove/list/status and
  project/global scope behavior are preserved.
- [x] 2.2 Add behavior tests proving existing Codex MCP add/remove/list/status/auth
  behavior and current limitations are preserved.
- [x] 2.3 Add runtime materialization tests proving Claude and Codex runs receive the
  same MCP server inputs before and after extraction.
- [x] 2.4 Add architecture guard or focused tests proving routes delegate to the
  Runtime MCP Config service and do not keep a second MCP config write/status path.

## 3. Validation

- [x] 3.1 `bun run ts:check`.
- [x] 3.2 `bun run lint`.
- [x] 3.3 Architecture guard.
- [x] 3.4 Targeted MCP route/service tests.
- [ ] 3.5 Existing Settings > MCP manual add/remove/refresh/auth smoke.
  - 2026-06-19 partial isolated desktop smoke: `bun run build`, then
    `HOME=/private/tmp/locus-mcp-service-home CODEX_HOME=/private/tmp/locus-mcp-service-home/.codex LOCUS_USER_DATA_DIR=/private/tmp/locus-mcp-service-smoke2 node_modules/.bin/electron --remote-debugging-port=9334 .`.
    Settings > MCP opened after non-sensitive onboarding localStorage setup.
    Claude Code global stdio add/remove/refresh passed with
    `smoke_claude_stdio` in the temporary HOME; delete confirmation appeared.
    Codex global stdio add/remove/refresh passed with `smoke_codex_stdio` in
    the temporary CODEX_HOME; delete confirmation appeared. Auth/login/logout
    was not executed because no disposable auth-capable MCP server was available,
    and real user Claude/Codex credentials were intentionally not used.
  - 2026-06-20 isolated real-account OAuth smoke: `HOME=/private/tmp/locus-mcp-auth-home`,
    `CODEX_HOME=/private/tmp/locus-mcp-auth-home/.codex`,
    `LOCUS_USER_DATA_DIR=/private/tmp/locus-mcp-auth-smoke`, built with
    `bun run build`, and launched Electron with `--remote-debugging-port=9336`.
    The first Claude global auth attempt exposed that Settings passed the global
    sentinel to a service method that forced project-scope validation; this was
    fixed so global OAuth uses `__global__` while real project paths still
    require registered-project validation. With server
    `smoke_cloudflare_oauth_claude` at `https://mcp.cloudflare.com/mcp`,
    Settings > MCP add passed, Cloudflare OAuth completed through the real
    Chrome flow using the read-only template, the callback reached Locus, tokens
    were written to the temporary `.claude.json`, and Settings refreshed to
    connected with 3 tools. Redacted checks confirmed `_oauth` fields exist
    without printing token values.
  - 2026-06-20 Codex auth smoke used `smoke_cloudflare_oauth_codex` at the same
    URL. Settings > MCP add wrote the temporary `.codex/config.toml`; direct
    `codex mcp login smoke_cloudflare_oauth_codex` in the same isolated
    `HOME`/`CODEX_HOME` completed the real Cloudflare OAuth flow and
    `codex mcp list --json` changed to `auth_status: "o_auth"`. Settings
    refresh showed the Codex server as connected. UI logout then called the
    Codex logout path but failed with
    `failed to delete OAuth credentials: failed to delete OAuth tokens from keyring`;
    the same error reproduced with direct bundled Codex CLI logout in the same
    isolated environment, so this remains a Codex CLI/keyring cleanup failure
    rather than a second Locus write/status path. Renderer/userData scanning
    checked 22 actual token values from the isolated Claude/Codex credential
    files and found 0 matches in `/private/tmp/locus-mcp-auth-smoke`.
  - Closeout status: the service extraction, route delegation, runtime
    materialization, and Claude/Codex add/login/refresh paths are complete and
    verified. This change may be proposed for closeout with a known external
    blocker, but it is not 100% complete and this task must remain unchecked
    until Codex logout can be verified. The follow-up product fix is tracked
    separately and only improves the Codex logout failure UX; it must not mutate
    Codex credential state or delete keyring entries outside the Codex CLI.
- [x] 3.6 `openspec validate refactor-runtime-mcp-config-service --strict --no-interactive`.
