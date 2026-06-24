# agent-chat-attachments Specification

## Purpose
Define how agent chat image attachments are staged, persisted, rendered, and gated by runtime
transport plus target model vision capability before they reach provider or runtime execution paths.

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
The system SHALL determine image-attachment support from the combination of the selected runtime's
ability to deliver images (transport) AND the resolved target model's vision capability, and SHALL
block image send whenever either is unavailable. First-party Claude/Codex sources with runtime-known
image support SHALL resolve to an explicit supported vision state. Provider Profile/custom sources
whose vision capability is unknown or unset SHALL be treated as unsupported (fail closed). The block
explanation SHALL identify the actual cause (runtime/transport, offline local model, or text-only
model) rather than a generic or mismatched reason. For desktop UI requests, raw Claude selector
values such as `auto` and `custom-provider` SHALL be normalized by renderer/transport run admission
before model vision lookup; the main process SHALL consume the resulting target identity rather than
importing renderer-only normalization logic.

#### Scenario: First-party provider source supports images
- **WHEN** the input contains image attachments
- **AND** the selected runtime can deliver images
- **AND** the active source is first-party Claude OAuth, Codex ChatGPT, or Codex `openai-api-key`
  with runtime-known image support
- **THEN** the app allows send subject to size and count limits

#### Scenario: Claude raw source normalizes before capability lookup
- **WHEN** the selected Claude model source is `auto` or `custom-provider`
- **AND** the input contains image attachments
- **THEN** renderer/transport run admission normalizes that source to the effective run source before
  resolving model vision
- **AND** uses the normalized `claude-oauth` or `provider-profile:*` source for image capability
  lookup

#### Scenario: Provider profile model supports images
- **WHEN** the input contains image attachments
- **AND** the selected runtime can deliver images
- **AND** the active Provider Profile declares `vision: true`
- **THEN** the app allows send subject to size and count limits

#### Scenario: Runtime transport cannot deliver images
- **WHEN** the input contains image attachments
- **AND** the selected runtime does not support image delivery (for example `qwen-code` or `kun`)
- **THEN** the app blocks send
- **AND** explains that the current runtime does not support image attachments

#### Scenario: Selected model is text-only
- **WHEN** the input contains image attachments
- **AND** the selected Provider Profile/model does not support vision (for example a text-only
  third-party model behind a custom provider)
- **THEN** the app blocks send
- **AND** explains that the current model cannot process images

#### Scenario: Provider profile vision capability is unknown
- **WHEN** the input contains image attachments
- **AND** the selected Provider Profile has not declared a vision capability
- **THEN** the app treats the model as unable to process images and blocks send (fail closed)
- **AND** explains how to enable image support for that provider/model

#### Scenario: Provider profile metadata is missing
- **WHEN** the input contains image attachments
- **AND** the selected target identity references a Provider Profile id
- **AND** main-process Provider Profile metadata lookup returns `null`
- **THEN** the app treats the model vision capability as unknown and blocks send (fail closed)
- **AND** does not fall back to first-party image support

#### Scenario: Claude custom-provider uses normalized Provider Profile vision
- **WHEN** the selected Claude model source is `custom-provider`
- **AND** the source normalizes to a legacy/usable Provider Profile
- **AND** that Provider Profile has not declared `vision: true`
- **THEN** the app blocks image send as `model-no-vision`
- **AND** does not fall back to a raw `custom-provider` allow path

#### Scenario: Claude run-admission blocker precedes image gating
- **WHEN** the selected Claude model source is `auto`, `claude-oauth`, or `custom-provider`
- **AND** run admission cannot produce a usable normalized target identity
- **THEN** the run is blocked by the run-admission blocker
- **AND** the image capability gate does not convert that blocker into a model-vision decision

#### Scenario: Offline local model
- **WHEN** the input contains image attachments
- **AND** the active path is an offline local model that cannot receive images
- **THEN** the app blocks send
- **AND** explains the offline limitation as a distinct reason from a text-only remote model

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

### Requirement: Main-Process Image Capability Enforcement
The system SHALL enforce image-capability rules in the main process before image bytes, provider
gateway endpoints, provider tokens, or runtime adapter work are resolved, independently of
renderer-side warnings, so that an unsupported image can never reach a text-only or non-image-capable
target.

#### Scenario: Main process trusts target identity and verifies capability
- **WHEN** a desktop run request includes image attachments
- **AND** the request carries a normalized `modelSource` or `providerProfileId`
- **THEN** the main process resolves image capability from that target identity and main-process
  metadata
- **AND** does not trust a renderer-supplied vision boolean
- **AND** does not import renderer-only source normalization or maintain a separate main-process copy
  of Claude source fallback policy

#### Scenario: Image send to a text-only model is stopped before provider work
- **WHEN** a desktop run request includes image attachments
- **AND** the resolved target model does not support vision
- **THEN** the main process returns a preflight blocker before resolving image bytes
- **AND** no provider gateway, provider token, runtime config, or runtime adapter call is made with
  the image content

#### Scenario: Unknown model vision is blocked in the main process
- **WHEN** a desktop run request includes image attachments
- **AND** the resolved Provider Profile target's vision capability is unknown, unset, or its metadata
  lookup returns `null`
- **THEN** the main process blocks the run fail-closed before provider work starts

#### Scenario: Missing attachment capability input fails closed
- **WHEN** image attachments reach `prepareChatImageAttachmentsForDesktopRun`
- **AND** the caller did not supply a resolved image capability result
- **THEN** the main process treats the capability as unknown
- **AND** blocks the run with the model-no-vision reason before resolving image bytes

#### Scenario: Image capability check uses non-secret provider metadata
- **WHEN** a desktop run request includes image attachments for a Provider Profile target
- **THEN** the main process resolves image capability from non-secret Provider Profile metadata
- **AND** does not decrypt provider tokens or resolve gateway tokens before deciding whether images
  are allowed

#### Scenario: Queued or resent image message is re-checked
- **WHEN** an image-bearing message is queued or resent against a target model that cannot process
  images
- **THEN** the main-process check blocks it before runtime startup
- **AND** the renderer surfaces the same reason to the user

#### Scenario: Programmatic image-bearing entrypoint uses the same gate
- **WHEN** a Local Job API, headless, or other programmatic request path accepts image attachments
- **THEN** it uses the same normalized target identity plus main-process image capability gate before runtime
  startup
- **AND** if no explicit image capability is available, it fails closed before provider work starts
