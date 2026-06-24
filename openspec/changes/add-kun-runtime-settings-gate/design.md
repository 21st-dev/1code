## Context

Kun enablement today flows through `shouldEnableKunRuntime(env)` (env
`LOCUS_ENABLE_KUN_RUNTIME`), invoked via the generalized
`shouldEnableExperimentalAgentRuntime(runtimeId, env)` used by
`runtime-registry.ts`, the Kun branches of `agent-runtime.ts`, and Kun CLI-status.
When enabled, `kun` enters the manifest and every manifest-following surface
(Engine list, Settings Kun blocks, provider-profile `kun` target) shows it. The
Kun author's authorization requires Kun NOT be openly exposed/promoted (no traffic
diversion from DeepSeek-GUI); the user chose a deliberate, off-by-default toggle in
an Experimental/Advanced Settings area.

## Goals / Non-Goals

**Goals:**
- Kun is absent by default and only appears after a deliberate, non-advertised
  Settings opt-in; turning it off hides Kun everywhere and fails its routes closed.
- Saved Kun state and existing `kun` profiles survive toggling.
- Existing tests/live-smoke (env-based) keep working without exposing Kun in the
  product.

**Non-Goals:**
- Touching Qwen Code or generalizing to all experimental runtimes — Qwen is
  open-source and intentionally NOT hidden; only Kun carries the constraint.
- Deleting Kun setup state; changing managed install (stays off); any backend
  runtime/protocol change.

## Decisions

- **Persisted Settings toggle is the sole product gate; env is dev/test-only.**
  A main-process owner persists `kunRuntimeEnabled` (default false) in userData.
  The Kun-enabled resolver returns the setting value as the product gate. *Crucial:
  this is NOT `env || setting` for the product UI* — a shipped build with a
  stray/default env must not expose Kun. **Resolver mode is decided by
  `app.isPackaged` in the main process:** packaged (product) ⇒ gate = the persisted
  setting ONLY, `LOCUS_ENABLE_KUN_RUNTIME` ignored; unpackaged (dev/test) ⇒ env is
  honored as an override. This covers both unit tests (Bun/Node, not packaged) and
  the live-smoke harness (unpackaged Electron with the env set), while a packaged
  build never honors env. *Alternative rejected:* `env || setting` — leaks Kun
  whenever env is present, including in a shipped build.
- **Keep `shared` pure; resolve in `main`, inject down (no boundary violation, no
  sync→async churn).** `shouldEnableKunRuntime` in `shared/agent-runtime-capabilities.ts`
  is a synchronous pure env check that `runtime-registry.ts` calls synchronously;
  it MUST NOT read userData. So: `shared` keeps only pure parsers/types and gains an
  explicit pure resolver such as `resolveKunRuntimeEnabled({ setting, env,
  isPackaged })` / `allowEnvOverride: boolean` (no Electron/userData deps). The new
  main-process `runtime-feature-settings.ts` does a sync `readFileSync` of the
  small settings JSON (cached), computes the resolved Kun-enabled boolean
  (`setting`, with env honored only when `allowEnvOverride = !app.isPackaged`), and
  injects that resolved value into the registry and Kun tRPC routes through an
  explicit option such as `runtimeFeatureSettings: { kunRuntimeEnabled }` or
  `enabledExperimentalRuntimes`. It MUST NOT encode the resolved state by setting
  or spoofing `LOCUS_ENABLE_KUN_RUNTIME` in an `env` object. `runtime-registry.ts`
  and the `agent-runtime.ts` Kun routes and Kun CLI-status consume the injected
  resolved state. Qwen's branch is untouched (stays env / open). *Alternatives
  rejected:* resolver reads userData directly — violates shared/main boundary or
  forces sync APIs async; resolved Kun state is passed through `env` — preserves
  the confusing product/dev gate that this change is removing.
