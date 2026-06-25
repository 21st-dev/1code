# Tasks: Gate Qwen Code runtime behind a Settings toggle

> Approval gate: create and validate this OpenSpec first. Do not start
> implementation until the proposal is reviewed and approved. This change is the
> smaller Settings runtime gate only; do not implement Qwen Provider
> Profile/gateway binding here.

## 0. Pre-flight
- [x] 0.1 Confirm branch starts from clean `main`.
- [x] 0.2 Inventory current Qwen gate readers:
      `shared/agent-runtime-capabilities.ts`, runtime registry, agent-runtime
      tRPC routes, Qwen CLI status/setup mutations, Settings, onboarding, and
      chat engine selectors.
- [x] 0.3 Confirm pending OpenSpecs do not already own this scope.

## 1. Runtime feature settings owner
- [x] 1.1 Extend `RuntimeFeatureSettings` with `qwenRuntimeEnabled: false` and
      preserve backward-compatible parsing of old settings files.
- [x] 1.2 Add a Qwen resolver where packaged product mode ignores
      `LOCUS_ENABLE_QWEN_CODE_RUNTIME`; unpackaged dev/test may honor the env
      override.
- [x] 1.3 Extend `AgentRuntimeRegistryOptions.runtimeFeatureSettings` with
      `qwenRuntimeEnabled?`, and add explicit `runtimeId === "qwen-code"`
      branches in both `includesExperimentalRuntimes` and
      `isRegisteredAgentRuntimeId`. The Settings toggle must drive registry and
      manifest visibility; do not leave Qwen falling through to env-only gating.
- [x] 1.4 Inject resolved `qwenRuntimeEnabled` into Qwen CLI status and Qwen
      chat/setup tRPC paths. Do not spoof env to pass the resolved setting.

## 2. tRPC and fail-closed behavior
- [x] 2.1 Add `agentRuntime.setQwenRuntimeEnabled({ enabled })` and include Qwen
      settings/resolved state in `getRuntimeFeatureSettings`.
- [x] 2.2 Qwen chat/start, `getQwenCliStatus`, executable path save/reset, and
      runtime manifest lookup consult the resolved Qwen setting.
- [x] 2.3 Turning Qwen off aborts active Qwen streams and denies/clears pending
      Qwen tool approvals; later approval responses for disabled Qwen fail
      closed.

## 3. Settings and renderer surfaces
- [x] 3.1 Add an off-by-default Qwen runtime toggle in Settings > Models near the
      existing Qwen CLI section / experimental runtime controls.
- [x] 3.2 When Qwen is off, show only the toggle and hide Qwen CLI setup
      controls, chat engine option, onboarding path, and manifest-driven Qwen
      surfaces.
- [x] 3.3 When Qwen is on, show the existing passive Qwen CLI setup guidance,
      executable path override, and setup-required engine state.
- [x] 3.4 Toggle mutation invalidates runtime manifests, Qwen CLI status, and
      onboarding/chat query state so UI updates immediately.

## 4. Preserve current boundaries
- [x] 4.1 Do not add `qwen-code` as a Provider Profile target.
- [x] 4.2 Do not add provider-profile/gateway binding, synthesized provider
      config, or credential routing for Qwen.
- [x] 4.3 Qwen CLI detection still does not count as onboarding completion.
- [x] 4.4 Saved Qwen executable path override survives toggling off/on.

## 5. Validate
- [x] 5.1 `openspec validate add-qwen-runtime-settings-gate --strict --no-interactive`.
- [x] 5.2 Targeted unit tests for runtime feature settings, registry gating, Qwen
      CLI setup guidance, and onboarding derived status.
- [x] 5.3 Runtime feature settings tests explicitly assert
      `resolveQwenCodeRuntimeEnabled` ignores
      `LOCUS_ENABLE_QWEN_CODE_RUNTIME=1` when `isPackaged: true`, and honors the
      env override when `isPackaged: false`.
- [x] 5.4 `bun run check`.
- [x] 5.5 Real Electron GUI smoke with isolated `LOCUS_USER_DATA_DIR`: default
      Qwen off, toggle on shows Qwen setup guidance, Qwen CLI detected does not
      complete onboarding, toggle off hides Qwen again.
      Evidence: `/tmp/locus-qwen-gate-smoke2.U2wdXA` with
      `LOCUS_DISABLE_SAFE_STORAGE=1`, fake `qwen 0.18.5-smoke`, screenshots
      under `/tmp/locus-qwen-smoke2-*.png`; Qwen off hidden by default, Qwen on
      showed localized setup guidance without completing onboarding, Settings
      toggle hid/restored Qwen CLI setup, and engine menu removed Qwen again
      when disabled.
