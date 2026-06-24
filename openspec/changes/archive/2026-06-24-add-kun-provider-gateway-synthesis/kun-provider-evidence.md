# Kun provider gateway synthesis evidence

Date: 2026-06-25

## Automated evidence

- `bun test --isolate tests/provider-gateway-scope.test.ts tests/kun-provider-config.test.ts tests/provider-profile-transforms.test.ts tests/provider-routing-ux.test.ts tests/kun-serve-launcher.test.ts`
  - 39 pass, 0 fail.
  - Covers scoped gateway token revoke, TTL refresh/backstop, endpoint-kind/profile scoping, upstream secret redaction, Kun synthesized config contents, cleanup idempotence, and Kun target UI/source guards.
- `bun run ts:check`
  - `tsc --noEmit` passed.
- `openspec validate add-kun-provider-gateway-synthesis --strict --no-interactive`
  - passed.
- `openspec validate --all --strict --no-interactive`
  - 56 passed, 0 failed.

## Live UI/provider smoke

- Test profile: `kun-deepseek-live-smoke`, target `kun`, provider `openai-chat`,
  base URL `https://api.deepseek.com`, model `deepseek-v4-flash`.
- Real app/UI flow selected project `ui_proof_1782306974`, Agent `Kun`, and
  profile `Kun DeepSeek Smoke - deepseek-v4-flash`, then sent:
  `Reply exactly UI_KUN_PROVIDER_GATEWAY_OK and nothing else.`
- UI final evidence:
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/32-provider-final-ui.text`
  and
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/32-provider-final-ui.png`.
  The assistant response contained exactly `UI_KUN_PROVIDER_GATEWAY_OK`.
- Persisted job evidence: latest Kun job for the smoke had runtime `kun`, status
  `succeeded`, and streamed assistant deltas spelling
  `UI_KUN_PROVIDER_GATEWAY_OK`.
- Gateway trace evidence:
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/artifacts/provider-gateway-trace.jsonl`
  contained sanitized incoming/forwarded requests for the selected profile,
  model, and tool list without the upstream key.
- Lifecycle evidence: the run ended with
  `/tmp/locus-kun-ui-live-proof-20260625-03HBgV/userData/kun-provider-configs`
  empty, proving the synthesized config was deleted. Secret scans across the
  artifact directory, renderer storage, Kun sessions, and app database reported
  zero plaintext provider-key hits.

## Capability state

- `providerProfiles`: supported for Kun-target provider profiles after the live
  DeepSeek gateway smoke and lifecycle cleanup proof.
- BYO config remains the fallback when no provider profile is selected.

## Final closeout verification

- Targeted regression suite:
  `bun test tests/kun-serve-launcher.test.ts tests/desktop-agent-jobs.test.ts tests/agent-runtime-capabilities.test.ts tests/agent-runtime-registry.test.ts tests/kun-http-sse-adapter.test.ts tests/agent-guard-runtime-pipeline.test.ts tests/kun-provider-config.test.ts tests/provider-gateway-scope.test.ts tests/provider-routing-ux.test.ts`
  - 70 pass, 0 fail.
- `bun run check`
  - Passed lint, architecture guard, TypeScript, and 1242 tests.
- `openspec validate add-kun-provider-gateway-synthesis --strict --no-interactive`
  - Passed before archive.
- `openspec validate --all --strict --no-interactive`
  - Passed before archive with 56 items; passed after archive with 54 items.
