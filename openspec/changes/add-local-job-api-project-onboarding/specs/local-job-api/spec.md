## ADDED Requirements
### Requirement: Local Job API Project Onboarding
The Local Job API SHALL let a headless consumer register, inspect, and remove a
local project workspace through versioned `locus api projects` commands backed by
a single shared registration owner, without using the desktop Workbench.

#### Scenario: Consumer registers a workspace
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json`
- **THEN** Locus canonicalizes the path, verifies it exists and is a directory,
  and registers it as a Locus project through the shared registration owner that
  the desktop `projects` router also uses
- **AND** returns a `locus.local-job.v1` JSON envelope with the project ID, name,
  and canonical path
- **AND** registration does not require a git remote and does not accept provider
  tokens, OAuth tokens, headers, env values, or other secret-like fields

#### Scenario: Re-registering an existing workspace is idempotent
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json` for a
  path that is already registered
- **THEN** Locus returns the existing project envelope with a success status
- **AND** does not create a duplicate project

#### Scenario: Consumer checks workspace registration
- **WHEN** a consumer runs `locus api projects status --cwd <path> --json`
- **THEN** Locus reports whether the cwd resolves to a registered project and,
  when it does, the owning project ID, name, and canonical path
- **AND** the command does not mutate registration state

#### Scenario: Consumer removes a workspace
- **WHEN** a consumer runs `locus api projects unregister --cwd <path> --json`
- **THEN** Locus removes the registration for the canonical path and returns a
  versioned JSON envelope describing the removed project
- **AND** Locus refuses to remove a project that has active (queued or running)
  jobs unless `--force` is provided, reporting what would be affected

#### Scenario: Registration owner is shared, not duplicated
- **WHEN** project registration logic is changed
- **THEN** both the desktop `projects` router and the headless `api projects`
  commands use the same shared registration owner
- **AND** the headless commands do not maintain a second registration code path

### Requirement: Local Job API Structured Registration Errors
The Local Job API SHALL report an unregistered project workspace through a stable
structured error code instead of requiring consumers to match human-readable
error text.

#### Scenario: Create targets an unregistered cwd
- **WHEN** a consumer runs `locus api runs create` with a cwd that is not inside
  any registered project
- **THEN** Locus rejects the request before provider work starts with a stable
  error envelope whose code is `project_not_registered`
- **AND** the consumer can branch on that code without parsing English stderr
- **AND** the command exit code preserves the existing invalid-cwd value

#### Scenario: Status reports a missing registration
- **WHEN** a consumer runs `locus api projects status --cwd <path> --json` for a
  cwd that is not inside any registered project
- **THEN** Locus returns a success-shaped envelope indicating the cwd is not
  registered, or a stable `project_not_registered` error envelope, per the
  documented status contract
- **AND** the response does not depend on consumers matching error message text

#### Scenario: Error envelope preserves the secret boundary
- **WHEN** Locus returns a registration error or a project onboarding envelope
- **THEN** the payload includes only the canonical path and registration
  metadata
- **AND** does not include provider tokens, OAuth tokens, raw headers, env
  values, or other secret-like material
