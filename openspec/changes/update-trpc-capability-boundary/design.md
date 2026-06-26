# Design: tRPC capability and trust boundary

## Context
Current evidence:
- tRPC context is only `{ getWindow }` and exposes `publicProcedure` plus a logging middleware hook in `src/main/lib/trpc/index.ts:8`.
- `src/preload/index.ts:6` calls `exposeElectronTRPC()`, exposing the whole app router to the renderer.
- `src/main/lib/trpc/routers/index.ts:42` mounts 32 routers; the folder contains 41 router files. The mounted `changes` router is composed from `src/main/lib/git/**`.
- `src/main/windows/main.ts:493` has `sandbox: false` for electron-trpc and `webviewTag: true` at `:495`.
- Renderer CSP initially allowed `unsafe-inline`, `unsafe-eval`, and remote scripts from `https://unpkg.com` in `src/renderer/index.html:6`. The emergency Phase 2 renderer XSS slice removes broad JavaScript `unsafe-eval` and the remote script origin; `wasm-unsafe-eval` remains for Shiki/Oniguruma WebAssembly syntax highlighting, and `unsafe-inline` remains documented for the startup theme and global error handler inline scripts until those boot scripts move to a hashed or bundled path.

Threat model:
- This is a local Electron app, not a remote multi-user API.
- The attacker is untrusted local content that influences renderer behavior: malicious repository files, `CLAUDE.md`/markdown, chat/tool output, MCP output, or previewed web content.
- The renderer is the confused deputy. If untrusted content can run or steer renderer code, it can call public tRPC procedures and ask the main process to use local privileges.
- Therefore the target is to limit renderer-reachable main-process effects and reduce the chance that untrusted content controls renderer code. It is not to add a user login token to tRPC context.

## Dangerous Procedure Inventory
This inventory was produced by scanning all 41 files under `src/main/lib/trpc/routers/`, the 32 mounted routers in `src/main/lib/trpc/routers/index.ts`, and the mounted `changes` git router under `src/main/lib/git/**`.

