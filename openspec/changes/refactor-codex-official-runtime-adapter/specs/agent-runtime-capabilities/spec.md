## ADDED Requirements

### Requirement: Adapter-Specific Capability Evidence
The system SHALL record Codex capability support evidence per adapter source rather than assuming every Codex transport has identical behavior.

#### Scenario: Codex capability support is evaluated
- **WHEN** Codex desktop/chat, headless `codex exec`, SDK, app-server, or ACP compatibility paths report a capability as `supported`
- **THEN** the capability evidence identifies the adapter source or Locus-owned shared layer that provides the behavior
- **AND** tests or smoke evidence cover that adapter source before the capability is shown as supported for that path
- **AND** support on one Codex path does not imply support on another Codex path

#### Scenario: App-server replaces ACP
- **WHEN** app-server becomes the default Codex desktop/chat adapter
- **THEN** capability reasons and remediation hints no longer cite ACP-specific primitives as the evidence for supported behavior
- **AND** any remaining ACP-only behavior is either moved to app-server, kept behind an explicit temporary fallback, or downgraded for app-server
