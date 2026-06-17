## ADDED Requirements

### Requirement: Codex Account Source Selection
The Codex chat UI SHALL expose first-party account source selection separately from concrete model selection.

#### Scenario: User selects Codex account source
- **WHEN** the user configures a first-party Codex run
- **THEN** the UI shows ChatGPT account and OpenAI API key as account source choices outside the concrete model option list
- **AND** the model picker does not present first-party account sources as model rows
- **AND** saved provider profiles remain separate provider choices rather than first-party account source choices

#### Scenario: User selects Codex model
- **WHEN** the user opens the Codex model picker
- **THEN** concrete OpenAI model rows are grouped and labeled as model choices
- **AND** model rows do not change the selected first-party account source except through an explicit compatibility flow

### Requirement: Codex Source And Model Compatibility
The Codex chat UI SHALL keep first-party account source and model selection compatible before a run starts.

#### Scenario: API key source is selected
- **WHEN** OpenAI API key source is active
- **AND** a Codex model is available only through ChatGPT account source
- **THEN** the UI disables, filters, or requires confirmation before selecting that model
- **AND** the user sees a concise explanation that the model requires ChatGPT account source

#### Scenario: Selected model becomes incompatible
- **WHEN** the selected model is not supported by the newly selected account source
- **THEN** the UI resolves the mismatch before send by switching to a compatible model or asking the user to choose one
- **AND** the run request does not start with an incompatible first-party source/model pair

#### Scenario: Provider profile source is selected
- **WHEN** a Codex provider profile is selected
- **THEN** provider-profile compatibility continues to use provider-profile runtime target and diagnostic rules
- **AND** the first-party ChatGPT/API-key source control does not overwrite the provider-profile source silently