| Severity | Procedures | Main-process effect | Current boundary notes |
|---|---|---|---|
| Critical | `terminal.createOrAttach` (`terminal.ts:15`), `terminal.write` (`terminal.ts:46`), `terminal.signal` (`terminal.ts:72`), `terminal.kill` (`terminal.ts:86`) | Starts and controls a PTY; `terminal.write` still sends arbitrary bytes to the terminal. | Emergency 0b hardening made `createOrAttach` derive cwd from registered chat/workspace state and map only main-owned initial command intents. `terminal.write`/signal/kill still need Phase 3 capability/consent. |
| Critical | `claude.chat` (`claude.ts:58`), `codex.chat` (`codex.ts:439`), `agentRuntime.chat` (`agent-runtime.ts:497`) | Starts runtimes that can read/write files and execute tools; accepts renderer prompt, mode, cwd/projectPath, attachments, and optional scope contract. | Runtime preflight exists for desktop runs, but route inputs still present a broad privileged start surface. |
| Critical | MCP config writes: `claude.addMcpServer/updateMcpServer/setMcpBearerToken` (`claude.ts:395`, `:420`, `:455`), `codex.addMcpServer` (`codex.ts:371`), `mcpRegistry.install` (`mcp-registry.ts:141`) | Persists stdio commands, args, env, bearer tokens, or HTTP URLs for later runtime tool execution. | P1 fixed OAuth token storage; command/url capability admission remains structural. |
| High | `projects.cloneFromGitHub` (`projects.ts:249`) | Clones a GitHub repository and registers it as a project. | Emergency 0b hardening constrains renderer input to parsed GitHub `owner/repo` identity and executes `git clone` through argv, not a shell string. |
| High | `external.openInFinder/openInApp/openFileInEditor/openExternal` (`external.ts:131`, `:139`, `:189`, `:232`) | Opens arbitrary paths, launches local apps, or opens arbitrary URLs with OS privileges. | Needs registered path or explicit user gesture token; URL handling belongs to allowlist/consent policy. |
| High | `files.search/watchChanges/renameFile/deleteFile` (`files.ts:388`, `:568`, `:654`, `:680`) | Reads directory trees, watches paths, renames, or trashes filesystem paths. | Phase 1 files subset now reuses registered project/chat worktree roots and `path-boundary`; rename/delete require `projectPath` and reject targets outside that root. |
| High | `skills.create/update/delete` (`skills.ts:333`, `:399`, `:432`) and `agents.create/update/delete` (`agents.ts:99`, `:167`, `:251`) | Writes/removes user or project `.claude` runtime instruction files based on renderer `cwd` or path. | Project-scoped writes should resolve from registered project/chat, not raw `cwd`. |
| High | `commands.list/create` (`commands.ts:1103`, `:1185`) | Reads/writes command files under user or project command roots based on renderer `projectPath`. | P1 hardened get/update/delete; list/create should converge on the same resolver. |
| High | `agentRuntime.updateQwenExecutablePath/updateKunExecutablePath/updateKunConfigPath/installKunManagedBuild/updateKunManagedBuild/approveKunShellExecutableHash` (`agent-runtime.ts:302`, `:394`, `:429`, `:346`, `:371`, `:464`) | Persists executable/config paths, installs managed runtime bits, or approves shell executable hash. | Needs capability classification and explicit local setup intent. |
| High | `plugins.setDeveloperMode/chooseDeveloperSourceDirectory/removeDeveloperSource/previewRuntimePluginWriteAction/executeRuntimePluginWriteAction/installStoreCandidate/confirmDeveloperTrust/setRuntimeNativeEnabled/setControlledSetting/clearCache` (`plugins.ts:863`, `:892`, `:916`, `:951`, `:970`, `:999`, `:1272`, `:1318`, `:1502`, `:1604`) | Enables local plugin code paths, marketplace installs, runtime-native activation, settings writes, and cache mutation. | Existing plugin review gates are good precedent; route capability metadata should make the privileged surface auditable. |
| High | `changes` git mutations: staging/delete/discard (`staging.ts:17` to `:123`), commit/push/pull/sync/forcePush/merge/rebase/PR (`git-operations.ts:149` to `:614`), branch create/delete/fetch (`branches.ts:66` to `:262`) | Mutates repository state, deletes untracked files, pushes to remote, and opens PR URLs. | Most use `assertRegisteredWorktree` or `secureFs`; still dangerous operations that should be tagged and audited. |
| High | Provider/credential writes: `providerProfiles.saveProfile/deleteProfile/setDefault/testProfile` (`provider-profiles.ts:56`), `localApiProviderConfig.save/clear` (`local-api-provider-config.ts:118`), `claudeProviderConfig.save/clear/importLegacy` (`claude-provider-config.ts:26`), `codex.saveCodexApiKey/removeCodexApiKey/logout/startLogin` (`codex.ts:210`), `claudeCode.submitLocalLoginCode/importToken/importSystemToken/disconnect` (`claude-code.ts:322`, `:420`, `:456`, `:479`), `anthropicAccounts.add/remove` (`anthropic-accounts.ts:230`, `:318`) | Persists or removes secrets, provider endpoints, account state, or starts local auth flows. | Secrets stay main-side, but renderer reachability still needs operation classification and consent for imports/removals. |
| Medium | `terminal.listDirectory` (`terminal.ts:157`) and `projects.create` (`projects.ts:135`) | Reads arbitrary directory names or registers arbitrary local paths from renderer input. | Prefer dialog-originated or registered-entity roots. |
| Medium | `debug.clearChats/clearAllData/logout/openUserDataFolder/setOfflineSimulation` (`debug.ts:71`, `:83`, `:96`, `:106`, `:123`) | Destructive DB/admin/debug actions. | Should be dev-gated and capability-tagged. |
| Medium | `githubWorkflow.importTaskFromUrl/createDraftPullRequest/postPullRequestComment/replyToReviewThread/markReadyForReview/requestReviewers` (`github-workflow.ts:46` to `:137`) | Imports remote task URL or performs GitHub write-back. | Some write-back schemas require confirmation; route capabilities should make that requirement uniform. |
| Medium | `agentJobs.cancel/retry` (`agent-jobs.ts:78`, `:100`), `agentSchedules.pause/resume/delete/runNow` (`agent-schedules.ts:41`, `:49`, `:57`, `:65`), `appUpdates.download/quitAndInstall/check` (`app-updates.ts:64`, `:68`, `:72`) | Cancels/retries work, fires scheduled jobs, downloads or applies updates. | Not raw path sinks, but privileged effects. |

Already-good patterns to reuse:
- `files.ts:138` resolves file read roots through registered projects or chat worktrees.
- `src/main/lib/fs/path-boundary.ts` centralizes path containment.
- `src/main/lib/git/security/secure-fs.ts` and `assertRegisteredWorktree` protect many `changes` routes.
- `src/main/lib/git/worktree-setup-trust.ts` shows the approval/fingerprint pattern for repository-provided commands.

## Options

