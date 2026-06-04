# voice-input Specification

## Purpose
TBD - created by archiving change extract-reusable-voice-input. Update Purpose after archive.
## Requirements
### Requirement: Reusable Voice Input Orchestration
The system SHALL provide a reusable renderer voice input hook that coordinates recording, transcription, short-recording rejection, and transcribed-text delivery without depending on a specific chat editor.

#### Scenario: Text delivery callback
- **WHEN** a consumer starts and stops a valid recording
- **AND** the configured transcription function returns non-empty text
- **THEN** the hook SHALL deliver the cleaned text through a consumer-provided callback.

#### Scenario: Optional voice availability
- **WHEN** voice transcription is not configured or not available
- **THEN** consumers SHALL be able to hide or disable voice input without blocking text input.

### Requirement: Reusable Voice Input Control
The system SHALL provide a reusable renderer voice input control component that represents idle, recording, and transcribing states and delegates start, stop, and cancel actions to callbacks.

#### Scenario: Push-to-talk stop race
- **WHEN** a pointer release occurs before MediaRecorder startup has fully settled
- **THEN** the control and hook SHALL still request stop through the shared voice input flow instead of dropping the event.

### Requirement: Main-Process Transcription Service
The system SHALL expose provider-agnostic transcription helpers outside the tRPC router while keeping credentials and provider requests in the main process.

#### Scenario: Router remains thin
- **WHEN** the renderer requests transcription
- **THEN** the tRPC router SHALL validate input, resolve the configured voice transcription provider, and call the shared main-process transcription service.

#### Scenario: Secret-safe operation
- **WHEN** transcription fails
- **THEN** the system SHALL NOT log provider response bodies, transcript text, or provider tokens.

