# Tasks: Kun provider-profile gateway synthesis

> Approval gate: do not start until this proposal is approved AND
> `add-kun-http-sse-runtime` is merged. Branch off clean `main`. Keep Kun
> flag-gated. Independent of the guarded-shell change — this one stays on
> `workspace-write` and does not touch sandbox posture.

## 0. Pre-flight
- [ ] 0.1 Branch off clean `main`; pin the reference `kun` version for the gateway
      smoke.
- [ ] 0.2 Gateway preflight: prove a bound Locus profile (DeepSeek) drives Kun via
      `baseUrl=<gateway responses endpoint>`, `apiKey=<scoped token>`,
      `endpointFormat=responses` → streamed answer. If unproven, stop and keep
      `providerProfiles` `degraded`.

## 1. Kun provider-profile target
- [x] 1.1 Add `"kun"` to `providerProfileTargets`
      (`src/shared/provider-profile-types.ts`).
- [x] 1.2 Extend gateway diagnostics (`gateway.ts`) to evaluate the `kun` target
      (currently Claude/Codex only).
- [x] 1.3 Renderer: filter Kun-target profiles into Kun chat selection; exclude
      from unrelated target filters; consistent save semantics.
- [x] 1.4 Tests: a `kun`-target profile is offered to Kun, excluded elsewhere, and
      diagnosed under `kun`.

## 2. Config synthesis
- [x] 2.1 On profile bind, synthesize a Kun config (gateway `responses` `baseUrl`,
      scoped token `apiKey`, `endpointFormat=responses`, profile `model`); write
      `0o600` to an isolated userData path; pass via `--config`.
- [x] 2.2 Bound profile takes precedence; BYO `--config` used only when no profile
      is bound.
- [x] 2.3 Upstream key injected only on main-process gateway forward; absent from
      synthesized config, `argv`, renderer, logs, traces.

## 3. Token + config lifecycle (load-bearing safety)
- [x] 3.1 Add a per-run-safe TTL to gateway tokens (`gateway.ts`
      `getProviderGatewayEndpoint` / token map): generous backstop sized > any
      realistic run, refreshed while a run is active; MUST NOT shorten existing
      Claude/Codex token lifetimes (shared consumer).
- [x] 3.5 Test: existing Claude/Codex gateway runs are unaffected by the TTL — a
      long-running token does not expire mid-run.
- [x] 3.2 Add a revoke path that removes a token from the gateway token store.
- [x] 3.3 Wrap the Kun run so a `finally` always deletes the synthesized config
      and revokes the scoped token — on completion, cancel, abort, and error.
- [x] 3.4 Tests: after run end/cancel/error the config file is gone and the token
      is rejected by the gateway; an expired token is rejected after TTL.

## 4. Manifest honesty
- [x] 4.1 Flip `providerProfiles` `degraded`→`supported` ONLY after 0.2 + the
      lifecycle tests pass; otherwise keep `degraded` with the gateway-proof gap
      reason (governed by the existing honest-manifest requirement).

## 5. Acceptance
- [ ] 5.1 Provider smoke: select a DeepSeek (or other) Kun-target profile →
      synthesized config → streamed answer; upstream key absent from
      argv/renderer/logs; token revoked + config deleted at run end.
- [ ] 5.2 Regression: BYO config still works with no profile bound; flag-off
      unchanged; Claude/Codex/Qwen unaffected.
- [x] 5.3 Record evidence in `kun-provider-evidence.md`.

## 6. Validate
- [x] 6.1 `openspec validate add-kun-provider-gateway-synthesis --strict --no-interactive`.
- [x] 6.2 `bun run check` green; flag-off behavior unchanged.
