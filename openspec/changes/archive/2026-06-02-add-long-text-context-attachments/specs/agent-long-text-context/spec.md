## ADDED Requirements

### Requirement: Long Text Context Staging
The system SHALL stage large pasted text and chat-history handoff text as local long text context attachments instead of inserting the full text into the editor.

#### Scenario: User pastes long text
- **WHEN** the user pastes text above the configured large-paste threshold into a chat input
- **THEN** the app stages the text through the main process as a long text context attachment
- **AND** the editor body does not receive the full pasted text
- **AND** the input shows a removable pending context card with filename, size, and preview

#### Scenario: User removes pending long text context
- **WHEN** a pending long text context card is visible
- **AND** the user removes it before sending
- **THEN** the attachment is removed from the pending message
- **AND** the removed text is not sent to the runtime

#### Scenario: Attachment-only long text send
- **WHEN** the input contains one or more ready long text context attachments and no typed text
- **THEN** the send action is allowed wherever normal chat messages can be sent

### Requirement: Local Long Text Storage
The system SHALL keep long text bodies in app-managed local storage and persist only metadata in renderer-visible state.

#### Scenario: Long text is staged
- **WHEN** the main process accepts a long text attachment for staging
- **THEN** it writes the text to an app-managed local attachment location
- **AND** returns metadata with an opaque local reference
- **AND** does not expose an arbitrary readable filesystem path as the source of truth

#### Scenario: Message is persisted
- **WHEN** a user message containing long text context is persisted
- **THEN** the persisted message stores metadata and local references only
- **AND** the persisted message JSON does not contain the full long text body

#### Scenario: Draft is saved
- **WHEN** a draft contains pending long text context
- **THEN** the draft stores metadata and local references only
- **AND** restoring the draft re-renders the context card without rehydrating full text into renderer state

### Requirement: Long Text Size Guardrails
The system SHALL enforce explicit size limits for long text context before runtime execution.

#### Scenario: Single long text attachment exceeds limit
- **WHEN** a user attempts to stage one long text attachment above the configured single-attachment limit
- **THEN** the app rejects the attachment
- **AND** shows a user-visible explanation that the text is too large to include as one context attachment

#### Scenario: Aggregate send exceeds limit
- **WHEN** the user sends a message whose long text attachments exceed the configured aggregate send limit
- **THEN** the app blocks the send before invoking the runtime
- **AND** shows a user-visible explanation that the attached text must be reduced or split

#### Scenario: Text is too large for inline paste but valid as context
- **WHEN** pasted text exceeds the inline editor threshold but stays within the long text attachment limit
- **THEN** the app stages it as a long text context attachment
- **AND** does not truncate it silently

### Requirement: Runtime Prompt Injection
The system SHALL resolve long text context attachments in the main process and inject their text into runtime prompts using a deterministic bounded block format.

#### Scenario: Claude Code receives long text context
- **WHEN** a Claude Code chat message includes long text context attachments
- **THEN** the main process resolves the attachments before invoking Claude Code
- **AND** the prompt sent to Claude Code includes each resolved text body in an attached-text block before the user's typed prompt

#### Scenario: Codex receives long text context
- **WHEN** a Codex chat message includes long text context attachments
- **THEN** the main process resolves the attachments before invoking Codex
- **AND** the prompt sent to Codex includes each resolved text body in an attached-text block before the user's typed prompt

#### Scenario: Attachment cannot be resolved
- **WHEN** the user sends a message with a long text attachment whose local reference cannot be resolved
- **THEN** the runtime is not invoked
- **AND** the user sees a blocking error explaining that the attachment is unavailable

### Requirement: Backward Compatibility
The system SHALL preserve rendering for older pasted-text mention messages while making new sends rely on metadata-backed long text attachments.

#### Scenario: Older message contains pasted mention token
- **WHEN** an existing message contains a legacy `pasted:` or `chatHistory:` mention token
- **THEN** the chat UI continues to render a readable pasted-text or chat-history summary

#### Scenario: New message is sent with pasted text
- **WHEN** the user sends newly staged pasted text
- **THEN** the runtime source of truth is the long text attachment metadata and resolved main-process content
- **AND** the custom mention token is not required for the runtime to receive the text
