## MODIFIED Requirements
### Requirement: Renderer hides hosted feature entrypoints
The default local-first desktop app SHALL remove or fully isolate user-facing hosted upstream feature entrypoints rather than presenting disabled cloud workflows as normal product options. The renderer SHALL avoid querying remote upstream APIs and SHALL not render entrypoints for remote sandbox chats, automations, inbox, hosted subscription gating, hosted changelog fetching, hosted TTS, hosted voice fallback, or hosted desktop auth in the default local-first build. The renderer MAY offer fork-owned GitHub Releases update checks for Locus releases, including automatic checks on supported packaged installs, provided downloads and restarts remain user-confirmed.

#### Scenario: Sidebar renders in local-only mode
- **WHEN** the agents sidebar mounts
- **THEN** it does not fetch remote chats or inbox counts
- **AND** it does not show Automations, Inbox, or remote workspace entries

#### Scenario: Help and Beta settings render in local-only mode
- **WHEN** Help or Beta settings are opened
- **THEN** they do not fetch hosted changelog, subscription, or official upstream update data
- **AND** they do not present hosted-only update or account controls as local product features

#### Scenario: User checks fork release updates
- **WHEN** Settings > About checks for Locus releases
- **THEN** the app may request this fork's GitHub Releases update feed
- **AND** the app does not initialize an official upstream hosted update feed

### Requirement: Hosted-only implementation cleanup
The default local-first build SHALL not include active runtime initialization for official upstream hosted auth, remote sandbox import, remote hosted chat, automations, inbox, hosted subscription-plan services, official upstream hosted update feeds, telemetry, or error-reporting services unless the implementation is explicitly isolated for an internal build and remains blocked by the Local-only guard.

#### Scenario: Default build starts
- **WHEN** the default local-first app starts without a hosted/internal override
- **THEN** official upstream hosted auth, analytics, error reporting, official upstream update feed, subscription-plan, automations, inbox, and remote sandbox services are not initialized
- **AND** no official upstream hosted startup requests are issued

#### Scenario: Hosted-only code has no local caller
- **WHEN** a hosted-only UI or IPC/API path is no longer reachable from local-first workflows
- **THEN** the path is removed or isolated behind an explicit internal-build boundary
- **AND** the Local-only guard remains in place for any remaining official upstream URL access
