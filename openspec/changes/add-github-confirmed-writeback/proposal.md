# Change: Add Confirmed GitHub Write-Back

## Why
Locus can now read GitHub pull request context, checks, CI logs, review feedback, and can create a draft PR after user confirmation. The next product step is letting users write selected results back to GitHub without handing that mutation to a specific runtime transcript.

GitHub write-back is higher risk than read-only context because it can publish user-visible comments or change pull request state. Locus needs a platform-level confirmation flow where the user reviews the exact target and text before any `gh` mutation runs.

## What Changes
- Add a GitHub write-back capability for current pull requests that reuses local `gh` authentication and stores no GitHub token in Locus.
- Add editable, user-confirmed flows for:
  - posting a pull request comment,
  - replying to an unresolved review thread,
  - marking a draft pull request ready for review,
  - requesting reviewers.
- Show the exact repository, pull request, action, and public text/state change before execution.
- Keep high-risk actions out of scope for this change: auto-resolving review threads, submitting approvals/request-changes reviews, merging, auto-posting agent output, release publishing, or background retry loops.

## Impact
- Affected specs: `github-workflow-writeback`
- Depends on: `add-github-workflow-context`
- Affected code:
  - `src/shared/github-workflow-context.ts` or adjacent shared types for write-back request/result models
  - `src/main/lib/github-workflow/` for confirmed `gh` mutation helpers
  - `src/main/lib/trpc/routers/github-workflow.ts` for write-back procedures
  - `src/renderer/features/details-sidebar/sections/info-section.tsx` or extracted GitHub widgets for confirmation UI
  - i18n dictionaries and targeted Bun tests for command construction, confirmation gating, and UI state
