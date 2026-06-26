# Change: Update tRPC capability boundary

## Why
Locus is a local Electron app whose renderer receives and displays untrusted repository files, chat/markdown content, tool output, and local browser previews. Today the renderer also gets the whole tRPC bridge via `exposeElectronTRPC()`, while tRPC context has only `{ getWindow }` and every mounted router is public. Any renderer code that is driven by untrusted content can therefore ask the main process to perform filesystem, shell, network, credential, git, and runtime operations.

This is not a remote API authentication problem. A renderer-held login token would be controlled by the same compromised renderer. The boundary must instead constrain what renderer-reachable code can make the main process do.

## What Changes
- Define a renderer-reachable privileged-operation inventory for the 41 router files under `src/main/lib/trpc/routers/` plus the mounted `changes` git router.
- Extend the runtime security baseline with requirements for registered-entity path resolution, dangerous-operation capability decisions, and untrusted renderer-content isolation.
- Recommend a phased implementation:
  - Phase 1: input trust convergence for dangerous paths, commands, runtime cwd, project-scoped config, and file writes.
  - Phase 2: renderer hardening for untrusted markdown, HTML, and webview/iframe previews.
  - Phase 3: capability metadata, consent middleware, audit, and kill-switches for dangerous operations.

## Impact
- Affected specs: `runtime-security-baseline`
- Future affected code: `src/main/lib/trpc/index.ts`, `src/main/lib/trpc/routers/**`, `src/main/lib/git/**`, `src/main/lib/fs/path-boundary.ts`, `src/main/lib/git/worktree-setup-trust.ts`, `src/preload/index.ts`, `src/renderer/index.html`, markdown/webview renderers, and tests.
- Compatibility: Phase 1 should keep preload bridging and most route names stable, but selected inputs should move from renderer-supplied raw paths/cwd to server-resolved identifiers such as `chatId`, `projectId`, `subChatId`, or registered roots. Compatibility shims may exist only when they resolve through the new server-side boundary and have tests.
- Non-goals: user login authentication for local tRPC, a broad remote API auth model, policy-grant scope enforcement, and P0/P1 already completed fixes.
