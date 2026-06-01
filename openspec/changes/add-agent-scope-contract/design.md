# Agent Scope Contracts Design

## Context
Locus is a local-first desktop app with local project chats, sub-chats, Claude Code and Codex runtime paths, Plan/Agent modes, streamed tool display, local SQLite message persistence, git/diff helpers, GitHub context helpers, App Agents, runtime plugins, and local-only cloud guards.

The missing product layer is a Locus-owned execution boundary. Users can ask an agent to make changes, but the app does not currently require a confirmed list of editable paths or a reviewable contract between planning and implementation. The result is a workflow that can feel like ad-hoc prompting: the model decides what to touch, and the user discovers the real scope afterward.

This change adds a Guarded Run capability. A guarded run starts from a user-confirmed scope contract, enforces that contract where the runtime supports tool permissions, and audits actual changes afterward.

## Goals
- Give users a visible boundary before Agent mode changes files.
- Convert Plan-mode output into an executable, user-confirmed scope contract.
- Enforce file-edit scope in Claude Code with code-level gates, not only prompt text.
- Keep Codex useful in phase one through prompt-visible contracts and post-run drift audit, without overclaiming hard enforcement.
- Keep the main process as the source of truth for validation, paths, filesystem boundaries, and runtime permission decisions.
- Reuse existing local git, diff, message, approval, and workbench surfaces where possible.
- Make runs inspectable through a concise audit summary and linear event trace.
- Preserve local-first behavior and avoid hosted orchestration.

## Non-Goals
- Do not add Kevix, Plandex, Cline, Aider, OpenHands, mini-SWE-agent, or Goose as dependencies.
- Do not add a new coding-agent runtime.
- Do not replace Claude Code, Codex, App Agents, runtime plugins, or OpenSpec.
- Do not build a full Docker or remote sandbox in this change.
- Do not promise Codex hard tool blocking until a verified pre-execution permission hook exists.
- Do not require every quick edit to use a guarded run.
- Do not infer and enforce a scope silently without user confirmation.
- Do not store provider secrets, full tool outputs, or full file contents in guard metadata.

## Terms
- Scope contract: A user-confirmed run boundary containing editable paths, read-only evidence paths, success checks, and metadata.
- Guarded run: A single runtime invocation that carries a scope contract.
- Hard enforcement: A runtime tool call is allowed or denied before it executes.
- Soft enforcement: A contract is injected as context and the app audits actual results after execution.
- Scope expansion: A user-approved change to add editable paths or success checks during a running guarded run.
- Drift: A completed run changed files or attempted actions outside the approved contract.

## Current Integration Points
- Claude transport payloads originate in `src/renderer/features/agents/lib/ipc-chat-transport.ts` and call `trpcClient.claude.chat.subscribe`.
- Codex transport payloads originate in `src/renderer/features/agents/lib/acp-chat-transport.ts` and call `trpcClient.codex.chat.subscribe`.
- Claude runtime setup in `src/main/lib/trpc/routers/claude.ts` already has a `canUseTool` hook and an `AskUserQuestion` pending-approval pattern.
- Codex runtime setup in `src/main/lib/trpc/routers/codex.ts` uses `@mcpc-tech/acp-ai-provider` with `streamText` and provider tools. The currently used provider path does not expose a Locus-controlled pre-tool permission callback.
- `sub_chats.messages` stores message JSON and can carry message metadata for MVP audit persistence.
- Existing git security utilities under `src/main/lib/git/security/` should remain the path-boundary source rather than duplicating string-prefix checks.

## Scope Contract Model
Use a runtime-neutral type owned by Locus:

```ts
type AgentScopeContract = {
  id: string
  version: 1
  status: "draft" | "approved" | "expanded" | "completed" | "rejected"
  createdAt: string
  approvedAt?: string
  source: "manual" | "plan" | "selection" | "git" | "github" | "resume"
  chatId: string
  subChatId: string
  runId?: string
  cwd: string
  projectPath?: string
  editableScope: ScopePath[]
  readOnlyEvidence: ScopePath[]
  successChecks: SuccessCheck[]
  blockedPaths?: ScopePath[]
  expansions: ScopeExpansion[]
}

type ScopePath = {
  path: string
  kind: "file" | "directory" | "glob"
  reason?: string
}

type SuccessCheck = {
  command: string
  cwd?: string
  reason?: string
  allowShellControl?: false
}

type ScopeExpansion = {
  id: string
  requestedAt: string
  approvedAt?: string
  rejectedAt?: string
  requestedByToolUseId?: string
  paths?: ScopePath[]
  successChecks?: SuccessCheck[]
  reason: string
}
```

The renderer may create drafts, but the main process must normalize and validate the approved contract before runtime invocation.

## Validation Rules
The main process should validate the contract as follows:

