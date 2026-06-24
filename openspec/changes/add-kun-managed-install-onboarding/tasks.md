# Tasks: Kun managed install onboarding

> Independent follow-up after provider gateway and guarded shell. Do not archive
> or modify those changes here. Shell/hardToolGuard must remain `degraded` until
> real Kun live smoke passes.

## 0. Pre-flight
- [x] 0.1 Branch from current local `main` after the provider and guarded-shell
      commits are merged.
- [x] 0.2 Confirm install source policy: managed install uses a main-process
      allowlist with pinned SHA-256; unsupported platforms remain guided BYO.

## 1. OpenSpec
- [x] 1.1 Add `add-kun-managed-install-onboarding` proposal, design, tasks, and
      `kun-runtime` spec delta.
- [x] 1.2 Validate with
      `openspec validate add-kun-managed-install-onboarding --strict --no-interactive`.

## 2. Main-process installer owner
- [ ] 2.1 Add `src/main/lib/kun/kun-managed-install.ts` as the only owner for
      installable build selection, download, checksum, safe extraction/copy,
      chmod, managed path resolution, and executable settings persistence.
- [ ] 2.2 Use only main-process allowlisted build metadata: version, platform,
      arch, asset URL, asset name, SHA-256, size, archive kind, executable path.
- [ ] 2.3 Install under `{userData}/runtimes/kun/<version>/...`; never install to
      `/usr/local/bin`, never mutate PATH or shell profile.
- [ ] 2.4 Download to an app-managed temporary path; verify SHA-256 before
      extraction/install; cleanup staging on success and failure.
- [ ] 2.5 Reject archive entries that escape staging/install roots; chmod final
      executable `0755`; save the executable path only after all checks pass.
- [ ] 2.6 Do not write a new shell-approved hash during managed install/update;
      preserve any previous approved hash only so a changed executable hash
      disables shell as a mismatch until explicit re-approval.

## 3. Runtime status and routes
- [ ] 3.1 Extend Kun setup status with renderer-safe managed-install state:
      unavailable/available/installed/update-available/installing/error as
      applicable, plus install path/version without secrets.
- [ ] 3.2 Add tRPC mutations for managed install/update with no renderer-provided
      URL/checksum/shell command input.
- [ ] 3.3 Existing BYO executable/config path routes remain available and
      unchanged.

## 4. Settings/onboarding UI
- [ ] 4.1 Add `Install Kun` / `Update Kun` controls only when an allowlisted build
      is available; show guided BYO when unavailable.
- [ ] 4.2 Distinguish Not installed, Installed but no config, Installed and config
      ready, Shell not approved, Shell approved, Update available, and Hash
      mismatch shell disabled.
- [ ] 4.3 Do not present installed as shell supported; keep the existing explicit
      shell approval action.

## 5. Tests
- [ ] 5.1 Renderer cannot inject download URL, checksum, archive path, shell
      command, or destination path into install/update routes.
- [ ] 5.2 Checksum mismatch fails closed, deletes staging, and leaves previous
      executable settings untouched.
- [ ] 5.3 Zip path traversal and absolute-path entries are rejected.
- [ ] 5.4 Successful install lands inside managed dir, chmods executable, and
      saves only the final managed executable path.
- [ ] 5.5 Updating to a different binary hash makes existing shell approval
      mismatch and keeps shell disabled until re-approval.
- [ ] 5.6 Settings/source guards prove installed/configured/shell states remain
      separate.

## 6. Validate
- [ ] 6.1 Targeted tests for managed install and Kun setup UI/status.
- [ ] 6.2 `openspec validate add-kun-managed-install-onboarding --strict --no-interactive`.
- [ ] 6.3 `bun run check`.
- [ ] 6.4 Commit this change independently.
