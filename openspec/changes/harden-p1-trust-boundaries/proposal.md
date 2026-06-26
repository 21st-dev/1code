# Change: Harden P1 trust boundaries

## Why
Renderer-reachable tRPC routes currently expose file and command reads that rely on caller-supplied paths. With no per-call tRPC principal, these routes need their own path containment checks.

## What Changes
- Require file read routes to resolve targets inside a registered project or chat worktree root.
- Restrict command file read, update, and delete routes to Claude user or project command directories.

## Impact
- Affected specs: runtime-security-baseline
- Affected code: `src/main/lib/trpc/routers/files.ts`, `src/main/lib/trpc/routers/commands.ts`, renderer file-read callers, command callers, tests
