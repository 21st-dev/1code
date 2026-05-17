## ADDED Requirements

### Requirement: Optional Embedded Utility Model
The system SHALL provide an optional embedded local utility model capability for bounded helper text generation.

#### Scenario: User has not enabled local utility model
- **WHEN** the app starts without an installed or enabled local utility model
- **THEN** existing utility flows continue to work through Ollama, configured API providers, or deterministic fallbacks
- **AND** the app does not start a local model sidecar

#### Scenario: User enables local utility model
- **WHEN** the user enables `Local Utility Model`
- **THEN** the app presents a recommended setup path
- **AND** the app does not download model files until the user explicitly starts the download

### Requirement: User-Controlled Model Installation
The system SHALL install embedded model files only through explicit user-controlled actions with visible source, size, license, and integrity metadata.

#### Scenario: User views recommended model
- **WHEN** the user opens the local utility model settings
- **THEN** the app shows the recommended model name, approximate size, source, and license
- **AND** the app shows whether the model is installed

#### Scenario: User downloads model
- **WHEN** the user starts a model download
- **THEN** the app downloads the model into app-managed local storage
- **AND** verifies the model hash before marking it installed

#### Scenario: Model verification fails
- **WHEN** the downloaded model hash does not match the catalog hash
- **THEN** the app rejects the model
- **AND** does not run the model
- **AND** offers a retry or cleanup path

#### Scenario: User deletes installed model
- **WHEN** the user deletes an installed local utility model
- **THEN** the app stops any running sidecar for that model
- **AND** removes the model file and installed metadata from app-managed storage

### Requirement: Sidecar Runtime Isolation
The system SHALL run embedded model inference through a main-process-owned local sidecar with renderer-safe boundaries.

#### Scenario: Utility generation starts sidecar
- **WHEN** a supported utility generation request needs the embedded model
- **AND** a verified model is installed and enabled
- **THEN** the main process starts the sidecar on `127.0.0.1`
- **AND** uses a dynamic local port
- **AND** mediates generation through main-process APIs

#### Scenario: App exits
- **WHEN** the app quits
- **THEN** the main process stops any running embedded model sidecar

#### Scenario: Sidecar exceeds request limits
- **WHEN** a generation request exceeds the configured timeout or output limit
- **THEN** the app cancels or rejects that request
- **AND** falls back according to the utility routing policy

### Requirement: Utility-Only Routing
The system SHALL use the embedded model only for approved utility-generation purposes and SHALL NOT route main agent chats through it.

#### Scenario: Sub-chat title generation
- **WHEN** the app generates a sub-chat title
- **AND** the local utility model is installed and enabled
- **THEN** the app attempts embedded local generation before non-embedded fallbacks

#### Scenario: Commit message generation
- **WHEN** the app generates a commit message
- **AND** the local utility model is installed and enabled
- **THEN** the app may attempt embedded local generation for the selected diff context
- **AND** continues to apply commit-message output validation before returning the result

#### Scenario: Main agent chat starts
- **WHEN** the user starts a Claude, Codex, custom-provider, or Ollama-backed agent chat
- **THEN** the embedded utility model is not used as the main agent runtime

### Requirement: Simple Model Choice
The system SHALL make model selection simple for normal users while allowing advanced users to select a compatible custom model file.

#### Scenario: Normal user configures local utility model
- **WHEN** the user opens local utility model settings
- **THEN** the recommended model is the primary action
- **AND** the user is not required to understand model formats, quantization levels, or runtime flags to proceed

#### Scenario: Advanced user selects custom model
- **WHEN** the user chooses the advanced custom model path
- **THEN** the app allows selecting a compatible GGUF model file
- **AND** stores the custom model choice locally
- **AND** uses the same sidecar safety limits as catalog models

### Requirement: Local-First Disclosure and Fallbacks
The system SHALL clearly preserve local-first expectations and disclose when a fallback may send utility context to a configured API provider.

#### Scenario: Embedded generation succeeds
- **WHEN** the embedded model completes a utility generation request
- **THEN** the utility prompt and result remain local to the device
- **AND** the app does not call a configured API provider for that request

#### Scenario: Embedded and Ollama generation are unavailable
- **WHEN** the embedded model and Ollama are unavailable or fail
- **AND** a purpose-specific API provider is configured
- **THEN** the app may fall back to that provider
- **AND** the settings copy discloses that relevant utility context may be sent to that provider

#### Scenario: All model providers fail
- **WHEN** embedded generation, Ollama, and configured API provider generation all fail
- **THEN** the app uses the existing deterministic fallback for that utility flow
