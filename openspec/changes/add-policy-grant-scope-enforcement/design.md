## Context
The current runtime boundary change introduces a gated Codex app-server path for
headless Local Job API jobs. It validates that a non-desktop policy grant exists
before provider work starts, but the declared scope strings are not yet wired to
the app-server permission gate. They are admission/audit metadata.

True enforcement needs a scope grammar, a runtime policy representation, and a
bridge from non-desktop policy grants to app-server approval decisions. Without
that bridge, the selector must not claim declared scopes are bound.

## Goals
- Make `runtime.policyGrant.scopes` enforceable for supported non-desktop
  Codex app-server jobs.
- Deny out-of-scope file, shell, MCP, or runtime-configuration side effects
  before they execute.
- Preserve default Local Job API batch behavior.
- Keep scope binding in canonical runtime permission/adapter owners, not in
  Local Job API route parsing.

## Non-Goals
- Do not add Local Job API v2 streaming callbacks or visible-user interaction.
- Do not make app-server the default for existing API callers.
- Do not reimplement desktop app-server runtime logic in a separate headless
  adapter.
- Do not broaden provider credential exposure to callers.

## Decisions To Resolve
- The supported v1 scope vocabulary and whether it is coarse-grained or path
  aware.
- How out-of-scope app-server approval requests map to persisted events and
  result diagnostics.
- Whether unsupported scope strings fail validation at create time or fail
  selection before provider work.

## Risks / Trade-Offs
- Scope grammar drift can create false security claims. Mitigation: keep one
  owner for scope normalization and require tests for every scope category.
- App-server approval events may not map cleanly to Local Job API v1 payloads.
  Mitigation: persist sanitized status/error events in v1 and keep richer
  diagnostics internal unless a v2 contract is approved.
- Real app-server smoke may be environment-sensitive. Mitigation: keep unit
  coverage for the policy bridge and add an explicit smoke guard or documented
  local verification command.
