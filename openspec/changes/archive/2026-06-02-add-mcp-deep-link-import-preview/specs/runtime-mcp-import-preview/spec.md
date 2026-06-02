## ADDED Requirements

### Requirement: Pending MCP Import Preview
The system SHALL parse supported MCP import links into pending preview objects
without applying, installing, enabling, or writing configuration.

#### Scenario: User opens an MCP import link
- **WHEN** Locus receives a supported MCP import link
- **THEN** the system creates a pending preview
- **AND** the preview shows the target runtime, target scope, server name,
  transport, command or URL, args, env/header keys, requested enabled state, and
  any paths that would be written by a future apply flow
- **AND** no MCP server is activated and no external runtime config is written

### Requirement: Renderer-Safe MCP Import Metadata
The system SHALL return only renderer-safe metadata for MCP import previews.

#### Scenario: Import payload contains secrets
- **WHEN** an MCP import payload includes env values, header values, bearer
  tokens, OAuth tokens, API keys, or resolved environment values
- **THEN** the renderer-facing preview returns only keys and redacted
  value-presence metadata
- **AND** plaintext secret values are not returned in preview, status, error,
  toast, or log payloads

### Requirement: Explicit Activation Boundary
The system SHALL default MCP import previews to pending and disabled even when a
payload requests activation.

#### Scenario: Import payload requests enabled state
- **WHEN** an MCP import payload requests that a server be enabled immediately
- **THEN** the preview records the requested enabled state
- **AND** the effective preview state remains pending and disabled
- **AND** the UI does not expose an apply or enable action in this slice

### Requirement: Sanitized Deep-Link Logging
The system SHALL avoid logging raw deep links or secret-bearing query values.

#### Scenario: Deep link contains OAuth or token values
- **WHEN** the protocol handler receives a deep link with query parameters such
  as `code`, `state`, `access_token`, `api_key`, `env`, or `headers`
- **THEN** logs include only sanitized scheme, host, path, and query-key names
- **AND** raw query values are omitted or redacted
