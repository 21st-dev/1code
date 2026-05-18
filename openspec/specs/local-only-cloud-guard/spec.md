# local-only-cloud-guard Specification

## Purpose
Define the default local-only boundary that blocks official hosted upstream services while allowing user-owned provider endpoints and explicit local workflows.
## Requirements
### Requirement: Local-only mode defaults on
The desktop app SHALL enable local-only mode by default and SHALL only disable it when an explicit environment override sets `AGENT_CODE_FOR_ME_LOCAL_ONLY=false`, legacy `ONECODE_LOCAL_ONLY=false`, or `MAIN_VITE_LOCAL_ONLY=false`.

#### Scenario: Open-source build starts without override
- **WHEN** the app starts without a local-only override
- **THEN** local-only mode is enabled

#### Scenario: Explicit override disables local-only
- **WHEN** `AGENT_CODE_FOR_ME_LOCAL_ONLY=false`, legacy `ONECODE_LOCAL_ONLY=false`, or `MAIN_VITE_LOCAL_ONLY=false` is set
- **THEN** hosted upstream feature paths may run subject to their existing auth and feature checks

### Requirement: Main process blocks official cloud calls
When local-only mode is enabled, the main process SHALL reject hosted upstream URLs before issuing network requests through auth, updater, voice backend, sandbox import, remote chat transport, or generic renderer fetch proxies.

#### Scenario: Renderer proxy requests hosted API
- **WHEN** renderer code calls `signedFetch` or `streamFetch` with a hosted upstream URL
- **THEN** the main process rejects the request with `Local-only mode blocks hosted upstream services`

#### Scenario: Hosted startup services would initialize
- **WHEN** local-only mode is enabled during app startup
- **THEN** analytics, Sentry, and auto-update checks do not initialize or contact official hosted services

### Requirement: Renderer hides hosted feature entrypoints
The default local-first desktop app SHALL remove or fully isolate user-facing hosted upstream feature entrypoints rather than presenting disabled cloud workflows as normal product options. The renderer SHALL avoid querying remote upstream APIs and SHALL not render entrypoints for remote sandbox chats, automations, inbox, hosted subscription gating, hosted updates, hosted changelog fetching, hosted TTS, hosted voice fallback, or hosted desktop auth in the default local-first build. The renderer MAY offer a manual fork-owned GitHub Releases check that only reports available Locus releases and opens the release page for manual download.

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

#### Scenario: User manually checks fork release
- **WHEN** the user opens Settings > About and clicks "Check for updates"
- **THEN** the app may request the fork-owned GitHub Releases latest endpoint
- **AND** the app does not initialize an automatic updater or fetch an official upstream hosted update feed

### Requirement: User-owned external services remain available
Local-only mode SHALL NOT block user-configured AI provider endpoints, Ollama localhost requests, Git/GitHub operations initiated by local workflows, or external links that are not official upstream hosted services.

#### Scenario: User sends a request through a custom provider
- **WHEN** a user configures an Anthropic-compatible provider endpoint that is not an official upstream hosted URL
- **THEN** the local agent flow may call that provider normally
#### Scenario: Local workflow opens GitHub
- **WHEN** a local Git/GitHub workflow opens a GitHub URL
- **THEN** local-only mode does not block that external URL

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
