## MODIFIED Requirements

### Requirement: Renderer hides hosted feature entrypoints
The default local-first desktop app SHALL remove or fully isolate user-facing hosted upstream feature entrypoints rather than presenting disabled cloud workflows as normal product options. The renderer SHALL avoid querying remote upstream APIs and SHALL not render entrypoints for remote sandbox chats, automations, inbox, hosted subscription gating, hosted updates, hosted changelog fetching, hosted TTS, hosted voice fallback, or hosted desktop auth in the default local-first build.

#### Scenario: Sidebar renders in local-only mode
- **WHEN** the agents sidebar mounts
- **THEN** it does not fetch remote chats or inbox counts
- **AND** it does not show Automations, Inbox, or remote workspace entries

#### Scenario: Help and Beta settings render in local-only mode
- **WHEN** Help or Beta settings are opened
- **THEN** they do not fetch hosted changelog, subscription, or update data
- **AND** they do not present hosted-only update or account controls as local product features

#### Scenario: Onboarding renders in default local-first build
- **WHEN** a user starts the app without a hosted/internal build override
- **THEN** onboarding presents local credential, API-key, custom-provider, Codex, or Ollama-compatible choices
- **AND** hosted desktop auth or sandbox OAuth is not presented as the default path

## ADDED Requirements

### Requirement: Hosted-only implementation cleanup
The default local-first build SHALL not include active runtime initialization for official upstream hosted auth, remote sandbox import, remote hosted chat, automations, inbox, hosted subscription-plan services, hosted update feeds, telemetry, or error-reporting services unless the implementation is explicitly isolated for an internal build and remains blocked by the Local-only guard.

#### Scenario: Default build starts
- **WHEN** the default local-first app starts without a hosted/internal override
- **THEN** official upstream hosted auth, analytics, error reporting, update feed, subscription-plan, automations, inbox, and remote sandbox services are not initialized
- **AND** no official upstream hosted startup requests are issued

#### Scenario: Hosted-only code has no local caller
- **WHEN** a hosted-only UI or IPC/API path is no longer reachable from local-first workflows
- **THEN** the path is removed or isolated behind an explicit internal-build boundary
- **AND** the Local-only guard remains in place for any remaining official upstream URL access

### Requirement: Local-only guard remains defense-in-depth
The desktop app SHALL retain centralized official upstream host detection and main-process blocking after hosted remnants are removed. The app SHALL NOT add a visible end-user setting that disables this boundary in the default local-first product.

#### Scenario: Dormant code attempts an official upstream request
- **WHEN** any remaining code path attempts to call an official upstream hosted URL in the default local-first build
- **THEN** the main process blocks the request with `Local-only mode blocks hosted upstream services`

#### Scenario: User-owned provider request runs
- **WHEN** a user configures an Anthropic-compatible provider endpoint that is not an official upstream hosted URL
- **THEN** the local agent flow may call that provider normally
