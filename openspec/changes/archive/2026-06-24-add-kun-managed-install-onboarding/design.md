## Context

The current Kun setup is BYO. `kun-cli-status.ts` resolves a saved absolute
executable path or safe PATH candidate, validates config readiness, and computes
the shell-approved executable hash. The guarded-shell change deliberately made
shell opt-in by user-blessed SHA-256: a new binary hash disables shell until the
user approves the current build again.

Kun release assets are large desktop archives and release metadata changes over
time. Managed install therefore cannot trust renderer input or a dynamic "latest"
URL. It must use a main-process allowlist/manifest with pinned version and
checksum. If the allowlist is absent or unsupported for a platform, Locus must
fall back to guided BYO and state that managed install is unavailable.

The current upstream `Kun-*.zip` release assets are Electron GUI application
bundles. The HTTP/SSE runtime Locus needs is the embedded
`kun/dist/cli/serve-entry.js` node-script, launched by the Kun app through its
Electron-as-Node runtime model. A GUI app binary path is not a verified direct
`kun serve` executable, so this change must not enable those release archives in
the production allowlist.

## Goals / Non-Goals

**Goals:**

- Main-process owned Kun install/update actions.
- App-managed install directory under userData.
- SHA-256 verification before installation.
- Archive path traversal protection.
- Automatic executable path persistence after a successful managed install.
- Installed/configured/shell-approved status remains distinct.

**Non-Goals:**

- No shell/hardToolGuard manifest `supported` flip.
- No live Kun smoke proof.
- No `/usr/local/bin`, PATH mutation, shell profile edits, or external package
  manager invocation.
- No renderer-provided URLs, checksums, install commands, or archive entry paths.

## Decisions

- **Installer owner:** `src/main/lib/kun/kun-managed-install.ts` owns build
  selection, URL/checksum allowlist, download, checksum verification, safe
  extraction/copy, chmod, managed install path, and settings persistence.
  tRPC routes are wrappers only.
- **Fixed allowlist, not renderer or dynamic latest:** the renderer can call
  `installKunManagedBuild` or `updateKunManagedBuild`; it cannot provide URL,
  checksum, asset name, shell command, or destination path. The selected build is
  determined in main process from platform/arch and the allowlist. The default
  production allowlist is intentionally empty until Locus supports a proven
  headless runtime asset or embedded-runtime launch descriptor.
- **Managed directory:** install under
  `{userData}/runtimes/kun/<version>/...`. Temporary downloads/extraction stay
  under `{userData}/runtimes/kun/.tmp/<operation-id>`.
- **Checksum before trust:** downloaded bytes must match the allowlisted SHA-256
  before extraction or executable persistence. A mismatch deletes staging data and
  leaves the previous executable setting untouched.
- **Archive safety:** zip extraction rejects absolute paths, `..`, backslashes
  that escape, symlink-like entries, and entries whose resolved destination is
  outside the staging directory. The installer also verifies the final executable
  is inside the managed install directory before saving it.
- **Install is not shell approval:** successful install may make `executable.ok`
  true and allow file-only/workspace-write runs. It does not write
  `shellApprovedExecutableHash`. If an update changes the executable hash, the
  existing shell approval mismatches and shell stays disabled until the user
  clicks the existing shell approval action.
- **Unsupported platforms fail closed:** if no allowlisted build matches the
  current platform/arch, Settings shows managed install unavailable and keeps BYO
  setup controls.
- **Current Kun GUI releases fail closed:** do not map
  `Kun.app/Contents/MacOS/Kun` to Locus' direct `spawn(executable, ["serve",
  ...])` launcher. A future follow-up must resolve the embedded runtime script
  and launch it with the correct Electron-as-Node model before production
  managed install is re-enabled.

## Risks / Trade-offs

- **Upstream asset drift:** mitigated by pinning SHA-256. Updating Kun requires a
  code change to the allowlist and launch descriptor.
- **Archive traversal:** mitigated by strict path checks and tests.
- **Renderer injection:** mitigated by zero route inputs for install/update target
  selection and source guards.
- **False readiness:** mitigated by keeping installed, config-ready, shell
  approved, update-available, and hash-mismatch states separate.

## Open Questions

- Which Kun asset should be enabled in the production allowlist first? Resolved
  for this change: none. Current upstream release archives are GUI app bundles,
  not proven direct headless runtime assets. A follow-up must implement embedded
  `serve-entry.js` launch and live smoke before enabling a production allowlist
  entry.
