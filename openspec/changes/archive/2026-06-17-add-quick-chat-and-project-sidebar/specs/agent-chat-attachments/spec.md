## MODIFIED Requirements

### Requirement: Image-Only Messages
The system SHALL allow image-only messages wherever user chat messages can be sent.

#### Scenario: New project-backed chat image-only send
- **WHEN** the new-chat input contains one or more ready image attachments and no text
- **AND** a project is selected
- **THEN** the send action is enabled
- **AND** the created chat receives a user message containing the image attachments

#### Scenario: New folderless quick-chat image-only send
- **WHEN** the new-chat input contains one or more ready image attachments and no text
- **AND** no project is selected
- **AND** the selected runtime supports assistant attachment delivery
- **THEN** the send action is enabled
- **AND** the created quick chat receives a user message containing the image attachments

#### Scenario: Active chat image-only send
- **WHEN** an active chat input contains one or more ready image attachments and no text
- **THEN** the send action is enabled
- **AND** the user message is sent with the image attachments

#### Scenario: Queued image-only send
- **WHEN** a stream is active and the user sends an image-only message
- **THEN** the app queues the image message
- **AND** sends it after the active stream is ready
