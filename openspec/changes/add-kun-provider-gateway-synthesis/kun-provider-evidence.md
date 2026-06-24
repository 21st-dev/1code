# Kun provider gateway synthesis evidence

Date: 2026-06-24

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

## Residual manual smoke gap

- No real DeepSeek/Kun streamed answer was observed in this run.
- `providerProfiles` remains degraded for Kun until a real desktop smoke proves:
  - a Kun-target profile drives Kun via the loopback responses gateway;
  - the upstream provider key is absent from argv/renderer/logs;
  - the synthesized config is deleted and the scoped gateway token is revoked at run end.
