## Context

Qwen Code is an experimental desktop runtime. Current runtime registration uses
`LOCUS_ENABLE_QWEN_CODE_RUNTIME`, while Kun now uses the main-process
`runtime-feature-settings.ts` owner with a persisted Settings gate and a
dev/test-only env override.

Qwen already has passive Settings guidance for CLI installation, `/auth`, docs,
and executable path override. That guidance is not provider binding: Qwen still
owns its own CLI auth/model/provider configuration.

## Goals

- Make Qwen runtime exposure deliberate and visible in Settings.
- Reuse the existing runtime-feature settings owner instead of adding a second
  settings file or renderer-only switch.
- Keep product behavior off by default.
- Preserve dev/test smoke ergonomics through an explicit env override outside
  product gating.
- Keep Qwen setup guidance passive and localized.

## Non-Goals

- Do not add Qwen to Provider Profile targets.
- Do not synthesize provider config for Qwen.
- Do not route Qwen through the Locus responses/provider gateway.
- Do not read or write Qwen credentials, API keys, or `~/.qwen` config.
- Do not silently mark Qwen as onboarding-ready from CLI detection.

## Decisions

- Extend `RuntimeFeatureSettings` with `qwenRuntimeEnabled: boolean`, default
  `false`.
- Add `resolveQwenCodeRuntimeEnabled({ setting, env, isPackaged })` beside the
  Kun resolver. In packaged product mode, only the setting enables Qwen. In
  unpackaged dev/test mode, either the setting or `LOCUS_ENABLE_QWEN_CODE_RUNTIME`
  can enable Qwen.
- Pass resolved runtime-feature settings into `runtime-registry.ts` for both Qwen
  and Kun rather than spoofing env values.
- Add `setQwenRuntimeEnabled({ enabled })` to the agent-runtime tRPC router.
  Disabling Qwen aborts active Qwen streams and denies/clears pending Qwen tool
  approvals, mirroring the fail-closed Kun behavior.
- Settings > Models shows an experimental/advanced Qwen toggle. The existing
  Qwen CLI section stays hidden until the resolved Qwen runtime is enabled.
- Direct Qwen setup mutations (`updateQwenExecutablePath`,
  `resetQwenExecutablePath`) and Qwen chat fail closed when the resolved Qwen
  runtime is disabled.

## Risks / Trade-offs

- Existing dev tests that rely on `LOCUS_ENABLE_QWEN_CODE_RUNTIME=1` must pass
  through the dev/test override path. Mitigation: resolver tests cover packaged
  versus unpackaged mode.
- Users with a saved Qwen executable override might not see the Qwen CLI section
  until they enable the toggle. Mitigation: preserve the override and expose the
  toggle in Settings.
- Qwen CLI detected is still not proof of `/auth` or successful run. Mitigation:
  onboarding status remains setup guidance only and never counts Qwen as a usable
  onboarding completion path.

## Migration Plan

- Existing settings files without `qwenRuntimeEnabled` parse as `false`.
- Existing Qwen executable path override stays in its current storage and is not
  deleted when Qwen is disabled.
- `LOCUS_ENABLE_QWEN_CODE_RUNTIME` remains accepted for tests and smoke runs in
  unpackaged/dev mode only.
