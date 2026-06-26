## MODIFIED Requirements

### Requirement: Qwen CLI Availability Status

The system SHALL expose renderer-safe Qwen Code CLI availability status from the
main process when the resolved Qwen runtime setting is enabled. The status SHALL
distinguish missing executable, invalid executable path, non-executable path,
version probe failure, and available executable without exposing raw environment
variables, provider credentials, API keys, or Qwen settings contents. When the
resolved Qwen runtime setting is disabled, Qwen CLI status and setup mutations
SHALL fail closed or remain hidden instead of probing or mutating Qwen setup.

#### Scenario: Qwen runtime is disabled
- **WHEN** the resolved Qwen runtime setting is off
- **THEN** Settings hides the Qwen CLI setup controls behind the off-by-default
  Qwen runtime toggle
- **AND** direct Qwen CLI status/setup calls fail closed or return a disabled
  setup diagnostic without probing `PATH` or spawning Qwen
- **AND** no provider work or ACP process spawn is attempted

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

## ADDED Requirements

### Requirement: Qwen Runtime Toggle in Settings

The system SHALL expose an off-by-default Qwen runtime toggle in Settings >
Models. The toggle SHALL persist through the main-process runtime-feature
settings owner, update manifest/onboarding/chat surfaces immediately, and reveal
the existing passive Qwen CLI setup guidance only when enabled.

#### Scenario: Settings opens with Qwen disabled
- **WHEN** the user opens Settings > Models with Qwen disabled
- **THEN** Settings shows the Qwen runtime toggle off
- **AND** it does not show the Qwen CLI status, install command, docs link, or
  executable path override controls

#### Scenario: User enables Qwen
- **WHEN** the user turns the Qwen runtime toggle on
- **THEN** Settings persists the enabled value
- **AND** runtime manifests, onboarding, and chat engine surfaces update without
  waiting for stale manifest cache expiry
- **AND** the existing passive Qwen CLI setup guidance becomes visible

#### Scenario: User disables Qwen
- **WHEN** the user turns the Qwen runtime toggle off
- **THEN** Settings persists the disabled value
- **AND** Qwen disappears from manifests, onboarding, and chat engine surfaces
- **AND** any saved Qwen executable path override remains stored for a future
  re-enable