- **Off = absent, not just hidden.** When the setting is off, Kun is not
  registered, so the manifest excludes it and the Engine selector (already
  manifest-driven) omits Kun with no extra renderer change. Settings shows only the
  toggle and hides the Kun CLI / shell-approve / managed-install blocks. Kun chat /
  install / approve-shell / config tRPC fail closed regardless of saved state or
  env.
- **No new `kun` target — at renderer paths AND the main save boundary.**
  `providerProfileTargets` statically includes `"kun"` and the DeepSeek preset's
  `targetRuntimes` includes `"kun"`, which the editor copies wholesale on apply
  (`setTargetRuntimes([...preset.targetRuntimes])`). So gating only the target
  button list is insufficient: when Kun is disabled, applying/creating a preset in
  the renderer MUST filter `kun` out of the resulting targets, and the main
  provider-profile save boundary (`providerProfiles.saveProfile` / storage service)
  MUST reject or sanitize attempts to add a new `kun` target via direct tRPC.
  Editing an EXISTING `kun` profile MUST preserve its `kun` target and render a
  disabled chip (not strip it).
- **Disabling Kun stops in-flight Kun work.** Chat checks the gate at start
  (`agent-runtime.ts:489`) but `respondToolApproval` (`:840`) does not, so a pending
  Kun approval could still resolve after disabling. So `setKunRuntimeEnabled(false)`
  MUST abort active Kun streams and deny/clear pending Kun approvals, AND the
  approval/respond route MUST fail closed when its pending entry belongs to a
  disabled runtime (belt-and-suspenders).
- **Toggle invalidates UI caches.** The Settings manifest query has a 60s
  `staleTime`, so a toggle must invalidate `agentRuntime.listManifests` /
  `getManifest` / `getKunCliStatus` and the provider preset/profile queries, and
  update the runtime-manifest atom, so the UI reflects enable/disable immediately
  rather than showing stale Kun for up to a minute.
- **Preserve state across toggling.** The toggle does not delete the persisted Kun
  executable path / config path / shell-approved hash, and saving a profile does
  not silently drop `targetRuntimes: ["kun"]`; existing kun profiles render a
  disabled chip while off. Re-enabling restores usability.
- **Toggle placement signals "deliberate, not promoted".** The toggle lives in an
  Experimental/Advanced sub-area of Settings > Models, off by default, with no
  promotional copy — a user must seek it out, matching the author's "user
  self-operation, not directly exposed" intent.

## Risks / Trade-offs

- **Env demotion breaks the regression net.** The test suite and live-smoke set
  `LOCUS_ENABLE_KUN_RUNTIME=1`. → Keep env as a dev/test override path so those
  keep enabling Kun; only the *product UI* gate ignores env. A test asserts a
  shipped-mode resolver ignores env and only the setting enables Kun, while a
  dev/test-mode resolver still honors env.
- **Stale enabled state leaks Kun.** → Default false; a shipped build with no
  setting and no honored env shows no Kun anywhere; a guard test asserts the
  default-off, env-ignored product behavior.
- **Hiding Settings blocks but leaving routes live.** → Routes fail closed on the
  setting, not on UI visibility; tests assert Kun chat/install/approve-shell/config
  are denied when off even if called directly.
- **Accidentally hiding Qwen.** → The change touches only the Kun resolver branch
  and Kun UI blocks; a test asserts Qwen enablement/exposure is unchanged.

## Migration Plan

Additive; the setting defaults false so shipped behavior becomes "Kun hidden until
opted in". Rollback = revert the resolver to env. Existing Kun users (env or saved
state) are not deleted; after this change they flip the Settings toggle once to
restore Kun. Tests/smoke migrate to the dev/test env-override path (or set the
setting directly via the owner).

## Open Questions

- (RESOLVED) dev/test override mechanism = `app.isPackaged` (packaged ignores env;
  unpackaged honors it). See the resolver-mode decision.
- Does the Experimental/Advanced area already exist in Settings > Models, or does
  this change introduce that sub-section (and should other experimental affordances
  later move under it)?
