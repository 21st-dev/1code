## ADDED Requirements

### Requirement: Qwen CLI Configuration Visibility

The system SHALL show renderer-safe visibility into the Qwen Code CLI
configuration that Locus inherits when Qwen runtime surfaces are enabled. The
summary SHALL be informational only: Qwen remains runtime-managed by Qwen Code,
and Locus SHALL NOT expose Qwen as a Provider Profile target, route Qwen through
the Locus provider gateway, or write Qwen auth/model/provider settings.

#### Scenario: Settings shows configured Qwen provider metadata
- **WHEN** Qwen runtime surfaces are enabled and the user's Qwen Code settings
  contain a selected auth type, selected model, and model provider entries
- **THEN** Settings shows the selected auth type, selected model, and configured
  provider/model groups as Qwen-managed metadata
- **AND** the renderer receives only bounded, non-secret fields such as auth
  type, model id/name, sanitized provider origin, env-key names, file presence,
  and parse status
- **AND** no API keys, OAuth tokens, `.env` values, raw environment, raw headers,
  or full Qwen settings JSON are sent to renderer state

#### Scenario: Qwen settings are missing or invalid
- **WHEN** Qwen runtime surfaces are enabled but the user's Qwen Code settings
  file is missing, unreadable, or invalid JSON
- **THEN** Settings shows a setup/configuration-needed summary that tells the
  user to run `qwen` and `/auth` or edit Qwen Code settings
- **AND** CLI detection alone does not mark Qwen provider/model setup as
  complete
- **AND** no provider work or ACP process spawn is attempted from this display

#### Scenario: Qwen runtime is disabled
- **WHEN** the resolved Qwen runtime setting is off
- **THEN** Settings hides the Qwen CLI configuration summary behind the Qwen
  runtime toggle
- **AND** direct Qwen CLI status calls return a disabled setup diagnostic without
  probing PATH, reading Qwen settings, or spawning Qwen
