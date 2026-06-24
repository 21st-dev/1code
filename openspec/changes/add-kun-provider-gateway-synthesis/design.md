## Context

Locus already runs a profile-scoped loopback provider gateway
(`provider-profiles/gateway.ts`): `getProviderGatewayEndpoint(providerId, kind)`
mints a `randomBytes(32)` token into an in-memory `gateway.tokens` Map and returns
a loopback `baseUrl`. `GatewayEndpointKind` is `"anthropic" | "responses"`, and
the gateway translates `responses`↔`chat/completions` (`responsesToChatCompletions...`,
`streamChatAsResponses`), with DeepSeek-specific handling
(`provider-profile-transforms.ts`). DeepSeek is a built-in preset.

Kun's config accepts `baseUrl`/`apiKey`/`endpointFormat`/`model`, with
`endpointFormat=responses` in its enum. Kun v1 only consumes a BYO config path
and Locus never reads it, so `providerProfiles` is `degraded`. Provider profile
targets are `["claude","codex","helpers","local"]` — no `kun`. The gateway token
has no TTL/revoke; it lives for the gateway lifetime.

## Goals / Non-Goals

**Goals:**
- A Kun chat selects a Locus provider profile (DeepSeek included) → Locus
  synthesizes a Kun config pointing at the gateway `responses` endpoint with a
  scoped token → streamed answer; upstream key never leaves the main process.
- Per-run secret hygiene: the synthesized config and scoped token are revoked and
  deleted deterministically on completion/cancel/error.
- BYO config stays a supported fallback.

**Non-Goals:**
- Shell / sandbox posture inversion (separate change).
- Plan mode, bundling, non-desktop Kun.

## Decisions

- **Dedicated `kun` profile target, not `local` overload.** Add `"kun"` to
  `providerProfileTargets`. *Why:* UI profile filtering, gateway diagnostics
  (currently Claude/Codex-only at gateway.ts), and save semantics all branch on
  target; overloading `local` makes Kun profiles leak into unrelated surfaces and
  skips diagnostics. A dedicated target keeps filter/diagnostics/save consistent.
- **Synthesize, don't hand-write.** On profile bind, write an ephemeral Kun config
  (`baseUrl` = gateway responses endpoint, `apiKey` = scoped token,
  `endpointFormat=responses`, `model`) to an isolated `0o600` path under userData,
  pass via `--config`. The only secret in the file is the scoped gateway token —
  never the upstream key.
- **Deterministic token revoke + config cleanup (the safety core).** Wrap the run
  so a `finally` always (a) deletes the synthesized config file and (b) revokes
  the scoped token by removing it from the gateway token map; this runs on
  success, cancel, abort, and error. Add a TTL to gateway tokens so even a missed
  cleanup cannot authenticate indefinitely. *Alternative rejected:* rely on
  `0o600` + app-exit cleanup — leaves a valid token+config on disk for the whole
  session, usable by any local process that can read userData.
- **TTL must be per-run-safe — `getProviderGatewayEndpoint` is shared by
  Claude/Codex/Kun.** A naive global short TTL would break long Claude/Codex runs
  minting tokens from the same map. So per-run revoke (token tied to the run,
  removed on run end) is the PRIMARY mechanism; the TTL is a generous backstop
  sized longer than any realistic run, refreshed while a run is active, and MUST NOT
  shorten existing consumers' effective token lifetime. The change SHALL test that
  existing Claude/Codex gateway runs are unaffected.
- **Profile binding wins; BYO is the no-profile fallback.** No per-chat precedence
  ambiguity: if a profile is bound, Locus fully synthesizes and ignores any BYO
  path; if none is bound, Locus passes the user's BYO `--config` unchanged.
- **Gateway already translates dialects.** Kun uses `endpointFormat=responses` to
  the gateway; the gateway translates to DeepSeek `chat/completions`. The preflight
  proves this end to end before `providerProfiles` is claimed `supported`.

## Risks / Trade-offs

- **Scoped token persists on disk / in map.** → `finally` revoke + delete on every
  exit path; TTL on the token; redact the token from diagnostics/metadata; a test
  asserts the config is gone and the token is rejected after run end.
- **Gateway `responses`→DeepSeek translation not proven for Kun.** → preflight
  (a real streamed answer) gates `providerProfiles=supported`; otherwise stays
  `degraded` and BYO remains the path.
- **New `kun` target unhandled in diagnostics/UI.** → extend gateway diagnostics
  and profile filtering to the `kun` target; a test asserts a Kun-target profile
  is filtered/diagnosed like other targets.

## Migration Plan

Additive, flag-gated; no migration. Rollback = revert the target + synthesis; Kun
falls back to BYO config (already supported), `providerProfiles` stays `degraded`.

## Open Questions

- Does the gateway `responses` endpoint need any Kun-specific capability shim, or
  does Kun's `responses` request shape match what the gateway already accepts from
  other runtimes? (preflight answers)
- Token TTL value: a generous run-scoped backstop refreshed while active (the
  resolved approach), sized so no realistic Claude/Codex/Kun run expires mid-run —
  what concrete value, and does any existing consumer hold a token longer than that?
