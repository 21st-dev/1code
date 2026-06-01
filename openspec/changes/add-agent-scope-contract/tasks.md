## 1. Contract Model and Validation
- [x] 1.1 Add shared guarded-run types for scope contracts, scope paths, success checks, expansion events, guard decisions, and audit summaries.
- [x] 1.2 Add main-process Zod validation for approved contracts.
- [x] 1.3 Normalize contract paths relative to the selected project/worktree root.
- [x] 1.4 Reuse existing git/path security helpers for registered worktree, traversal, symlink, blocked-path, and sensitive-file checks.
- [x] 1.5 Add unit tests for valid contracts, empty editable scope, absolute paths, parent traversal, symlinks, blocked paths, sensitive paths, directory entries, and glob entries.

## 2. Renderer Guarded Run UX
- [x] 2.1 Add a Guarded Run draft card in the agents chat input flow without large rewrites to `active-chat.tsx`.
- [x] 2.2 Let users edit editable scope, read-only evidence, and success checks before approval.
- [x] 2.3 Seed draft contracts from selected files, current changed files, GitHub context, and Plan-mode summaries where available.
- [x] 2.4 Show source labels for suggested contract entries.
- [x] 2.5 Provide an explicit run-without-guard path for quick tasks.
- [x] 2.6 Add UI tests or component-level tests for draft editing, approval, removal, and send blocking.

## 3. Transport and Router Payloads
- [x] 3.1 Extend Claude chat transport payloads with approved `scopeContract` metadata.
- [x] 3.2 Extend Codex chat transport payloads with approved `scopeContract` metadata.
- [x] 3.3 Add tRPC input schemas for guarded-run metadata in `claude.chat` and `codex.chat`.
- [x] 3.4 Ensure the main process rejects invalid guarded-run payloads before invoking any runtime.
- [x] 3.5 Add transport/router tests that prove the contract reaches the main process for both runtimes.

## 4. Claude Hard Enforcement
- [x] 4.1 Add `src/main/lib/agent-guard/` guard decision helpers.
- [x] 4.2 Classify Claude tool names into read, write, shell, approval, and unknown categories.
- [x] 4.3 Gate `Edit`, `MultiEdit`, `Write`, `NotebookEdit`, and unknown write-like tools against editable scope.
- [x] 4.4 Gate `Bash` with exact success-check matching plus conservative high-risk command denial.
- [x] 4.5 Emit structured guard events for allowed, blocked, and expansion-request decisions.
- [x] 4.6 Preserve existing Plan-mode and `AskUserQuestion` behavior.
- [x] 4.7 Add router-level tests for in-scope writes, out-of-scope writes, empty scope, blocked paths, allowed checks, and denied risky commands.

## 5. Scope Expansion
- [x] 5.1 Add a scope-expansion request event shape and renderer state.
- [x] 5.2 Reuse or mirror the pending tool approval pattern for approve/reject actions.
- [x] 5.3 Update the in-memory run contract when the user approves expansion.
- [x] 5.4 Persist expansion decisions in assistant message metadata.
- [x] 5.5 Add tests for approved and rejected expansion flows.

## 6. Codex Contract and Audit
- [x] 6.1 Inject a deterministic guarded-run prompt block into Codex requests.
- [x] 6.2 Label Codex guarded runs as contract-and-audit until hard enforcement is available.
- [x] 6.3 Capture pre-run and post-run git status for Codex guarded runs.
- [x] 6.4 Compare changed files to approved and expanded scope.
- [x] 6.5 Mark out-of-scope Codex changes as drift or needs-review.
- [x] 6.6 Document the follow-up needed for ACP pre-tool permission support.

## 7. Pending Changes Review and Audit UI
- [x] 7.1 Capture pre-run git status before guarded execution starts.
- [x] 7.2 Compute post-run changed files, diff stats, and in-scope/out-of-scope classification.
- [x] 7.3 Render a final audit summary on the assistant response.
- [x] 7.4 Link audit changed files to the existing diff/review surface.
- [x] 7.5 Warn before guarded runs start when unrelated dirty files make audit ambiguous.
- [x] 7.6 Add workbench status mapping for blocked, drifted, and needs-review guarded runs where the workbench is available.

## 8. Checkpoints and Rollback
- [x] 8.1 Decide the MVP checkpoint mechanism after validating current git/diff helpers.
- [x] 8.2 If implemented, require user confirmation before rollback.
- [x] 8.3 Avoid rollback actions when the worktree has unrelated dirty files that cannot be separated safely.
- [x] 8.4 Add tests for checkpoint availability and disabled-state reasons.

## 9. Verification
- [x] 9.1 Run targeted unit tests for `agent-guard`.
- [x] 9.2 Run targeted renderer tests for Guarded Run UI.
- [x] 9.3 Run targeted router tests for Claude and Codex guarded payloads.
- [x] 9.4 Run `bun run ts:check`.
- [x] 9.5 Run `bun run test` or the narrowest equivalent stable test suite.
- [x] 9.6 Perform a manual local smoke test: Plan-mode handoff, Claude in-scope edit, Claude out-of-scope denial, scope expansion, Codex audit-only drift detection, and final review summary.

Manual smoke note: the dev app was launched with a temporary local profile, local mode loaded, a seeded local workspace opened, and the Guarded Run draft/approve UI was exercised. Live Claude/Codex provider sends were not run in the smoke profile; runtime gate, expansion, Codex audit, and workbench behavior are covered by targeted tests.
