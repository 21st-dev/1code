## ADDED Requirements
### Requirement: Non-Desktop Policy Grant Scope Enforcement
The runtime core SHALL bind supported non-desktop policy-grant scopes to adapter
permission decisions before side effects execute.

#### Scenario: In-scope side effect is allowed
- **WHEN** a non-desktop run declares supported policy-grant scopes
- **AND** the selected adapter exposes a pre-execution permission hook that can
  classify a requested side effect
- **AND** the requested side effect is inside the declared grant
- **THEN** the runtime permits the side effect without requiring a visible user
- **AND** emits a sanitized permission or status diagnostic that does not expose
  credentials or raw provider headers

#### Scenario: Out-of-scope side effect is denied
- **WHEN** a non-desktop run declares supported policy-grant scopes
- **AND** the selected adapter asks to perform a side effect outside those scopes
- **THEN** the runtime denies the side effect before it executes
- **AND** the run records a sanitized denial event and fails or continues
  according to the adapter's documented policy

#### Scenario: Adapter cannot bind declared scopes
- **WHEN** a non-desktop run requests declared-scope-bound policy-grant
  execution
- **AND** the selected adapter cannot install the required pre-execution
  permission hook
- **THEN** the selector fails closed before provider work starts
- **AND** it does not downgrade to admission/audit-only semantics unless the
  caller explicitly requested that compatibility mode
