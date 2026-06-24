# Change: Kun provider-profile gateway synthesis

## Why

Kun v1 drives a model only through a hand-written BYO `config.json`
(`providerProfiles` `degraded`). A first-class experience lets a Kun chat pick a
Locus provider profile (e.g. DeepSeek — already a Locus preset) in the UI, routed
through the existing profile-scoped local gateway, which already translates
between `responses` and upstream `chat/completions` dialects. This is low-risk
integration with machinery Locus owns, and is independent of the separate
high-risk guarded-shell change.

Depends on `add-kun-http-sse-runtime` (merged).

## What Changes

- Add a dedicated `kun` provider-profile **target** so Kun-bound profiles have
  consistent UI filtering, gateway diagnostics, and save semantics (rather than
  overloading `local`).
- When a Kun chat binds a Locus provider profile, **synthesize** an ephemeral Kun
  config targeting the loopback gateway: `baseUrl=<gateway responses endpoint>`,
  `apiKey=<profile-scoped gateway token>`, `endpointFormat=responses`, `model`
  from the profile. The gateway injects the upstream key only on main-process
  forward and translates `responses`↔upstream dialect; the upstream key never
  enters the synthesized config, Kun `argv`, renderer, logs, or traces.
- **Token + config lifecycle (this is the load-bearing safety work):** the scoped
  gateway token currently lives in an in-memory map with no TTL/revoke, and the
  synthesized config is a file on disk. So Locus MUST, in a `finally`, **delete the
  synthesized config and revoke the scoped token** (remove it from the gateway
  token map) on run completion, cancel, and error — and bound the token with a
  TTL so a leaked/stale config cannot keep authenticating for the app lifetime.
- BYO `config.json` remains supported when no profile is bound.
- Renderer: a Kun chat can select a Kun-target Locus provider profile in
  new-chat/settings; gateway diagnostics cover the `kun` target.
- Manifest: `providerProfiles` flips `degraded`→`supported` ONLY after a real
  gateway smoke proves an end-to-end streamed answer (governed by the existing
  honest-manifest requirement).

## Capabilities

### Modified Capabilities
- `provider-runtime-bindings`: add Kun as a profile-scoped gateway consumer via a
  synthesized runtime config, with explicit per-run token revoke + config cleanup
  and a dedicated `kun` profile target.

## Impact

- Affected code:
  - `src/shared/provider-profile-types.ts` (`providerProfileTargets += "kun"`)
  - `src/main/lib/provider-profiles/gateway.ts` (per-run token revoke/TTL;
    `kun`-target diagnostics)
  - `src/main/lib/kun/` config synthesis + lifecycle (`finally` delete + revoke)
  - `src/main/lib/kun/kun-serve-launcher.ts` (consume synthesized vs BYO config)
  - renderer: Kun provider-profile selection + filtering by `kun` target
- Out of scope: shell / sandbox posture (separate
  `add-kun-guarded-shell-danger-full-access`); plan mode; bundling.
- Default builds unchanged; Kun stays flag-gated and desktop-only experimental.
