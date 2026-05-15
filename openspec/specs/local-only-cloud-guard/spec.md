# local-only-cloud-guard Specification

## Purpose
TBD - created by archiving change add-default-local-only-cloud-guard. Update Purpose after archive.
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
When local-only mode is enabled, the renderer SHALL avoid querying remote upstream APIs and SHALL hide or disable UI entrypoints for remote sandbox chats, automations, inbox, hosted subscription gating, hosted updates, changelog fetching, hosted TTS, and hosted voice fallback.

#### Scenario: Sidebar renders in local-only mode
- **WHEN** the agents sidebar mounts
- **THEN** it does not fetch remote chats or inbox counts and does not show Automations or Inbox entries

#### Scenario: Help and Beta settings render in local-only mode
- **WHEN** Help or Beta settings are opened
- **THEN** they do not fetch hosted changelog, subscription, or update data

### Requirement: User-owned external services remain available
Local-only mode SHALL NOT block user-configured AI provider endpoints, Ollama localhost requests, Git/GitHub operations initiated by local workflows, or external links that are not official upstream hosted services.

#### Scenario: User sends a request through a custom provider
- **WHEN** a user configures an Anthropic-compatible provider endpoint that is not an official upstream hosted URL
- **THEN** the local agent flow may call that provider normally

#### Scenario: Local workflow opens GitHub
- **WHEN** a local Git/GitHub workflow opens a GitHub URL
- **THEN** local-only mode does not block that external URL
