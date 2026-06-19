## ADDED Requirements

### Requirement: Codex MCP Logout Failure UX
Settings > MCP SHALL treat failed Codex MCP logout as failed credential
revocation, not as a successful sign-out.

#### Scenario: Codex logout fails
- **WHEN** the user logs out of a Codex MCP server and the Codex logout mutation
  returns or throws a failure
- **THEN** Settings does not refresh or change the server to a logged-out state
- **AND** Settings tells the user that logout failed and OAuth credentials may
  still exist
- **AND** Settings identifies the failure source as Codex CLI/keyring credential
  deletion
- **AND** Settings keeps a retry action available
- **AND** Settings exposes manual cleanup guidance
- **AND** Locus does not delete or mutate Codex credentials outside the Codex CLI

#### Scenario: Codex logout succeeds
- **WHEN** the user logs out of a Codex MCP server and the Codex logout mutation
  succeeds
- **THEN** Settings shows the normal success message
- **AND** Settings refreshes Codex MCP status from the runtime-owned config