### Option A: Input Trust Convergence
Make renderer inputs identify server-known entities, not raw authority. Routes should resolve `chatId`, `projectId`, `subChatId`, `paneId`, or opaque attachment/local refs to canonical paths and state in the main process. Any remaining path-like field must pass `path-boundary` and registered-root checks.

Pros:
- Directly blocks the sinks that turn renderer control into filesystem or process authority.
- Builds on P1 and git `secureFs` patterns already tested in this repository.
- Incremental and reviewable per router.

Cons:
- Requires renderer call-site updates where today routes pass `cwd`, `projectPath`, `absolutePath`, or display paths.
- Does not by itself reduce XSS/untrusted-content risk; it limits the blast radius once renderer code is influenced.

### Option B: Capability and Consent Middleware
Introduce typed tRPC procedure wrappers or metadata helpers that classify operations such as `filesystem.read`, `filesystem.write`, `shell.execute`, `runtime.start`, `config.secret.write`, `external.open`, `network.write`, and `debug.destroy`. Dangerous classes go through explicit confirmation, audit, and kill-switch logic.

Pros:
- Creates a reviewable inventory and ongoing architecture guard.
- Gives users a consumption gate for high-risk operations even in a single-renderer app.
- Can reuse the worktree setup trust style for fingerprinted commands and config writes.

Cons:
- In a single renderer with no separate principals, this is not a true multi-subject authorization boundary.
- If applied before sink hardening, it may give a false sense of safety while raw paths and commands still exist.
- Consent prompts can become noisy without careful grouping and remembered decisions.

### Option C: Renderer Hardening
Reduce the chance that untrusted content can drive renderer code: strict CSP, removal of broad `unsafe-eval` where possible, sanitization of markdown/HTML/SVG output, sandboxed iframes/webviews for previews, and navigation/permission controls for local browser surfaces.

Pros:
- Attacks the upstream precondition instead of only hardening sinks.
- Protects every renderer-exposed bridge, including future routes.
- Separates untrusted preview/browser content from the privileged app renderer.

Cons:
- Potentially disruptive to dev tooling, syntax highlighting, Mermaid rendering, local browser preview, and electron-trpc assumptions.
- Requires real desktop smoke tests because browser security settings are easy to misread from unit tests alone.

## Recommendation
Use a phased plan:
1. Do Option A first. It directly closes the most exploitable sinks and follows already-validated local patterns.
2. Do Option C next. It reduces the upstream chance that untrusted content can steer the privileged renderer.
3. Add Option B as structural coverage. It gives audit, kill-switches, and explicit consumption gates, but should not replace sink hardening.

Do not start with "add authentication to tRPC Context." In this local Electron model, a renderer token or user session in context would be reachable by the same renderer code we are trying to constrain. Context can later carry window/session metadata, capability decision state, or trusted user-gesture IDs, but the first security boundary must be main-process validation of privileged effects.

## Impact on APIs and Preload
- Phase 1 should keep `exposeElectronTRPC()` and route names stable where possible.
- Inputs should change where raw authority is passed:
  - Runtime start routes should derive cwd/project path from `chatId`/`subChatId`.
  - Project-scoped files, commands, agents, skills, MCP, terminal, and local-browser paths should derive from registered `projectId`/`chatId` roots or explicit dialog-selected tokens.
  - External path openings should require registered paths or a short-lived main-issued user-gesture token.
- Phase 2 may change renderer CSP and webview/iframe settings but should not change tRPC schemas.
- Phase 3 may replace `publicProcedure` imports with capability-specific wrappers or metadata, but can preserve caller shape unless consent is required.

## Verification Strategy
- Add adversarial tRPC tests for every Phase 1 sink class: absolute path, `..`, symlink escape, unregistered root, forged `chatId/projectId`, raw command string, and forged cwd.
- Add architecture guard that fails new router procedures taking fields named `path`, `cwd`, `command`, `url`, `token`, `env`, `headers`, or `absolutePath` unless they use an approved resolver or capability wrapper.
- Add renderer smoke tests for CSP/webview/markdown behavior in Phase 2.
- Add middleware tests proving dangerous procedures are tagged and consent/audit is enforced in Phase 3.

## Open Questions
- Whether terminal creation should require an explicit interactive user gesture every time, or whether a registered chat/workspace terminal can grant a remembered pane capability.
- Whether global user-level writes under `~/.claude` should remain renderer-callable after consent, or move behind Settings-only workflows with stronger confirmation.
- Whether plugin and MCP command writes share one command fingerprint trust store or keep separate owners with a common capability interface.
