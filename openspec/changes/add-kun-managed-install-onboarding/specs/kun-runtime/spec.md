# Spec Delta: kun-runtime

## ADDED Requirements

### Requirement: Main-process Kun managed install

The system SHALL provide an optional managed Kun installation path owned by the
main process. Installable builds SHALL be selected only from main-process
allowlisted metadata that includes version, platform, architecture, asset URL,
asset name, SHA-256 digest, asset size, archive kind, and the expected executable
path inside the installed asset. Renderer code SHALL NOT provide download URLs,
checksums, shell commands, archive entry paths, executable paths, destination
paths, or package-manager commands for managed install/update. When no
allowlisted build exists for the current platform and architecture, managed
install SHALL be unavailable and the BYO setup path SHALL remain available.
Allowlisted builds SHALL identify a verified headless Kun runtime launch target.
Published GUI application archives SHALL NOT be allowlisted as direct runtime
executables unless Locus also owns the embedded runtime launch descriptor and has
live-smoke evidence that the installed asset emits the expected `KUN_READY`
handshake.

The installer SHALL download to an app-managed temporary directory, verify the
downloaded bytes against the allowlisted SHA-256 before extraction or
installation, reject checksum mismatches fail-closed, reject archive entries that
escape the staging/install directory, install only under
`{userData}/runtimes/kun/<version>/`, chmod the final executable `0755`, and save
the executable path through the existing Kun executable settings owner only after
all checks pass. It SHALL NOT install into `/usr/local/bin`, mutate PATH, mutate
shell profiles, or trust project/worktree files.

#### Scenario: Renderer cannot choose the install source
- **WHEN** the renderer requests Kun managed install or update
- **THEN** the request does not accept a URL, checksum, command, archive path, or
  destination path
- **AND** the main process selects the build only from its allowlist

#### Scenario: GUI app release archive is not a direct runtime executable
- **WHEN** the only known upstream release asset for the current platform is an
  Electron GUI app archive without a verified embedded-runtime launch descriptor
- **THEN** managed install remains unavailable
- **AND** Settings keeps guided BYO setup instead of offering `Install Kun`

#### Scenario: Checksum mismatch fails closed
- **WHEN** a downloaded Kun asset does not match the allowlisted SHA-256
- **THEN** Locus deletes staging data, does not extract or persist the executable
  path, and returns a renderer-safe error
- **AND** the previously active Kun executable setting remains unchanged

#### Scenario: Archive traversal is rejected
- **WHEN** a Kun archive contains an absolute path, `..` escape, or any entry
  whose resolved destination leaves the staging/install root
- **THEN** Locus rejects the install before saving an executable path

#### Scenario: Successful install stays app-managed
- **WHEN** a Kun managed install succeeds
- **THEN** the executable is located under `{userData}/runtimes/kun/<version>/`
- **AND** it is executable
- **AND** Locus persists that managed executable path for later Kun status checks

### Requirement: Managed install does not grant shell

A successful Kun managed install SHALL only mean that a verified executable is
available for normal Kun startup. It SHALL NOT approve `danger-full-access`
shell, SHALL NOT write a new `shellApprovedExecutableHash` for the installed
binary, and SHALL NOT make `hardToolGuard` or shell appear supported. Preserving
an existing approved hash is allowed only so the current executable hash can be
compared against it and fail closed on mismatch. Shell availability SHALL
continue to depend on the existing explicit "Approve current Kun build for
shell" action that stores the current executable SHA-256. When a managed update
changes the executable hash, shell SHALL automatically become hash-mismatched or
unapproved until the user explicitly re-approves the new build.

#### Scenario: Install leaves shell unapproved
- **WHEN** Kun is installed through the managed installer
- **THEN** Kun executable status may become available
- **AND** shell remains unapproved unless the user separately approves the
  current executable hash

#### Scenario: Update disables previous shell approval
- **WHEN** a managed update replaces the Kun executable with a different SHA-256
- **THEN** the existing shell-approved hash no longer matches
- **AND** Kun shell is disabled/degraded for the current run until explicit
  re-approval

### Requirement: Kun setup state distinguishes install, config, and shell

The system SHALL expose renderer-safe Kun setup state that distinguishes at least
these states: managed install unavailable, not installed, installed but no config,
installed and config ready, shell not approved, shell approved, update available,
and hash mismatch with shell disabled. Settings and onboarding surfaces SHALL NOT
collapse "installed" into "configured", "configured" into "connected", or
"installed/configured" into shell support.

#### Scenario: Settings shows honest install and shell state
- **WHEN** Kun is installed but no config path or provider profile is ready
- **THEN** Settings shows installed but setup-required for config
- **AND** it does not enable a runnable Kun chat as fully ready

#### Scenario: Settings shows hash mismatch separately
- **WHEN** the current executable hash differs from the shell-approved hash
- **THEN** Settings shows shell disabled because of hash mismatch
- **AND** it offers explicit shell re-approval rather than silently enabling shell

## MODIFIED Requirements

### Requirement: BYO Kun executable resolution

The system SHALL resolve the Kun executable from either an app-managed,
checksum-verified install path or a bring-your-own absolute executable path.
Managed installs SHALL be written only by the main-process Kun installer owner.
BYO resolution SHALL continue to accept persisted absolute path overrides stored
with restricted permissions, SHALL exclude the working directory and
project/repo directories from executable PATH discovery, and SHALL probe the
binary without a shell. Current Kun builds that do not expose `--version` MAY be
accepted only after a bounded `help` probe succeeds. When either Kun executable
or config file is unavailable, the system SHALL block the run and surface setup
guidance. If no allowlisted managed build exists for the current platform, Locus
SHALL provide guided BYO setup instead of claiming secure managed install.
Current upstream GUI release archives SHALL count as no allowlisted managed build
until their embedded HTTP/SSE runtime entry can be launched by Locus and verified
with a real `KUN_READY` smoke.

#### Scenario: Missing Kun blocks with guidance
- **WHEN** no managed or BYO Kun executable resolves
- **THEN** Locus blocks the Kun run before spawning and surfaces setup guidance
- **AND** managed install is offered only when a current-platform allowlisted
  build exists

#### Scenario: Missing Kun config blocks with guidance
- **WHEN** no absolute Kun config file path resolves and no provider profile is
  bound for synthesis
- **THEN** Locus blocks the Kun run before spawning and surfaces config/provider
  setup guidance
- **AND** it does not infer provider credentials from renderer state, project
  files, or unverified runtime payloads

#### Scenario: Discovery excludes shadowing paths
- **WHEN** Locus discovers the Kun executable on PATH
- **THEN** it excludes the working directory and project/repo directories so a
  `./kun` cannot shadow the trusted binary
- **AND** it probes the resolved binary without a shell
