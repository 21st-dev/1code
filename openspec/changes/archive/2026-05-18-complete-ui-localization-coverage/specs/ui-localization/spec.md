## ADDED Requirements

### Requirement: Common Product Surface Localization Coverage
The system SHALL localize app-authored renderer copy in common product surfaces once those surfaces are migrated to the localization layer.

#### Scenario: User navigates common product surfaces in Simplified Chinese
- **WHEN** the user selects Simplified Chinese
- **AND** opens onboarding, Settings, chat sidebars, chat controls, changes/diff controls, file viewer controls, terminal controls, or shared app dialogs
- **THEN** migrated app-authored labels, buttons, placeholders, tooltips, dialog copy, and toast shells render in Simplified Chinese
- **AND** professional developer-tool terms remain in English according to the terminology policy

#### Scenario: User navigates common product surfaces in English
- **WHEN** the user selects English
- **AND** opens migrated product surfaces
- **THEN** app-authored UI copy renders in English

### Requirement: Localization Audit Boundary
The system SHALL maintain a repeatable audit boundary for hardcoded renderer text.

#### Scenario: Developer audits remaining English strings
- **WHEN** a developer runs the hardcoded-string sweep over renderer TS and TSX files
- **THEN** remaining hits are either migrated to dictionary keys or classified as intentional exclusions
- **AND** intentional exclusions include technical terms, product/provider names, raw/user/generated content, commands, paths, diffs, logs, debug metadata, or low-level base component labels

## MODIFIED Requirements

### Requirement: Incremental Migration
The system SHALL allow newly added or specialized feature areas to migrate to localization incrementally while preserving existing behavior, after common product surfaces have been migrated.

#### Scenario: Newly added or specialized component renders before migration
- **WHEN** a new, experimental, debug-only, or specialized component has not yet been migrated to the localization layer
- **THEN** it continues to render its existing UI without blocking app behavior
- **AND** migrated common product surfaces continue to use the selected language
