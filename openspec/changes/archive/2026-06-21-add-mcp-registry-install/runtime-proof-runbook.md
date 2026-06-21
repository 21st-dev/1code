# MCP Registry Runtime Proof Runbook

Provider call authorization: required

Use this runbook to complete the remaining real-runtime proof tasks for
`add-mcp-registry-install`. The proof must run through Locus registry
browse/preview/install and a real runtime session. Do not paste raw OAuth tokens,
authorization headers, cookies, API keys, or unredacted config files into this
change.

## Isolated Launch

Use throwaway runtime state even when using a real login. Keep `HOME` pointed at
the real user account so macOS can access the login keychain; isolate Claude MCP
configuration with `LOCUS_CLAUDE_CONFIG_HOME` instead of overriding `HOME`.

```bash
rm -rf /private/tmp/locus-mcp-registry-home /private/tmp/locus-mcp-registry-smoke
mkdir -p /private/tmp/locus-mcp-registry-home/.codex

CODEX_HOME=/private/tmp/locus-mcp-registry-home/.codex \
LOCUS_CLAUDE_CONFIG_HOME=/private/tmp/locus-mcp-registry-home \
LOCUS_USER_DATA_DIR=/private/tmp/locus-mcp-registry-smoke \
NODE_OPTIONS=--dns-result-order=ipv4first \
bun run dev
```

Use only low-risk accounts and low-risk MCP scopes. If the app cannot open in a
GUI-capable session, keep all scenarios in `runtime-proof-evidence.md` blocked.

## Claude Proof

1. Open Settings > MCP > Registry.
2. Choose an official-registry entry with a harmless read/list/get-style tool.
3. Capture the redacted install preview before confirmation:
   - registry entry ID and provider ID
   - entry fingerprint
   - config fingerprint
   - setup status and missing setup keys, if any
   - no secret values
4. Confirm install to Claude only.
5. Run explicit Check. This may connect and list tools, but it must not call MCP
   tools or mark the server Verified by itself.
6. Start a real Claude run with a user prompt that intentionally calls one
   harmless MCP tool.
7. Record redacted evidence:
   - isolated Claude config home, `CODEX_HOME`, and app `userData` paths
   - Claude `session-init` MCP server status
   - tool inventory containing `mcp__<server>__<tool>`
   - prompt text that triggered the tool
   - matching tool output event
   - local verification record before and after the run

Only after these records prove discovery, tool listing, and successful tool-call
output may the Claude scenarios move to `passed` and tasks 1.1, 1.3, 4.3, and
5.6 be checked as applicable.

## Codex Proof

Codex registry install/check is intentionally deferred for this change unless
both field-materialization and app-server tool-call observability are proven.

If a later local session attempts Codex proof, record:

- isolated `HOME`, `CODEX_HOME`, and app `userData` paths
- registry entry/config fingerprints
- full-field config materialization support for the selected entry
- app-server `mcpServerStatus/list` evidence with server and tool names
- user prompt that intentionally calls one harmless MCP tool
- app-server event or mapped runtime chunk proving the MCP tool call succeeded
- local verification record before and after the run

Do not offer or record `Verified on Codex` if any of those signals are missing.
If the attempted Codex proof shows readiness/tool-list evidence but still lacks
post-execution tool-output proof or registry fingerprint binding, record the
Codex scenarios as `deferred`, not `passed`.

## Secret Scan

Before closeout, scan renderer/app logs and the isolated app userData directory
for token values from temporary runtime credential files. Record only counts and
redacted paths, not the token strings.

## Closeout

After passed evidence is recorded:

1. Update `runtime-proof-evidence.md` scenario statuses.
2. Check only the tasks whose evidence is proven or whose conditional Codex
   outcome is explicitly recorded as `deferred`.
3. Run:

```bash
bun run mcp-registry:proof:evidence
bun test tests/proof-evidence-gates.test.ts
bunx openspec validate add-mcp-registry-install --strict --no-interactive
```
