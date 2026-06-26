## 0. Proposal Gate
- [x] 0.1 Inspect tRPC context, preload bridge, mounted routers, and current runtime-security-baseline spec.
- [x] 0.2 Inventory dangerous renderer-reachable procedures across all router files and the mounted git `changes` router.
- [x] 0.3 Write proposal, design, tasks, and runtime-security-baseline delta.
- [x] 0.4 Receive emergency approval for the Phase 2 renderer XSS slice; broader Phase 1/2/3 rollout remains pending.

## 1. Phase 1 - Input Trust Convergence
- [ ] 1.1 Add or extend shared main-process resolvers for registered project roots, chat worktree roots, command roots, agent roots, skill roots, terminal workspace cwd, and dialog-selected path tokens.
- [x] 1.2 Update `files` routes so search, watch, rename, and delete use registered roots or dialog-issued tokens; keep existing read hardening intact.
- [ ] 1.3 Update `commands`, `agents`, and `skills` project-scoped routes so renderer input uses registered project/chat identity instead of raw `projectPath` or `cwd`.
- [ ] 1.4 Update runtime start routes (`claude.chat`, `codex.chat`, `agentRuntime.chat`) so cwd/projectPath are derived from `chatId`/`subChatId` server-side and forged renderer cwd is rejected.
- [ ] 1.5 Update terminal routes so `createOrAttach` and `listDirectory` resolve cwd from registered workspace/chat state or a dialog token before spawning/reading.
- [x] 1.5a Emergency command sink subset: update `terminal.createOrAttach` so renderer input no longer carries raw `cwd` or `initialCommands`; the main process resolves cwd from the registered chat/workspace and maps only whitelisted `initialCommandIntents` to app-owned commands.
- [ ] 1.6 Update MCP and provider route inputs so project-scoped config writes resolve project roots server-side and command/url/env inputs receive explicit validation.
- [x] 1.7 Replace shell-string git clone in `projects.cloneFromGitHub` with argv-based execution and constrained GitHub repo identity.
- [ ] 1.8 Add adversarial tests for absolute paths, traversal, symlink escapes, forged cwd/projectPath, raw command/config writes, and unregistered roots.
- [x] 1.8a Emergency command sink subset tests: cover forged terminal cwd/scope, legacy raw `initialCommands` payloads, arbitrary command strings masquerading as intents, whitelisted `gh auth login`, GitHub clone shell metacharacters, Git clone option injection, and argv clone execution.
- [x] 1.8b Files sink subset tests: cover unregistered search/watch roots, rename/delete targets outside registered roots, and rename replacement names containing traversal or path separators.
- [ ] 1.9 Add an architecture guard for new dangerous router input fields without an approved resolver.

## 2. Phase 2 - Renderer Hardening
- [x] 2.1 Audit renderer CSP requirements and remove broad `unsafe-eval`/remote script allowances where feasible.
- [ ] 2.2 Sanitize or sandbox markdown, highlighted HTML, Mermaid SVG, MCP/tool output, and chat export previews before rendering.
- [ ] 2.3 Harden local browser/webview navigation, permissions, partitions, and JavaScript execution surfaces.
- [ ] 2.4 Add desktop smoke coverage for markdown, diagrams, syntax highlighting, local browser preview, and tRPC bridge startup.
- [x] 2.5 Emergency R0a renderer XSS slice: prove subtitle and Mermaid exploitability, switch Mermaid to strict mode, sanitize Mermaid SVG with DOMPurify, render `AgentToolCall` subtitles as text, guard remaining Shiki-backed HTML sinks, and add CSP/adversarial tests.

## 3. Phase 3 - Capability Middleware, Consent, and Audit
- [ ] 3.1 Define a typed capability taxonomy for filesystem, shell, runtime, MCP, plugin, credential, network, external-open, git-write, and debug-destroy procedures.
- [ ] 3.2 Introduce tRPC procedure wrappers or metadata that require every dangerous procedure to declare its capability class.
- [ ] 3.3 Implement explicit consent gates for shell execution, arbitrary file writes/deletes, external app/URL opens, plugin/native activation, MCP command writes, and destructive debug/admin actions.
- [ ] 3.4 Add an audit log and runtime kill-switch for dangerous capability classes.
- [ ] 3.5 Add tests and architecture guards proving dangerous procedures cannot be added as bare `publicProcedure`.

## 4. Closeout
- [x] 4.1 Run `bun run check`.
- [x] 4.2 Run `openspec validate update-trpc-capability-boundary --strict --no-interactive`.
- [x] 4.3 Update `PROJECT-MAP.md` with implemented commit references after each phase.
