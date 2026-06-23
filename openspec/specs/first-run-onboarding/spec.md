# first-run-onboarding Specification

## Purpose
TBD - created by archiving change refactor-first-run-onboarding. Update Purpose after archive.
## Requirements
### Requirement: Unified First-Run Setup Surface

The system SHALL present first-run onboarding as a unified setup surface that
shows AI path selection, runtime/credential readiness, and project or Quick chat
entry without hiding those concerns behind separate full-screen route gates.

#### Scenario: Clean first run opens setup

- **WHEN** the app starts without a configured AI path
- **THEN** onboarding shows available Claude Code, Codex, Anthropic API key, and
  custom/local Claude-compatible setup paths in one setup surface
- **AND** the surface shows runtime, credential, and project status as separate
  concerns
- **AND** the user can switch paths without losing already detected status

#### Scenario: Existing setup is detected

- **WHEN** the app starts and an existing Claude Code account, Codex account,
  app-managed Codex API key, or Claude Provider Profile is available
- **THEN** onboarding shows that path as ready or repairable using renderer-safe
  metadata
- **AND** it does not force the user through a blank credential form for that path

#### Scenario: Setup needs repair

- **WHEN** a path was previously usable
- **AND** the corresponding runtime, credential, or provider status is now
  missing, expired, unavailable, or invalid
- **THEN** onboarding shows a repair action for that path
- **AND** it does not silently enter the app as if the path were healthy

### Requirement: Onboarding Status Uses Existing Owners

The onboarding surface SHALL derive setup readiness from existing provider,
credential, runtime-status, and project owners and SHALL NOT introduce a second
durable runtime truth, provider truth, or credential store.

#### Scenario: Renderer displays setup status

- **WHEN** onboarding displays Claude, Codex, Provider Profile, or project status
- **THEN** it uses renderer-safe status returned by the relevant main-process or
  existing renderer state owner
- **AND** it does not infer runtime readiness from onboarding labels, selected
  runtime names, localStorage completion flags, or filesystem guesses
- **AND** it does not receive or persist plaintext provider, OAuth, gateway, or
  API-key secrets

#### Scenario: Legacy onboarding state is present

- **WHEN** orphaned legacy onboarding localStorage keys are present
- **THEN** onboarding ignores them (there are no existing users to migrate, and
  the completion atoms have been removed)
- **AND** connected, ready, missing, expired, or repair states come solely from
  the existing runtime, provider, credential, and project owners

### Requirement: Explicit External Auth Actions

The onboarding surface SHALL require explicit user intent before launching an
external browser or CLI auth flow, importing local credentials, or saving provider
credentials.

#### Scenario: Claude path is shown

- **WHEN** the Claude Code setup path renders
- **THEN** it does not start Claude Code local login or import system credentials
  until the user chooses the corresponding action
- **AND** local-only mode continues to hide or block hosted upstream auth paths

#### Scenario: Codex path is shown

- **WHEN** the Codex setup path renders
- **THEN** it does not start Codex ChatGPT login until the user chooses to sign in
- **AND** app-managed Codex API key entry saves only through the existing
  main-process secure-storage path

#### Scenario: Provider profile path is shown

- **WHEN** the Anthropic API key or custom/local provider setup path renders
- **THEN** it does not save a provider profile until the user submits the form
- **AND** submitted credentials follow the existing Provider Profile and secure
  storage boundaries

### Requirement: First-Run Completion Gate

The system SHALL allow first-run onboarding to complete after one usable AI path
is configured and the user either selects a project or explicitly defers project
selection to Quick chat.

#### Scenario: User configures one AI path and opens a project

- **WHEN** the user has a usable Claude Code, Codex, or Claude Provider Profile
  path
- **AND** the user opens, clones, or selects a project
- **THEN** the app enters the main shell with that project selected
- **AND** secondary AI paths remain optional connect-later work

#### Scenario: User configures one AI path and starts Quick chat

- **WHEN** the user has a usable Claude Code, Codex, or Claude Provider Profile
  path
- **AND** no project is selected
- **AND** the user chooses Quick chat instead of selecting a project
- **THEN** the app enters the main shell with project selection deferred
- **AND** project-dependent workflows remain unavailable until a project is
  selected or attached

#### Scenario: No usable AI path exists

- **WHEN** no Claude Code, Codex, or Claude Provider Profile path is usable
- **THEN** onboarding remains on setup actions
- **AND** it does not treat project selection alone as enough to start agent work
