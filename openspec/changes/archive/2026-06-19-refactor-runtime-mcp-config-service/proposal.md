## Why

Claude and Codex MCP configuration behavior currently lives inside the large
runtime tRPC routers. That is acceptable as the temporary owner, but registry
install would add shared business rules for preview, status, verification, and
future runtimes. Mixing that new product capability with a route extraction makes
review too noisy: reviewers cannot tell whether a regression came from the
behavior-preserving extraction or from the new registry feature.

This change extracts the Runtime MCP Config service first, without adding registry
install or changing the MCP user experience.

## What Changes

Add a Runtime MCP Config service with Claude and Codex adapters, then move or
delegate existing MCP listing, add, remove, refresh, auth, and session
materialization behavior through that service.

Constraints:

- **Behavior-preserving refactor only.** Existing Settings > MCP manual add,
  remove, refresh, OAuth/login/logout, status/listing, and runtime session
  materialization continue to behave as they do today.
- **No registry feature.** No public registry client, no registry browse UI, no
  registry install state, no verification badges, and no new MCP store behavior.
- **No duplicate business paths.** Existing Claude/Codex route helpers and call
  sites are removed or replaced in the same change. Routes remain thin
  validation/status envelopes.
- **Current runtime limits remain honest.** Codex scope, env/header, auth, and
  app-server materialization behavior are preserved as current behavior, not
  silently expanded for future registry needs.

## Capabilities

### Modified Capabilities

- `architecture-ownership`: Runtime MCP configuration gains a canonical Runtime
  MCP Config service owner with per-runtime adapters.

## Impact

- **Main:** add `src/main/lib/runtime-mcp-config/` service and adapter files; route
  existing Claude/Codex MCP behavior through the service.
- **Routes:** `claude.ts` and `codex.ts` keep tRPC input validation and response
  envelopes, but no longer own durable MCP config/status business logic.
- **Ownership:** update `docs/OWNERSHIP_MAP.md` to name the service owner and
  runtime adapters.
- **Tests/guards:** add focused regression tests and/or architecture guards proving
  existing MCP behavior still flows through one owner.
