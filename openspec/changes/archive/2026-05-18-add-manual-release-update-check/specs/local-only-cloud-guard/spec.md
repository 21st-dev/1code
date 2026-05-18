## MODIFIED Requirements

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
