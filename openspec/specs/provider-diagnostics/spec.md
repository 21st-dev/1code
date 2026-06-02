# provider-diagnostics Specification

## Purpose
TBD - created by archiving change add-provider-diagnostics. Update Purpose after archive.
## Requirements
### Requirement: Structured Provider Diagnostic Runs
The system SHALL run structured diagnostics for saved provider profiles from the
main process.

#### Scenario: User runs diagnostics for a provider profile
- **WHEN** the user starts diagnostics for a saved provider profile
- **THEN** the renderer sends only the profile id
- **AND** the main process resolves credentials and provider metadata
- **AND** the result includes renderer-safe checks for endpoint, auth, model,
  protocol, streaming, tool, vision, gateway, and runtime readiness where
  applicable

### Requirement: Stable Diagnostic Categories
The system SHALL classify provider diagnostic outcomes with stable categories.

#### Scenario: Provider setup fails
- **WHEN** a diagnostic check fails or is unsupported
- **THEN** the result identifies a category such as `endpoint_unreachable`,
  `auth_failed`, `model_denied`, `protocol_mismatch`, `streaming_unsupported`,
  `tools_unsupported`, `vision_unsupported`, `gateway_failed`, or
  `runtime_unavailable`
- **AND** unsupported optional capabilities are distinguished from failed
  required setup checks

### Requirement: Renderer-Safe Diagnostic Payloads
The system SHALL return and persist only redacted provider diagnostic payloads.

#### Scenario: Provider response includes secrets
- **WHEN** an upstream provider, gateway, runtime, or local error echoes an API
  key, bearer token, custom header value, OAuth token, or derived authorization
  header
- **THEN** the diagnostic payload redacts the secret before returning it to the
  renderer
- **AND** the persisted diagnostic snapshot does not contain plaintext secret
  values

### Requirement: Runtime Readiness Preflight
The system SHALL separate provider network diagnostics from local runtime
readiness diagnostics.

#### Scenario: Runtime cannot start with a profile
- **WHEN** Claude Code or Codex runtime prerequisites are missing or unsupported
  for the selected profile
- **THEN** diagnostics report `runtime_unavailable` or `protocol_mismatch`
  before provider execution is attempted
- **AND** the result explains the blocked runtime without exposing credentials

