# Change: Bind policy-grant scopes to runtime enforcement

## Status

**Deferred — parked proposal. Do not implement yet.** (As of 2026-06-16.)

This change is intentionally not scheduled. The parent change
`refactor-runtime-core-execution-boundary` already makes current behavior honest
(policy-grant scopes are admission/audit-only, default stays batch, guarded runs
fail closed), so there is no integrity or security gap forcing this work now.

Implement only when ALL of the following are true:
- A real first-party consumer (e.g. Career Kit) needs non-interactive Codex
  app-server execution with a bounded write/shell/MCP surface, AND
- batch `codex exec` cannot serve that use case, AND
- admission/audit-only enforcement is insufficient for that consumer.

When triggered, let the consumer's actual requirements define the scope grammar,
and first resolve whether to reuse the existing `agent-scope-contracts`
vocabulary instead of inventing a second scope language.

## Why
`refactor-runtime-core-execution-boundary` keeps Local Job API
`runtime.policyGrant.scopes` honest by treating them as admission/audit metadata.
That is enough for gated opt-in app-server execution, but it is not true
per-scope enforcement.

Downstream automation that needs non-interactive app-server execution with a
bounded write/shell/MCP surface needs a separate change that defines the scope
schema and binds those scopes to adapter permission decisions before side
effects execute.

## What Changes
- Define stable non-desktop policy-grant scope semantics for Local Job API and
  runtime permission policy.
- Translate validated policy-grant scopes into Codex app-server permission
  decisions before provider or tool work can perform side effects.
- Fail closed when an adapter cannot bind declared scopes, when a requested side
  effect is outside scope, or when a callback would need an unavailable user.
- Add a real headless Codex app-server smoke or equivalent integration proof for
  in-scope execution, out-of-scope denial, cancellation, events, and result
  persistence.
- Update Local Job API docs from admission/audit-only to declared-scope-bound
  where the implementation proves it.

## Impact
- Affected specs: `agent-runtime-core`, `local-job-api`
- Affected code: Local Job API validation/docs, runtime permission policy,
  headless adapter selector, Codex app-server headless wrapper, app-server
  approval bridge tests
- Compatibility: default Local Job API v1 batch behavior remains unchanged;
  policy-grant behavior becomes stricter for callers that opt into enforced
  scopes
