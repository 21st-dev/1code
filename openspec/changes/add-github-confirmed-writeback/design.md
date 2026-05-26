## Context
The existing GitHub workflow context work intentionally made most GitHub operations read-only and created draft PRs only after explicit user confirmation. Confirmed write-back extends that model to user-visible PR comments and PR state changes.

## Goals
- Keep GitHub write-back as a Locus platform capability, available to Claude Code, Codex, and provider-backed workflows equally.
- Require an editable confirmation step before every GitHub mutation.
- Execute mutations only in the main process through local `gh`, reusing the user's existing GitHub CLI authentication.
- Return structured success/error results that the renderer can show inline.

## Non-Goals
- No automatic reply based only on agent output.
- No auto-resolve of review threads in the first version.
- No merge, approval, request-changes, release, or artifact upload actions.
- No Locus-managed GitHub token storage.

## Decisions
- Decision: Use a two-phase UI flow: prepare a draft action in renderer, then execute only from an explicit confirmation control.
  - Why: the user must see the exact public text or PR state change before mutation.
- Decision: Require main-process procedures to accept action-specific payloads and reject missing/empty targets, missing body text, or unsupported PR/thread identifiers.
  - Why: renderer confirmation is necessary but not sufficient for mutation safety.
- Decision: Use the existing GitHub status/current PR/review-comment context as the source of repo, PR, branch, and review-thread identity.
  - Why: write-back should not introduce a separate GitHub selection model.
- Decision: Keep review-thread resolution out of v1 even though GitHub supports it through GraphQL.
  - Why: resolving a thread implies reviewer-facing completion. A posted reply is reversible by follow-up comment; resolving is a stronger state mutation.

## Risks / Trade-offs
- Public comments can expose sensitive text if copied from logs or agent output.
  - Mitigation: require editable review, preserve existing redaction for generated context, and do not auto-post agent output.
- `gh` capabilities differ by version.
  - Mitigation: keep command wrappers centralized, return normalized error states, and add command-construction tests.
- Review-thread replies require GraphQL IDs and may fail for outdated or inaccessible threads.
  - Mitigation: only offer reply actions for loaded unresolved thread IDs, show inline errors, and do not hide the original review context.

## Migration Plan
- Add write-back as an optional action on top of existing GitHub context UI.
- Existing read-only context, CI log handoff, review comment handoff, and draft PR creation continue to work unchanged.
- If `gh` is missing, unauthenticated, or the repo is not a GitHub repo, write-back actions stay disabled with existing GitHub status explanations.
