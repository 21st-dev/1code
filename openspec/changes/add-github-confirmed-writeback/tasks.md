## 1. Scope and contracts
- [x] 1.1 Define shared request/result types for confirmed GitHub write-back actions.
- [x] 1.2 Keep write-back payloads action-specific: PR comment, review-thread reply, mark ready for review, and request reviewers.
- [x] 1.3 Ensure shared types include target repo/PR identity, user-visible body or reviewer list, and normalized failure reasons.

## 2. Main-process write-back helpers
- [x] 2.1 Add a `github-workflow/writeback` helper that reuses the existing `gh` runner and status normalization.
- [x] 2.2 Implement confirmed PR comment posting.
- [x] 2.3 Implement confirmed review-thread reply through GitHub GraphQL using loaded thread IDs.
- [x] 2.4 Implement confirmed "mark ready for review" for draft PRs.
- [x] 2.5 Implement confirmed reviewer requests with explicit reviewer login input.
- [x] 2.6 Reject empty text, missing PR numbers, missing thread IDs, and unsupported repository state before running `gh`.

## 3. tRPC API surface
- [x] 3.1 Add write-back procedures under the existing GitHub workflow router.
- [x] 3.2 Require a confirmed request shape for each mutation procedure.
- [x] 3.3 Return structured success data and inline-displayable errors without leaking raw command output by default.
- [x] 3.4 Refresh current PR/review-comment queries after successful mutations where useful.

## 4. Renderer experience
- [x] 4.1 Add a reusable GitHub write-back confirmation dialog with target, action, editable body/reviewer fields, and final confirm/cancel controls.
- [x] 4.2 Add a PR card action for posting a PR comment.
- [x] 4.3 Add a review-thread action for drafting and posting a reply to a selected unresolved thread.
- [x] 4.4 Add a draft PR action for marking the PR ready for review.
- [x] 4.5 Add a reviewer request action with explicit reviewer login entry.
- [x] 4.6 Show success and failure inline on the relevant GitHub card, not only through toast notifications.

## 5. Safety and copy
- [x] 5.1 Add i18n strings that make public write-back and confirmation clear.
- [x] 5.2 Make disabled states explain missing `gh`, unauthenticated `gh`, non-GitHub repo, no PR, no thread ID, and empty body.
- [x] 5.3 Keep auto-resolve, merge, approval, and request-changes actions absent from the UI.

## 6. Tests and verification
- [x] 6.1 Add unit tests for write-back command construction and GraphQL payload shaping.
- [x] 6.2 Add unit tests for mutation guardrails and normalized error states.
- [x] 6.3 Add targeted renderer/UI-state tests for confirmation availability and disabled reasons.
- [x] 6.4 Run targeted Bun tests and OpenSpec validation.
- [x] 6.5 Run `bun run ts:check` and `bun run build` after the local filesystem no longer blocks full-project validation.
