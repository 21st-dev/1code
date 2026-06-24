# Change: Kun managed install onboarding

## Why

Kun currently requires a bring-your-own executable path. That is honest but
rough: users must discover, download, place, chmod, and point Locus at the
binary manually. Locus can improve onboarding by managing a verified Kun install
inside app-owned storage, while preserving the separate shell hash approval gate.

Depends on the already-implemented Kun runtime, provider gateway, and guarded
shell changes. This change is independent from flipping shell/hardToolGuard to
`supported`; live smoke remains a separate follow-up.

## What Changes

- Add a main-process Kun managed installer owner under `src/main/lib/kun/`.
- The installer resolves installable Kun builds only from an in-process
  allowlist/manifest with version, platform, asset URL, SHA-256, size, archive
  kind, and executable path. Renderer inputs can request install/update but cannot
  provide URLs, shell commands, checksums, or archive paths.
- Download assets into a temporary app-managed staging path, verify SHA-256 before
  extraction/installation, reject checksum mismatches fail-closed, reject archive
  path traversal, chmod the resolved executable `0755`, install under
  `{userData}/runtimes/kun/<version>/...`, and persist the executable path through
  the existing Kun CLI settings owner.
- Settings/onboarding distinguishes install readiness from config readiness and
  shell readiness: managed install can make Kun executable available for
  file-only/workspace-write runs, but `danger-full-access` shell still requires
  the existing explicit "Approve current Kun build for shell" action.
- If no allowlisted build exists for the current platform, managed install is
  unavailable and Locus keeps the current guided BYO path without claiming secure
  managed install.

## Capabilities

### Modified Capabilities

- `kun-runtime`: changes executable resolution from BYO-only to BYO plus
  allowlisted, checksum-verified, app-managed install; setup state remains honest
  about config and shell approval.

## Impact

- Affected code:
  - `src/main/lib/kun/kun-managed-install.ts` (new installer owner)
  - `src/main/lib/kun/kun-cli-status.ts` / settings integration
  - `src/main/lib/trpc/routers/agent-runtime.ts` (install/update route wrappers)
  - `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  - tests for checksum, renderer URL injection, path traversal, managed dir, and
    shell hash mismatch after update
- Out of scope:
  - Shell/hardToolGuard `supported` flip
  - Real Kun live smoke
  - Installing into `/usr/local/bin` or mutating shell profiles
  - Renderer-provided download URLs or shell install commands
