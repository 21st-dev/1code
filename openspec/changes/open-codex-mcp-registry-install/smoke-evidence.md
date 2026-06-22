# Smoke Evidence

Date: 2026-06-22

Change: `open-codex-mcp-registry-install`

## Scope

Command-level runtime smoke through the registry service and Runtime MCP Config
owner. This did not start the renderer; it exercised the same main-process
install and Codex connect/list check paths used by Settings > MCP.

## Isolation

- `HOME=/var/folders/_g/cmqkvs694c7g4rmksh2jd5hr0000gn/T/locus-open-codex-registry-smoke-prBWl7/home`
- `CODEX_HOME=/var/folders/_g/cmqkvs694c7g4rmksh2jd5hr0000gn/T/locus-open-codex-registry-smoke-prBWl7/codex-home`
- `LOCUS_USER_DATA_DIR=/var/folders/_g/cmqkvs694c7g4rmksh2jd5hr0000gn/T/locus-open-codex-registry-smoke-prBWl7/user-data`

## Target

- Registry entry: `io.github.cyanheads/calculator-mcp-server`
- Target: `remote:streamable_http:0`
- Runtime: `codex`
- Installed server name: `calculator_mcp_server_smoke`

## Result

- Install returned `installed-unverified`.
- Connect/list check made a real outbound request to the configured calculator
  MCP server URL and returned `connected-unverified`.
- Tool inventory contained `calculate`.
- Verification records with `verified-local`: `0`.
- Check reason: `codex-tools-visible-auto-verify-unavailable`.
- The smoke target did not require auth. Authenticated remote checks depend on
  materialized headers/env-header references being available to the runtime; if
  auth materialization is missing, the expected result is `failed-check`, not
  `Verified on Codex`.

## Secret Scan

Scanned the isolated smoke root for common plaintext credential patterns:

- `sk-...`
- `api_key` / `api-key`
- `auth_token`
- `access_token`
- `refresh_token`
- `authorization`
- `bearer`
- `secret`

Only these files were present:

- `codex-home/config.toml`
- `user-data/mcp-registry-verification-state.json`

No common plaintext secret patterns were found.
