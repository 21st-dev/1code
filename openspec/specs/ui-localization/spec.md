# ui-localization Specification

## Purpose
TBD - created by archiving change add-bilingual-ui. Update Purpose after archive.
## Requirements
### Requirement: Bilingual Interface Language
The system SHALL provide English and Simplified Chinese UI language support for app-authored renderer interface text.

#### Scenario: User selects Simplified Chinese
- **WHEN** the user changes the app language to Simplified Chinese
- **THEN** migrated app-authored UI labels, buttons, placeholders, tooltips, dialogs, and toast shells render in Simplified Chinese
- **AND** professional developer-tool terms remain in English according to the terminology policy

#### Scenario: User selects English
- **WHEN** the user changes the app language to English
- **THEN** migrated app-authored UI text renders in English

### Requirement: Persisted Language Preference
The system SHALL persist the selected language preference locally.

#### Scenario: App restarts after language selection
- **WHEN** the user selects a language preference and restarts the app
- **THEN** the app restores that preference without requiring sign-in or network access

#### Scenario: System language default
- **WHEN** the language preference is `system`
- **THEN** the app resolves to Simplified Chinese for Chinese system locales
- **AND** resolves to English for other system locales

### Requirement: Translation Fallback
The system SHALL fall back to English for missing translation keys.

#### Scenario: Chinese dictionary is missing a key
- **WHEN** the active language is Simplified Chinese
- **AND** a migrated UI string is not available in the Simplified Chinese dictionary
- **THEN** the app displays the English string instead of an empty or broken label

### Requirement: Non-Translated Content Boundaries
The system SHALL NOT translate user-authored content, AI-generated content, commands, file paths, git diffs, raw tool output, or raw external error messages.

#### Scenario: Agent returns a message
- **WHEN** an agent response is displayed in the chat
- **THEN** the response body is shown exactly as received
- **AND** only surrounding app-authored UI controls or status labels may be localized

#### Scenario: Terminal output is displayed
- **WHEN** terminal output, command text, or file paths are shown
- **THEN** those values are shown exactly as produced
- **AND** only surrounding app-authored UI labels may be localized

### Requirement: Incremental Migration
The system SHALL allow feature areas to migrate to localization incrementally while preserving existing behavior.

#### Scenario: Unmigrated component renders
- **WHEN** a component has not yet been migrated to the localization layer
- **THEN** it continues to render its existing English UI
- **AND** migrated components continue to use the selected language
