## ADDED Requirements

### Requirement: Codex App-Server Attachment Delivery
The system SHALL preserve local attachment boundaries when Codex desktop/chat uses the app-server adapter.

#### Scenario: Codex sends supported image attachments through app-server
- **WHEN** a Codex desktop/chat request includes image attachments
- **THEN** the renderer sends only renderer-safe attachment metadata and local refs
- **AND** the main process resolves and validates attachment contents before runtime startup
- **AND** the app-server adapter receives only the normalized input shape it supports
- **AND** unsupported image or file input shapes fail before provider work starts

#### Scenario: App-server changes attachment input shape
- **WHEN** app-server accepts structured input items instead of the previous AI SDK message parts
- **THEN** Locus maps existing attachment metadata into that input shape in the main process
- **AND** persisted message metadata does not store raw base64 image bodies or provider-specific attachment payloads
