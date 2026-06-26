# Change: Harden P1 trust boundaries

## Why
Renderer-reachable tRPC routes currently expose file and command reads that rely on caller-supplied paths. With no per-call tRPC principal, these routes need their own path containment checks.
MCP OAuth currently stores access and refresh tokens in shared Claude CLI config, so the same trust-boundary change also moves those secrets behind app-owned safeStorage.

## What Changes
- Require file read routes to resolve targets inside a registered project or chat worktree root.
- Restrict command file read, update, and delete routes to Claude user or project command directories.
- Store MCP OAuth access and refresh tokens in app-owned safeStorage, leaving only non-sensitive auth metadata in Claude config.

## Impact
- Affected specs: runtime-security-baseline
- Affected code: `src/main/lib/trpc/routers/files.ts`, `src/main/lib/trpc/routers/commands.ts`, `src/main/lib/mcp-auth.ts`, `src/main/lib/mcp-oauth-token-store.ts`, renderer file-read callers, command callers, tests
