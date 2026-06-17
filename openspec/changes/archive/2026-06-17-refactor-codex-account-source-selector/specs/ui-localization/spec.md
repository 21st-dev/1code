## MODIFIED Requirements

### Requirement: Common Product Surface Localization Coverage
The system SHALL localize app-authored renderer copy in common product surfaces once those surfaces are migrated to the localization layer.

#### Scenario: User navigates common product surfaces in Simplified Chinese
- **WHEN** the user selects Simplified Chinese
- **AND** opens onboarding, Settings, chat sidebars, chat controls, changes/diff controls, file viewer controls, terminal controls, shared app dialogs, or Codex account/model selection controls
- **THEN** migrated app-authored labels, buttons, placeholders, tooltips, dialog copy, and toast shells render in Simplified Chinese
- **AND** professional developer-tool terms remain in English according to the terminology policy
- **AND** provider names, model IDs, protocol names, URLs, commands, and raw diagnostics remain unchanged

#### Scenario: User navigates common product surfaces in English
- **WHEN** the user selects English
- **AND** opens migrated product surfaces
- **THEN** app-authored UI copy renders in English
