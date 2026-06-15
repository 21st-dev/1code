## ADDED Requirements
### Requirement: Local Job API Policy Grant Scope Binding
The Local Job API SHALL provide a documented policy-grant scope vocabulary for
callers that explicitly request declared-scope-bound non-desktop execution.

#### Scenario: Caller requests enforced policy grant
- **WHEN** a Local Job API v1 caller submits `runtime.executionProfile:
  policy-grant` with supported `runtime.policyGrant.scopes`
- **THEN** Locus validates the scopes before provider work starts
- **AND** passes the validated grant to the runtime permission policy as an
  enforceable scope contract
- **AND** the selected adapter reports declared-scope-bound enforcement in its
  sanitized selection diagnostic

#### Scenario: Scope cannot be enforced
- **WHEN** a Local Job API request includes unknown, unsupported, or
  non-enforceable policy-grant scopes
- **THEN** Locus rejects the request or fails adapter selection before provider
  work starts
- **AND** returns a sanitized diagnostic that identifies the unsupported scope
  category without exposing credentials or local secrets

#### Scenario: Existing default remains batch
- **WHEN** a Local Job API v1 caller omits `runtime.executionProfile`
- **THEN** Locus continues to use the default batch selector path
- **AND** the caller is not silently moved to app-server execution or
  declared-scope-bound enforcement
