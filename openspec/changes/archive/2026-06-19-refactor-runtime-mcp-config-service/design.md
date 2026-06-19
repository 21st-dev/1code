## Context

The ownership map currently lists Runtime MCP Configuration as route-owned until
an approved service extraction lands. The current files are:

- `src/main/lib/trpc/routers/claude.ts`
- `src/main/lib/trpc/routers/codex.ts`

That route ownership should be retired before building MCP registry install.
Registry install needs shared preview, install state, provenance, setup, and
verification semantics. Those rules should not be duplicated into each runtime
router.

## Goals / Non-Goals

**Goals:**

- Extract a Runtime MCP Config service as the canonical owner for shared MCP
  config/status behavior.
- Keep Claude and Codex-specific behavior in adapters.
- Preserve existing manual MCP behavior exactly.
- Remove route-local duplicate business paths in the same change.
- Add tests or architecture guards that make the new owner boundary reviewable.

**Non-Goals:**

- No MCP registry provider, browse UI, install flow, setup flow, provenance model,
  or verified status.
- No broad rewrite of Claude or Codex chat runtimes.
- No attempt to close future registry-specific Codex parity gaps beyond preserving
  today's behavior.

## Decisions

### Service Boundary

The Runtime MCP Config service owns shared MCP configuration behavior:

- listing and status aggregation
- add/remove/refresh orchestration
- renderer-safe redaction delegation
- auth bridge routing
- session materialization entrypoint shared by runtime startup

Runtime adapters own runtime-specific details:

- Claude config file read/write and project/global scope behavior
- Codex config read/write and current CLI-backed behavior where applicable
- runtime-specific auth/login/logout bridge behavior
- runtime-specific session MCP materialization

### Behavior Preservation

This is a refactor. Existing MCP tab behavior should remain unchanged:

- existing Claude global/project behavior remains as-is
- existing Codex scope limitations remain as-is
- existing import-preview behavior remains preview-only
- existing runtime session materialization continues to produce the same MCP server
  set for Claude and Codex runs

If extraction reveals a bug or mismatch, record it and fix it in a separate
behavior change unless it blocks preserving current behavior.

### Review Shape

This change should be reviewable independently:

- one service owner
- thin route wrappers
- old helper/call sites removed or delegated
- no registry code in the diff
- targeted tests or architecture guards proving no duplicate MCP config write/status
  path remains

## Migration Plan

1. Add the Runtime MCP Config service and adapter contracts.
2. Move existing Claude MCP behavior into the Claude adapter.
3. Move existing Codex MCP behavior into the Codex adapter.
4. Replace or delegate current route helper/call sites.
5. Update `docs/OWNERSHIP_MAP.md`.
6. Add focused behavior regression tests and architecture guard coverage.
7. Verify existing MCP Settings flows and runtime MCP materialization still work.

## Open Questions

- None for product scope. Exact file names under `src/main/lib/runtime-mcp-config/`
  are implementation details, but the owner must be named in `docs/OWNERSHIP_MAP.md`.