- `cwd` must resolve to the selected local project or worktree path.
- All paths must be relative to the approved project/worktree root after normalization.
- Absolute paths, empty paths, parent traversal, null bytes, and workspace-outside paths are invalid.
- Symlink and registered-worktree checks should reuse existing git security helpers.
- Editable scope must be non-empty for a guarded Agent-mode run.
- Read-only evidence paths may overlap editable scope only if the user explicitly made them editable.
- Blocked paths win over editable paths.
- Sensitive local files such as `.env`, private keys, credential stores, and app data directories must be denied unless a later spec explicitly designs a secret-aware exception flow.
- Success checks must be bounded commands, not arbitrary shell scripts.

## Contract Lifecycle
1. User requests non-trivial agent work or chooses Guarded Run.
2. Locus shows a scope contract draft.
3. The draft may be seeded from selected files, changed files, GitHub context, current plan text, or explicit prompt mentions.
4. The user reviews and approves the contract.
5. Renderer sends the user prompt plus `scopeContract` metadata to the selected runtime router.
6. Main process validates and freezes the approved contract for the run.
7. Runtime starts with the contract attached.
8. Tool calls are enforced where possible and recorded as guard events.
9. Runtime finishes, errors, or is stopped.
10. Main process computes a post-run audit from guard events and local git/diff state.
11. UI shows a compact summary and detailed trace.

## Plan-to-Contract Flow
Plan mode remains read-first. When a plan is ready, Locus should offer "Run with scope" from the plan context. The app may parse the plan for proposed files and checks, but the resulting contract stays a draft until the user approves it.

The plan-derived draft should include provenance so the user can see whether each item came from the plan text, selected context, current git changes, or manual edits.

## Claude Code Hard Enforcement
Claude Code is the first hard-enforcement runtime because `claude.ts` already receives each tool name and input through `canUseTool`.

Recommended guard order inside `canUseTool`:

1. Runtime-specific input normalization that already exists for local/Ollama variants.
2. Contract lookup and validation for the current `runId`.
3. Plan-mode existing restrictions.
4. Agent guard file and command checks.
5. Existing `AskUserQuestion` approval handling.

Tool behavior:

- `Read`, `Glob`, `Grep`, and similar read tools may run when paths are inside the project/worktree boundary and not blocked.
- `Edit`, `MultiEdit`, `Write`, `NotebookEdit`, and future write-like tools must target an approved editable path.
- Directory and glob editable entries must resolve conservatively and must not imply workspace-root write access unless explicitly approved.
- `Bash` may run only if it matches an approved success check or a low-risk read-only command allowed by the guard policy.
- High-risk shell commands are denied regardless of prompt text.
- Unknown write-like tools default to deny until classified.

Denials should return a clear runtime-visible message and emit a user-visible guard chunk when possible.

## Bash Guard Policy
Bash command parsing is error-prone, so the first implementation should be conservative:

- Allow exact approved success check commands.
- Allow a small list of read-only inspection commands only if they are project-local and do not include shell control operators.
- Deny commands containing shell control or redirection operators unless the exact command was explicitly approved.
- Deny destructive git commands, forced pushes, publish/deploy commands, package install commands, secret inspection, privilege escalation, and pipe-to-shell patterns.
- Treat `git status`, `git diff`, `git log`, and project test commands as common allowed checks when explicitly present in `successChecks`.

Examples of denied patterns include `rm -rf`, `git reset --hard`, `git clean -fd`, `git push --force`, `npm publish`, `curl ... | sh`, `sudo`, and direct reads of `.env` or private key paths.

## Scope Expansion
When the runtime attempts to edit outside the approved scope, Locus should not silently expand the contract. Instead:

1. The guard emits a `scope-expansion-request` event containing the requested path, tool, and reason.
2. The running tool call pauses or is denied with an instruction to wait for user approval, depending on what the runtime hook supports.
3. The renderer shows Approve and Reject actions.
4. Approving appends a `ScopeExpansion` to the in-memory run contract and records the event in message metadata.
5. Rejecting keeps the denial and records the rejected expansion.

The first implementation may deny first and ask the model to retry after approval if the SDK hook cannot pause and resume the same tool call cleanly.

## Codex Phase-One Behavior
Codex must receive the same contract payload, but the first implementation should use soft enforcement:

- Main process validates the contract before invoking Codex.
- `codex.ts` prepends a deterministic guarded-run block to the prompt.
- The block lists editable scope, read-only evidence, success checks, and instructions to request scope expansion instead of editing outside the contract.
- The app records Codex tool parts and final changed files where available.
- On finish, the app audits actual git changes against the approved contract.
- Out-of-scope changes mark the run as `drifted` or `needs-review`.

Hard Codex enforcement becomes a later phase only after Locus verifies a safe ACP permission callback, provider wrapper, or runtime configuration that allows pre-execution tool decisions.

Follow-up for Codex hard enforcement:
- Verify whether the ACP provider can expose a synchronous pre-tool permission hook with tool name, tool arguments, and a resumable denial/approval path.
- If ACP cannot expose that hook, evaluate a Locus-owned provider wrapper that can classify and block write-like tools before execution.
- Keep the UI label as `contract-and-audit` until one of those paths is implemented and covered by runtime tests.

