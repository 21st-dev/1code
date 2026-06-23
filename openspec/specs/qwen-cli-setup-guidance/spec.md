# qwen-cli-setup-guidance Specification

## Purpose
TBD - created by archiving change add-qwen-cli-setup-guidance. Update Purpose after archive.
## Requirements
### Requirement: Qwen CLI Availability Status

The system SHALL expose renderer-safe Qwen Code CLI availability status from the
main process when the Qwen runtime flag is enabled. The status SHALL distinguish
missing executable, invalid executable path, non-executable path, version probe
failure, and available executable without exposing raw environment variables,
provider credentials, API keys, or Qwen settings contents.

#### Scenario: Qwen CLI is missing
- **WHEN** Qwen runtime surfaces are enabled and the main process cannot resolve
  a `qwen` executable
- **THEN** the renderer receives a Qwen CLI status with `ok: false`
- **AND** the status identifies the blocker as missing CLI
- **AND** the status includes a remediation hint to install Qwen Code CLI and
  authenticate it with `/auth`
- **AND** no provider work or ACP process spawn is attempted

#### Scenario: Qwen CLI is available
- **WHEN** the main process resolves an executable Qwen CLI path
- **THEN** the renderer receives `ok: true`, the runtime label, and a bounded
  version string when available
- **AND** any stderr/stdout captured during probing is redacted and bounded

### Requirement: Qwen Executable Path Override

The system SHALL let the user provide an explicit Qwen executable path to fix
desktop app `PATH` differences. The override SHALL be validated in the main
process before saving and SHALL be used for Qwen ACP startup only when valid.
The override SHALL be accepted only from a local Settings action and SHALL NOT be
accepted from Local Job API inputs, ACP/protocol messages, deep links, project or
worktree configuration, imported files, or unverified renderer runtime payloads.
The override SHALL be an absolute local file path.

#### Scenario: User saves a valid path
- **WHEN** the user saves a path to an executable Qwen CLI
- **THEN** Locus persists the path as non-secret local configuration
- **AND** subsequent Qwen status checks and Qwen ACP startup use that path before
  PATH auto-detection

#### Scenario: Non-Settings source attempts to set executable path
- **WHEN** a Local Job API request, ACP/protocol message, deep link, project
  configuration file, imported file, or runtime request payload includes a Qwen
  executable path
- **THEN** Locus ignores or rejects that path before persistence or spawn
- **AND** the active Qwen executable configuration remains unchanged

#### Scenario: User saves an invalid path
- **WHEN** the user provides a relative, missing, directory, shell command
  string, or non-executable path
- **THEN** Locus rejects the update with a renderer-safe message
- **AND** the previous active path remains unchanged
- **AND** no process is spawned from the invalid path

#### Scenario: User resets the override
- **WHEN** the user resets Qwen executable configuration
- **THEN** Locus removes the override and returns to PATH auto-detection

### Requirement: Safe Qwen PATH Discovery And Spawn

The system SHALL discover and spawn Qwen CLI without allowing workspace-controlled
executables or shell command injection. PATH discovery SHALL NOT select
executables from the active project cwd, repository directories, empty PATH
entries, or `.`. Qwen ACP startup SHALL spawn the resolved executable directly as
a single path with fixed args `["--acp"]`, no shell, no command-string parsing,
and no user-configurable ACP args.

#### Scenario: Repository contains a qwen executable
- **WHEN** a selected project or worktree contains `./qwen`
- **AND** Qwen auto-detection runs for that project
- **THEN** Locus does not select the repository-local executable
- **AND** Qwen remains unavailable unless an allowed system/user install path or
  valid Settings override exists

#### Scenario: Override contains shell syntax
- **WHEN** a user or untrusted input provides a value such as
  `qwen --acp`, `qwen; rm -rf /`, or another command string
- **THEN** Locus rejects the value as an executable path
- **AND** startup never invokes a shell or splits that string into command
  arguments

### Requirement: Passive Qwen Setup Guidance

The system SHALL provide passive setup guidance for BYO Qwen Code CLI. Guidance
MAY show install commands and documentation links, but SHALL NOT execute install
commands, download Qwen binaries, mutate Qwen auth files, or write to the user's
real `~/.qwen` configuration.

#### Scenario: User opens Qwen setup guidance
- **WHEN** Qwen runtime surfaces are enabled and the user opens setup guidance
- **THEN** the UI explains that Qwen Code requires a local CLI installation
- **AND** shows passive install/auth steps such as installing Qwen Code, running
  `qwen`, and using `/auth`
- **AND** offers an executable path override field for already installed CLIs
- **AND** does not execute shell commands or write Qwen configuration

### Requirement: Qwen Runtime Start Is Blocked Until CLI Is Available

The system SHALL block Qwen ACP startup before provider/runtime work when Qwen
CLI status is unavailable or invalid. The block SHALL produce a renderer-safe
runtime/capability diagnostic instead of a late spawn failure.

#### Scenario: User starts Qwen while CLI is unavailable
- **WHEN** a Qwen chat run is requested and Qwen CLI status is missing or invalid
- **THEN** the run is blocked before spawning `qwen --acp`
- **AND** the renderer receives a clear setup diagnostic
- **AND** no provider credentials, raw env, or Qwen config contents are emitted

#### Scenario: Qwen option appears in chat selection
- **WHEN** Qwen runtime surfaces are enabled but the CLI is unavailable
- **THEN** the Qwen option is disabled or clearly marked as setup-required
- **AND** the user can navigate to setup guidance instead of starting a broken run

