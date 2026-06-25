# Tasks: Gate Kun behind an off-by-default Settings toggle

> Approval gate: do not start until approved. Kun-only — do NOT touch Qwen or
> generalize. Do NOT fold in the unrelated untracked `add-model-aware-image-gating`
> change. Hard line: a product build with the setting off shows no Kun anywhere,
> even if `LOCUS_ENABLE_KUN_RUNTIME` is set.

## 0. Pre-flight
- [x] 0.1 Branch off clean `main`.
- [x] 0.2 Inventory every Kun enablement read path (resolver, registry,
      `agent-runtime.ts` Kun routes, kun-cli-status) and every Kun UI surface
      (Engine list via manifest, Settings Kun blocks, provider-profile `kun`
      target).

## 1. Persisted setting owner + resolver (keep `shared` pure)
- [x] 1.1 New main-process `src/main/lib/agent-runtime/runtime-feature-settings.ts`:
      persist `{ kunRuntimeEnabled: false }` in userData (`0o600`); sync
      `readFileSync` (cached) so no sync→async churn. `shared/agent-runtime-capabilities.ts`
      stays pure: add `resolveKunRuntimeEnabled({ setting, env, isPackaged })` or
      an explicit `allowEnvOverride: boolean` param, NO userData read.
- [x] 1.2 Resolver mode = `app.isPackaged`: packaged (product) ⇒ gate = persisted
      setting ONLY, `LOCUS_ENABLE_KUN_RUNTIME` ignored; unpackaged (dev/test) ⇒ env
      honored. NEVER `env || setting` for product gating. Main computes the resolved
      Kun-enabled bool (`allowEnvOverride = !app.isPackaged`).
- [x] 1.3 Inject the resolved state from main into the registry through an explicit
      option such as `runtimeFeatureSettings: { kunRuntimeEnabled }` or
      `enabledExperimentalRuntimes`, plus the `agent-runtime.ts` Kun routes and
      `kun-cli-status.ts` — do NOT pass resolved product state by spoofing
      `LOCUS_ENABLE_KUN_RUNTIME` in `env`, and do NOT make the shared resolver read
      userData. Leave Qwen's branch on env (unchanged).
- [x] 1.4 Test: in product mode the resolver ignores `LOCUS_ENABLE_KUN_RUNTIME=1`
      (Kun stays hidden); in dev/test mode env still enables Kun (keeps the existing
      env-based tests + live-smoke harness working).

## 2. tRPC
- [x] 2.1 Add `agentRuntime.getRuntimeFeatureSettings` and
      `agentRuntime.setKunRuntimeEnabled({ enabled })`.
- [x] 2.2 Kun chat / install / approve-shell / config tRPC fail closed when the
      setting is off, regardless of saved state or env.
- [x] 2.3 On `setKunRuntimeEnabled(false)`: abort active Kun streams and deny/clear
      pending Kun tool approvals. `respondToolApproval` (`agent-runtime.ts:840`,
      currently ungated) must fail closed when its pending entry belongs to a
      disabled runtime — a pending Kun approval cannot resolve after disabling.

## 3. Settings UI
- [x] 3.1 Add an experimental/advanced area in Settings > Models with an
      off-by-default "Enable Kun runtime" toggle (no promotional copy).
- [x] 3.2 When off, show only the toggle; hide the Kun CLI / shell-approve /
      managed-install blocks. When on, surface them.
- [x] 3.3 The toggle mutation invalidates `agentRuntime.listManifests` /
      `getManifest` / `getKunCliStatus` and the provider preset/profile queries, and
      updates the runtime-manifest atom — so the UI reflects enable/disable
      immediately (the manifest query `staleTime` is 60s).

## 4. Provider-profile + state preservation
- [x] 4.1 Filter `kun` out of profile targets at BOTH paths when disabled: the
      target button list AND preset application (`presets.ts` DeepSeek preset
      carries `kun`; editor copies `setTargetRuntimes([...preset.targetRuntimes])`
      at `provider-profile-editor.tsx:222`). Existing `kun`-target profiles render a
      disabled chip and are NOT silently stripped on save.
- [x] 4.2 Enforce the same rule at the main save boundary
      (`providerProfiles.saveProfile` in `src/main/lib/trpc/routers/provider-profiles.ts`
      and/or `src/main/lib/provider-profiles/storage.ts`): with Kun disabled, direct
      tRPC callers cannot add a new `kun` target, while edits to an existing
      `kun`-target profile preserve that existing target.
- [x] 4.3 Disabling Kun does not delete the saved executable path / config path /
      shell-approved hash; re-enabling restores usability.

## 5. Acceptance (hard lines)
- [x] 5.1 Product build, setting off (default): Kun absent from Engine list,
      manifest, Settings (only toggle), and profile targets — even with
      `LOCUS_ENABLE_KUN_RUNTIME=1` set.
- [x] 5.2 Kun chat/install/approve-shell/config fail closed when off (called
      directly).
- [x] 5.3 Toggle on → Kun surfaces and works (BYO); toggle off → hidden but saved
      state + profiles preserved; toggle back on → usable from preserved state.
- [x] 5.4 Qwen enablement/exposure unchanged; dev/test env path still enables Kun
      for the existing tests and smoke harness.
- [x] 5.5 Disabling Kun during a pending Kun approval aborts the stream + denies the
      pending approval; a later `respondToolApproval` for it fails closed.
- [x] 5.6 Applying a `kun`-bearing preset while disabled produces a profile without
      a `kun` target; direct provider-profile save cannot add `kun` while disabled;
      editing an existing `kun` profile preserves it (disabled chip).
- [x] 5.7 Toggling off invalidates the manifest/Kun-status queries so the UI drops
      Kun immediately (no 60s stale window).

## 6. Validate
- [x] 6.1 `openspec validate add-kun-runtime-settings-gate --strict --no-interactive`.
- [x] 6.2 `bun run check` green (tests that set the env flag still enable Kun via
      the dev/test path).
- [x] 6.3 Real Electron GUI smoke with a clean `LOCUS_USER_DATA_DIR`: Kun Settings
      gate off/on/off, onboarding Chinese/Qwen setup guidance, and Qwen not counted
      as onboarding completion. See `electron-gui-smoke-2026-06-25.md`.
