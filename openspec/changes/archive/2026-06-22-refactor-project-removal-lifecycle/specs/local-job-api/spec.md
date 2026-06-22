## MODIFIED Requirements
### Requirement: Local Job API Project Onboarding
The Local Job API SHALL let a headless consumer register, inspect, remove from the active list, and restore a local project workspace through versioned `locus api projects` commands backed by a single shared project lifecycle owner, without using the desktop Workbench.

#### Scenario: Consumer registers a workspace
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json`
- **THEN** Locus canonicalizes the path, verifies it exists and is a directory,
  and registers it as a Locus project through the shared lifecycle owner that
  the desktop `projects` router also uses
- **AND** returns a `locus.local-job.v1` JSON envelope with the project ID, name,
  canonical path, and active/removed lifecycle state
- **AND** registration does not require a git remote and does not accept provider
  tokens, OAuth tokens, headers, env values, or other secret-like fields

#### Scenario: Re-registering an active workspace is idempotent
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json` for a
  path that is already active
- **THEN** Locus returns the existing project envelope with a success status
- **AND** does not create a duplicate project

#### Scenario: Re-registering a removed workspace restores it
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json` for a
  canonical path that belongs to a removed project
- **THEN** Locus restores the existing project through the shared lifecycle owner
- **AND** clears the removed state
- **AND** returns the original project ID with retained history still linked

#### Scenario: Consumer checks workspace registration
- **WHEN** a consumer runs `locus api projects status --cwd <path> --json`
- **THEN** Locus reports whether the cwd resolves to a project record and, when
  it does, the owning project ID, name, canonical path, and active/removed state
- **AND** the command does not mutate registration state

#### Scenario: Consumer removes a workspace from the active list
- **WHEN** a consumer runs `locus api projects unregister --cwd <path> --json`
- **THEN** Locus removes the project from the active project list through the
  shared lifecycle owner and returns a versioned JSON envelope describing the
  removed project
- **AND** chats, sub-chats, worktrees, job history, and repository files are not
  deleted by default
- **AND** Locus refuses to remove a project that has active queued or running
  jobs unless `--force` is provided, reporting what would be affected
- **AND** `--force` only affects active-list removal and does not perform
  destructive project-history deletion

#### Scenario: Destructive project history deletion is not a headless command
- **WHEN** a consumer inspects or invokes Local Job API project commands in this
  lifecycle change
- **THEN** Locus does not expose a `projects delete-history` command
- **AND** permanent project-history deletion remains a desktop UI action with
  count-based confirmation

#### Scenario: Registration owner is shared, not duplicated
- **WHEN** project lifecycle logic is changed
- **THEN** both the desktop `projects` router and the headless `api projects`
  commands use the same shared lifecycle owner
- **AND** the headless commands do not maintain a second registration, removal,
  restore, or history-deletion code path
