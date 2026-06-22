## MODIFIED Requirements

### Requirement: Per-Run Gateway Routing
The system SHALL route provider-profile runtime requests through a Locus-owned
loopback gateway instead of mutating external CLI configuration during normal
runs.

#### Scenario: Codex provider-profile run starts
- **WHEN** Codex starts with a provider profile
- **THEN** Codex receives per-run app-server config overrides for the Locus provider
  gateway
- **AND** the process environment contains the gateway token only under a
  Locus-owned variable
- **AND** inherited `CODEX_API_KEY` and `OPENAI_API_KEY` values are removed from
  the Codex provider process environment
- **AND** unrelated provider/API token env vars are not inherited by the Codex
  provider process
- **AND** `~/.codex/config.toml` and `~/.codex/auth.json` are not written as part
  of the normal run

#### Scenario: Claude provider-profile run starts
- **WHEN** Claude starts with a supported provider profile
- **THEN** Claude receives a loopback Anthropic-compatible gateway URL and
  process-local gateway auth token
- **AND** the gateway injects the stored upstream credential only when forwarding
  the request from the main process
- **AND** `~/.claude/settings.json` is not written as part of the normal run