## Prompt Contract Block
For runtimes that need prompt-visible contracts, use a bounded deterministic block:

```text
<locus_guarded_run id="..." version="1">
editable_scope:
- src/example.ts
read_only_evidence:
- tests/example.test.ts
success_checks:
- bun run test tests/example.test.ts
policy:
- Do not modify files outside editable_scope.
- Request scope expansion before touching additional files.
- Treat success_checks as the intended verification commands.
</locus_guarded_run>
```

This block is advisory for hard-enforced runtimes and mandatory context for soft-enforced runtimes.

## Pending Changes and Checkpoints
The first implementation should avoid a full shadow filesystem. Instead:

- Capture pre-run git status for the project/worktree.
- Warn if the worktree has unrelated dirty files before starting a guarded run.
- After the run, compute changed files and diff stats.
- Mark changed files as in-scope, expanded-scope, or out-of-scope.
- Offer review actions through existing diff surfaces.
- Use the existing Claude rollback checkpoint only when the repository state allows it and the user confirms.
- Disable guarded rollback when pre-run git status is dirty, because unrelated local changes cannot be separated safely.
- Keep Codex guarded runs audit-only for rollback until ACP hard-gate/checkpoint hooks are available.

A future Plandex-style diff sandbox can be designed later if users need edits to stay outside the worktree until review.

## Run Audit Metadata
Persist an audit summary as message metadata for MVP:

```ts
type GuardedRunAudit = {
  runId: string
  contractId: string
  runtime: "claude" | "codex"
  status: "passed" | "expanded" | "blocked" | "drifted" | "failed" | "stopped"
  changedFiles: GuardedChangedFile[]
  blockedEvents: GuardEvent[]
  expansionEvents: ScopeExpansion[]
  verificationCommands: VerificationResult[]
  startedAt: string
  finishedAt?: string
}
```

This keeps the MVP compatible with `sub_chats.messages`. A dedicated `agent_run_contracts` or `guarded_runs` table should be added only if workbench queries, retention, or cross-message lookup cannot be handled cleanly from message metadata.

## UI Shape
- Guarded Run card near the chat input for non-trivial Agent-mode runs.
- Compact editable sections for editable scope, read-only evidence, and success checks.
- Visible source labels for suggested entries.
- A secondary "Run without guard" path for quick obvious changes.
- Guard events rendered inline with tool output, not hidden in logs.
- Final audit summary attached to the assistant response.
- Workbench integration can surface guarded runs as `needs-review`, `blocked`, or `drifted`.

## Relationship To Existing Capabilities
- App Agents provide reusable instructions. They do not grant tool permissions. Scope contracts are run-specific execution boundaries.
- Runtime Plugins may add tools. Guard classification must deny unknown write-like tools until explicitly supported.
- Local-only Cloud Guard continues to block hosted upstream product services. Guarded runs are local project workflows.
- Agent Context Recommendations may suggest files or checks. Suggestions must remain user-confirmed before enforcement.
- Agent Workbench may display guard audit state, but chat/sub-chat remains the source of truth for the first implementation.

## Security and Privacy
- Renderer state must not be trusted as the final contract authority.
- The main process must not expose provider secrets or arbitrary filesystem paths through guard chunks.
- Logs should include ids, normalized relative paths, tool names, and decisions, not file contents or secret-like command output.
- Prompt-only contracts are not security boundaries.
- The guard protects project scope, not OS-level sandboxing.

## Rollout Plan
1. Contract schema, validation, and unit tests.
2. Renderer Guarded Run draft card and transport payloads.
3. Claude hard gate for file writes and conservative bash checks.
4. Guard event chunks and inline UI rendering.
5. Post-run audit and changed-file classification.
6. Codex prompt contract and post-run audit.
7. Scope expansion approval.
8. Workbench status integration and optional checkpoint/rollback.

## Risks and Mitigations
- Risk: Overly strict guards block legitimate edits.
  - Mitigation: expose scope expansion and clear denial reasons.
- Risk: Bash parsing misses edge cases.
  - Mitigation: allow exact approved checks and deny ambiguous shell control by default.
- Risk: Codex users assume hard enforcement.
  - Mitigation: label Codex as "contract + audit" until hard permission support lands.
- Risk: Dirty worktrees make audit ambiguous.
  - Mitigation: capture pre-run status and warn before starting.
- Risk: UI adds friction for small tasks.
  - Mitigation: make Guarded Run recommended for non-trivial Agent mode, not mandatory for every send.
- Risk: New guard code duplicates path security.
  - Mitigation: reuse existing git security/path validation utilities and add tests for traversal, symlinks, and workspace boundaries.

## Open Questions
- Should Guarded Run be default-on for Agent mode after a Plan-mode handoff, or opt-in until users trust the flow?
- Should directory scope entries be allowed in MVP, or should the first version require explicit files plus globs?
- Should checkpoints use git stash, temporary branch commits, or only pre/post diff summaries in the first implementation?
- What exact UI copy should distinguish Claude hard enforcement from Codex audit-only behavior without exposing runtime internals?
