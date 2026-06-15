## ADDED Requirements

### Requirement: Codex App-Server Long-Text Context Delivery
The system SHALL preserve long-text local-ref and main-process resolution boundaries when Codex desktop/chat uses the app-server adapter.

#### Scenario: Codex sends long-text context through app-server
- **WHEN** a Codex desktop/chat request includes long-text attachments
- **THEN** renderer and persisted message state contain local refs and metadata rather than long-text bodies
- **AND** the main process resolves, bounds, and formats or maps the content immediately before runtime startup
- **AND** unsupported app-server input shapes fail before provider work starts rather than silently dropping or embedding excessive context

#### Scenario: App-server supports structured long-text input
- **WHEN** app-server supports structured text input items for large context
- **THEN** Locus may map long-text refs into structured input items in the main process
- **AND** size limits, deletion checks, and local-only file boundaries remain enforced before the adapter receives the content
