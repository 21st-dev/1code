> **Deferred** — do not start. See `proposal.md` → Status for the trigger conditions that must all be true before implementing.

## 1. Scope Contract
- [ ] 1.1 Define the supported Local Job API policy-grant scope grammar and map it to runtime permission categories.
- [ ] 1.2 Reject unknown, contradictory, or non-enforceable scopes before provider work starts.
- [ ] 1.3 Document compatibility for existing admission/audit-only policy-grant callers.

## 2. Runtime Enforcement
- [ ] 2.1 Extend non-desktop permission policy with declared-scope-bound enforcement metadata.
- [ ] 2.2 Bind validated scopes into the Codex app-server approval gate used by the headless wrapper.
- [ ] 2.3 Fail closed when app-server permission interception is unavailable, delayed, or cannot classify the requested side effect.
- [ ] 2.4 Preserve default batch selection for Local Job API v1 requests that omit `runtime.executionProfile`.

## 3. Verification
- [ ] 3.1 Add unit tests for scope normalization, selection diagnostics, in-scope allow, and out-of-scope denial.
- [ ] 3.2 Add a real headless Codex app-server smoke or equivalent integration test covering events, cancellation, permission denial, and result persistence.
- [ ] 3.3 Run `bun run ts:check`.
- [ ] 3.4 Run `bun run build`.
- [ ] 3.5 Run `bunx openspec validate --all --strict --no-interactive`.

## 4. Documentation
- [ ] 4.1 Update Local Job API consumer docs to distinguish admission/audit-only compatibility from enforced scopes.
- [ ] 4.2 Update `docs/OWNERSHIP_MAP.md` if a new canonical scope-binding owner is introduced.
