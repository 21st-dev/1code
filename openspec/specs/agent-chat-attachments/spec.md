# agent-chat-attachments Specification

## Purpose
TBD - created by archiving change add-rich-chat-attachments. Update Purpose after archive.
## Requirements
### Requirement: Rich Image Attachments
The system SHALL let users attach images to agent chat messages from supported local input methods.

#### Scenario: User attaches image through file picker
- **WHEN** the user selects a supported image file from the attachment button
- **THEN** the app stages the image locally
- **AND** shows a removable image preview in the chat input

#### Scenario: User pastes screenshot
- **WHEN** the user pastes a clipboard image into the chat input
- **THEN** the app stages the image locally
- **AND** shows it as an image attachment without inserting binary text into the editor

#### Scenario: User drags image into input
- **WHEN** the user drops a supported image file onto the chat input
- **THEN** the app stages the image locally
- **AND** preserves focus on the chat input after staging

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

### Requirement: Local Attachment Storage
The system SHALL store staged image bytes in local app-managed attachment storage instead of long-lived renderer storage.

#### Scenario: Image is staged
- **WHEN** an image is added to chat input
- **THEN** the main process validates and stores the image bytes in an app-controlled local attachment location
- **AND** the renderer stores only attachment metadata and preview information

#### Scenario: Message is persisted
- **WHEN** a user message with a newly staged image is persisted
- **THEN** the persisted message references the attachment by metadata or local reference
- **AND** the persisted message does not contain base64 image bytes

#### Scenario: User removes unsent attachment
- **WHEN** the user removes an unsent image attachment
- **THEN** the app removes it from the pending input state
- **AND** eventually cleans up unreferenced staged bytes

### Requirement: Provider Image Capability
The system SHALL validate image attachments against the selected provider and model capabilities before send.

#### Scenario: Selected provider supports images
- **WHEN** the input contains image attachments
- **AND** the selected provider and model support image input
- **THEN** the app allows send subject to size and count limits

#### Scenario: Selected provider does not support images
- **WHEN** the input contains image attachments
- **AND** the selected provider or model cannot process images
- **THEN** the app blocks send
- **AND** displays a clear explanation that the current provider or model does not support image attachments

#### Scenario: Provider selection changes
- **WHEN** the user changes provider or model while image attachments are staged
- **THEN** the app re-evaluates image support and limits
- **AND** updates warnings or blocking state without losing the staged attachments

### Requirement: Attachment Guardrails
The system SHALL enforce clear attachment limits and unsupported-type handling.

#### Scenario: Image exceeds size limit
- **WHEN** a user adds an image larger than the supported limit
- **THEN** the app either compresses it within the configured limits or rejects it
- **AND** shows a user-visible reason

#### Scenario: Unsupported image type
- **WHEN** a user adds an unsupported image type
- **THEN** the app rejects that file as an image attachment
- **AND** shows the supported image formats

#### Scenario: Too many images
- **WHEN** adding another image would exceed the per-message image count limit
- **THEN** the app prevents adding that image
- **AND** explains the maximum count

### Requirement: Attachment Rendering
The system SHALL render pending and sent image attachments in a way that makes sent context clear.

#### Scenario: Pending attachment renders
- **WHEN** an image attachment is staged in the input
- **THEN** the input shows a thumbnail, filename or fallback label, and remove control

#### Scenario: Sent attachment renders
- **WHEN** a user message includes image attachments
- **THEN** the message bubble shows the images or an image summary
- **AND** the attachment-only summary accurately describes the image count when no text exists

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

