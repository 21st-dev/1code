## MODIFIED Requirements

### Requirement: Adapter-Specific Capability Evidence
The system SHALL record Codex capability support evidence per adapter source rather than assuming every Codex transport has identical behavior.

#### Scenario: Codex capability support is evaluated
- **WHEN** Codex desktop/chat, headless `codex exec`, SDK, or app-server paths report a capability as `supported`
- **THEN** the capability evidence identifies the adapter source or Locus-owned shared layer that provides the behavior
- **AND** tests or smoke evidence cover that adapter source before the capability is shown as supported for that path
- **AND** support on one Codex path does not imply support on another Codex path

#### Scenario: App-server is the sole desktop adapter after ACP removal
- **WHEN** the ACP temporary-compat path is removed and app-server is the only Codex desktop/chat adapter
- **THEN** capability reasons and remediation hints do not cite ACP-specific primitives as evidence for supported behavior
- **AND** deleting the ACP capability overrides does not leave any app-server capability silently upgraded to `supported`
- **AND** Locus-owned shared files retained under `acp-*` names (for example the shared permission decisioning module) remain valid capability evidence for the app-server path
