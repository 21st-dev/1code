# Change: Gate Kun runtime behind a deliberate off-by-default Settings toggle

## Why

Kun is currently enabled purely by the `LOCUS_ENABLE_KUN_RUNTIME` environment
flag, which registers `kun` into the runtime registry and therefore auto-surfaces
it everywhere the UI follows the manifest (Engine list, Settings, provider-profile
target). Per the Kun author's authorization terms, Kun must NOT be openly exposed
or promoted — it must require a deliberate, off-by-default user action to enable,
so it does not divert traffic from DeepSeek-GUI. This is a product/licensing gate
specific to Kun. Qwen Code (open-source) is unaffected and stays as-is.

This is intentionally Kun-only — NOT a general experimental-runtime change. Only
Kun carries the "do not expose openly" constraint.

## What Changes

- **Kun enablement becomes a persisted, off-by-default Settings gate**, not the
  env flag. A new main-process owner persists `{ kunRuntimeEnabled: false }` under
  userData; the Kun-enabled resolver reads this setting as the product gate.
- **`LOCUS_ENABLE_KUN_RUNTIME` is demoted to a dev/test-only override**, decided by
  `app.isPackaged`: a packaged product build ignores env (gate = setting only); an
  unpackaged dev/test build honors env. This keeps the existing test suite and
  live-smoke harness (which set the env flag, unpackaged) working without exposing
  Kun in shipped builds. (Explicitly NOT `env || setting` as the product gate.)
- **The registry, the Kun tRPC routes, and Kun CLI-status consult a resolved
  Kun-enabled state injected from main** instead of reading env directly. `shared`
  stays a pure parser (gains an `allowEnvOverride` param, no userData read); the new
  main-process owner does the sync userData read and injects the resolved value
  through explicit runtime-feature options (not by spoofing env) — no shared/main
  boundary break, no sync→async churn.
- **Settings > Models gains an Experimental/Advanced area with an "Enable Kun
  runtime" toggle, OFF by default** — present but not promoted; the user must
  deliberately turn it on.
- **When OFF (default), Kun is completely absent:** not registered (so the Engine
  list omits it and the manifest excludes it), Settings shows only the toggle and
  hides the Kun CLI / shell-approve / managed-install blocks, the provider-profile
  editor offers no new `kun` target — at BOTH the target list AND preset
  application (the DeepSeek preset carries a `kun` target the editor copies on
  apply) — the main provider-profile save boundary rejects/filters new `kun`
  targets when disabled, and Kun chat / install / approve-shell / config tRPC fail
  closed.
- **Disabling stops in-flight Kun work:** turning the toggle off aborts active Kun
  streams and denies/clears pending Kun approvals, and the approval/respond route
  fails closed for a disabled runtime (today `respondToolApproval` is ungated). The
  toggle also invalidates the manifest / Kun-status / profile queries so the UI
  drops Kun immediately (the manifest query has a 60s `staleTime`).
- **State is preserved across toggling:** saved Kun executable path / config path /
  shell-approved hash and existing `kun`-target provider profiles are NOT deleted
  when the toggle is off; existing Kun profiles show a disabled chip rather than
  being silently removed on save. Turning the toggle back on restores usability.
- **Managed install stays off** (unchanged) — consistent with not openly
  distributing Kun.

## Capabilities

### Modified Capabilities
- `kun-runtime`: Kun registration is gated by a persisted off-by-default Settings
  toggle (the product gate) rather than the env flag; `LOCUS_ENABLE_KUN_RUNTIME`
  is a dev/test-only override; the Settings toggle is a deliberate,
  non-advertised opt-in; Kun is fully absent and its routes fail closed when off;
  saved Kun state and profiles are preserved across toggling.

## Impact

- Affected code:
  - new `src/main/lib/agent-runtime/runtime-feature-settings.ts` (persisted
    `kunRuntimeEnabled` in userData; resolver)
  - `src/main/lib/agent-runtime/runtime-registry.ts` and the Kun branch of the
    enablement resolver (read the setting, not env, as the product gate)
  - `src/main/lib/trpc/routers/agent-runtime.ts` (Kun routes + a new
    `getRuntimeFeatureSettings` / `setKunRuntimeEnabled` tRPC; fail closed when off)
  - `src/main/lib/kun/kun-cli-status.ts` (gate on the setting)
  - `src/main/lib/trpc/routers/provider-profiles.ts` and/or
    `src/main/lib/provider-profiles/storage.ts` (main-process save boundary blocks
    adding new `kun` targets when Kun is disabled while preserving existing ones)
  - `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
    (Experimental area + Kun toggle; hide Kun blocks when off)
  - `src/renderer/features/agents/components/provider-profile-editor.tsx` (no new
    `kun` target when off; disabled chip for existing kun profiles)
- Qwen Code and all other runtimes: unaffected.
- No backend runtime/protocol change; managed install unchanged (off).
