## ADDED Requirements
### Requirement: Local Job API Runtime Trace Compatibility
The Local Job API SHALL preserve its stable v1 event and result envelopes while
the internal runtime event vocabulary converges on canonical `RunEvent` records.

#### Scenario: V1 consumer reads converged events
- **WHEN** a `locus.local-job.v1` consumer reads events for a job produced
  through the converged runtime event bridge
- **THEN** Locus returns the documented v1 event envelope with `apiVersion`,
  `jobId`, `sequence`, `type`, `createdAt`, and sanitized `payload`
- **AND** the consumer is not required to parse raw `RunEvent` fields

#### Scenario: Rich runtime data is unavailable in v1
- **WHEN** a canonical runtime event contains details that v1 does not expose as
  stable contract fields
- **THEN** Locus either maps those details into an existing sanitized v1 payload
  or omits them from v1 output
- **AND** introducing new rich interaction callbacks requires a separate Local
  Job API v2 or internal contract proposal

### Requirement: Local Job API Execution Profile Gate
The Local Job API SHALL keep existing v1 jobs on the safe default execution
profile unless a request is explicitly allowed to use another adapter profile.

#### Scenario: V1 request omits execution profile
- **WHEN** a valid v1 create request does not declare an approved non-batch
  execution profile
- **THEN** Locus runs the job through the default batch-compatible selector path
  when runtime capabilities and permission policy allow it
- **AND** existing consumers do not silently move to desktop/app-server
  execution semantics

#### Scenario: Requested profile needs interaction
- **WHEN** a Local Job API request asks for an adapter profile that requires
  user approval, AskUserQuestion, MCP elicitation, or unknown side-effect
  approval
- **AND** the request lacks an approved policy grant or interactive channel
- **THEN** Locus rejects or fails the run before provider work starts
- **AND** reports a sanitized unsupported-profile or fail-closed diagnostic

#### Scenario: Policy grant scopes are admission and audit metadata
- **WHEN** a Local Job API v1 request explicitly asks for `policy-grant`
  execution and supplies `runtime.policyGrant.scopes`
- **THEN** Locus may select an app-server-capable adapter only after validating
  the grant before provider work starts
- **AND** the v1 scope strings are treated as admission and audit metadata
  unless a later approved scope-enforcement change binds those strings to
  adapter permission decisions
- **AND** existing v1 callers that omit `runtime.executionProfile` continue to
  use the default batch selector path
