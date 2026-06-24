# Spec Delta: kun-runtime

## MODIFIED Requirements

### Requirement: Flag-gated Kun runtime registration

The system SHALL register `kun` as a desktop runtime only when a persisted,
off-by-default Kun-enabled Settings value is on. That persisted setting SHALL be
the sole product enablement gate. `LOCUS_ENABLE_KUN_RUNTIME` SHALL NOT enable Kun
in the product UI; it MAY be honored only as a local dev/test override (so
env-based tests and smoke harnesses still enable Kun on a developer machine), and
SHALL never be the product gate (no `env OR setting` product semantics). `kun`
SHALL remain a member of the experimental runtime set and SHALL NOT enter the
non-desktop contract runtime set. Qwen Code and other runtimes' enablement SHALL be
unaffected by this change.

#### Scenario: Default off hides Kun in the product
- **WHEN** the persisted Kun-enabled setting is off (the default) in a packaged
  product build
- **THEN** the runtime registry, capability manifest, and desktop admission do not
  expose or admit `kun`
- **AND** Kun is absent even if `LOCUS_ENABLE_KUN_RUNTIME` is set in the product
  environment
- **AND** Claude Code, Codex, and Qwen behavior is unchanged

#### Scenario: Setting on admits Kun on desktop only
- **WHEN** the persisted Kun-enabled setting is on
- **THEN** the desktop factory admits `kun:kun-http-sse` and the `kun` manifest is
  visible to desktop callers
- **AND** non-desktop contract surfaces still reject `kun`

#### Scenario: Env is a dev/test-only override
- **WHEN** Kun is enabled via `LOCUS_ENABLE_KUN_RUNTIME` for local dev/test
- **THEN** the override is honored only outside product gating (e.g. a dev/test
  path), not as the product UI enablement gate

## ADDED Requirements

### Requirement: Kun enablement is a deliberate, non-advertised Settings toggle

The system SHALL expose Kun enablement as an off-by-default toggle in an
experimental/advanced area of Settings, without promotional surfacing, so enabling
Kun requires a deliberate user action. A new main-process owner SHALL persist the
Kun-enabled value under userData, and tRPC SHALL expose reading the runtime feature
settings and setting the Kun-enabled value.

#### Scenario: Kun toggle is present but not promoted
- **WHEN** the user opens Settings with Kun disabled
- **THEN** an experimental/advanced area shows an off-by-default Enable Kun toggle
  and no other Kun blocks (CLI, shell approval, managed install)
- **AND** turning the toggle on persists the setting and surfaces Kun

#### Scenario: Setting the Kun-enabled value persists across restarts
- **WHEN** the user enables or disables Kun via the toggle
- **THEN** the value is persisted by the main-process owner and applies on the next
  launch

#### Scenario: Toggling Kun updates the UI immediately
- **WHEN** the user toggles Kun on or off
- **THEN** the runtime manifest and Kun-status queries are invalidated and the
  runtime-manifest state is updated so the UI reflects the change immediately
- **AND** the UI does not keep showing a stale Kun presence after disabling

### Requirement: Kun is absent and fails closed when disabled

When the Kun-enabled setting is off, the system SHALL keep Kun absent from the
Engine list and manifest, SHALL NOT offer or accept a new `kun` provider-profile
target at either the renderer editor or main save boundary, and SHALL fail closed
on Kun chat, install, shell-approval, and config tRPC regardless of saved Kun
state or environment.

#### Scenario: Kun routes fail closed when disabled
- **WHEN** Kun is disabled and a Kun chat, install, shell-approval, or config tRPC
  is invoked directly
- **THEN** the call fails closed and does not start, install, approve, or
  reconfigure Kun

#### Scenario: No new Kun provider-profile target when disabled
- **WHEN** Kun is disabled and the user creates or applies a provider-profile
  preset whose targets include `kun`
- **THEN** the `kun` target is filtered out of the resulting profile targets, not
  just hidden from the target button list
- **AND** a direct provider-profile save request cannot add a new `kun` target
  while Kun is disabled
- **AND** editing an existing `kun`-target profile preserves its existing `kun`
  target and renders a disabled chip rather than stripping it

### Requirement: Disabling Kun stops in-flight Kun work

Disabling Kun SHALL stop in-flight Kun work, not only block new runs. The system
SHALL abort active Kun streams and deny or clear pending Kun tool approvals when
Kun is disabled, and the approval/respond route SHALL fail closed when its pending
entry belongs to a disabled runtime, so a pending Kun approval cannot resolve after
Kun is turned off.

#### Scenario: Disabling Kun during a pending approval
- **WHEN** Kun is disabled while a Kun run has an active stream or a pending tool
  approval
- **THEN** the active Kun stream is aborted and the pending Kun approval is
  denied/cleared
- **AND** a later attempt to respond to that Kun approval fails closed rather than
  resolving it

### Requirement: Kun setup state survives toggling

Disabling Kun SHALL NOT delete the persisted Kun executable path, config path, or
shell-approved hash, and SHALL NOT silently drop `targetRuntimes: ["kun"]` from
existing provider profiles. Existing Kun profiles SHALL render a disabled state
rather than being removed, and re-enabling Kun SHALL restore usability from the
preserved state.

#### Scenario: Disabling preserves saved Kun state
- **WHEN** the user disables Kun after configuring an executable, config, or
  shell-approved hash
- **THEN** that saved state is preserved and existing `kun`-target profiles are not
  deleted
- **AND** re-enabling Kun restores usability without re-entering the saved state

#### Scenario: Existing Kun profile shows disabled, not deleted
- **WHEN** Kun is disabled and a profile with `targetRuntimes: ["kun"]` is saved
- **THEN** the profile keeps its `kun` target and renders a disabled chip rather
  than having the target silently removed
