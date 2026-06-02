## ADDED Requirements

### Requirement: Controlled UI Contribution Manifest

The system SHALL support an optional Locus-native controlled UI contribution manifest that is parsed as static data without executing plugin code.

#### Scenario: Plugin declares controlled UI contributions
- **WHEN** Locus scans a plugin package containing a valid controlled UI contribution manifest
- **THEN** the manifest is parsed in the main process using a strict bounded schema
- **AND** the plugin contribution metadata is included in local review fingerprints
- **AND** no plugin JavaScript, TypeScript, JSX, native module, or runtime hook is executed

#### Scenario: Contribution manifest is invalid
- **WHEN** the contribution manifest is malformed, too large, contains unsupported fields, or declares unsupported surfaces
- **THEN** Locus reports a bounded diagnostic for that plugin
- **AND** does not activate the invalid contribution
- **AND** does not expose raw plugin source code or secret values to the renderer

### Requirement: Controlled UI Eligibility Gate

The system SHALL gate controlled UI contributions through review state, safe mode, runtime ownership, and schema validation before exposing active actions.

#### Scenario: Plugin fingerprint is not reviewed
- **WHEN** a plugin declares controlled UI contributions but its current fingerprint is new, changed, or unreviewed
- **THEN** Locus may show read-only contribution metadata
- **AND** blocks contributed actions
- **AND** explains that local review is required

#### Scenario: Safe mode is enabled
- **WHEN** plugin safe mode is enabled
- **THEN** Locus disables contributed command actions and settings writes
- **AND** may continue showing read-only contribution diagnostics
- **AND** labels the contribution as blocked by safe mode

#### Scenario: Codex cache package declares contributions
- **WHEN** a Codex cache package contains controlled UI contribution metadata
- **THEN** Locus keeps the package read-only
- **AND** does not activate the contribution unless a later approved spec adds a Locus-owned Codex controlled UI primitive

#### Scenario: Renderer submits forged action state
- **WHEN** the renderer invokes a controlled UI action with a plugin key, contribution id, action id, fingerprint, or permission state
- **THEN** the main process re-resolves the current plugin package and contribution manifest
- **AND** recomputes safe mode, review state, controlled UI gate, and action eligibility
- **AND** rejects the invocation if the current main-process gate does not allow it

### Requirement: Locus-Owned Contribution Rendering

The system SHALL render controlled UI contributions with Locus-owned renderer components rather than plugin-provided code or DOM mutations.

#### Scenario: User views a controlled settings section
- **WHEN** a reviewed and eligible plugin contributes a settings section
- **THEN** Settings > Plugins renders the section using app-authored controls
- **AND** every contribution remains visibly tied to its plugin identity and review status
- **AND** the renderer does not evaluate plugin-authored JavaScript, HTML, JSX, event handlers, or DOM patches

#### Scenario: User views a controlled workbench panel
- **WHEN** a reviewed and eligible plugin contributes a workbench panel
- **THEN** Locus renders the panel through an app-owned panel host
- **AND** the panel may display bounded static data and app-provided state only
- **AND** the panel cannot access provider secrets, raw SQLite, Node APIs, shell execution, or arbitrary filesystem paths
- **AND** the panel is not an iframe, webview, plugin React component, plugin CSS injection, or DOM patch

### Requirement: Controlled Command Actions

The system SHALL allow contributed command buttons only when their actions map to explicit Locus-owned allowlisted actions.

#### Scenario: User clicks an insert-draft command button
- **WHEN** a reviewed and eligible plugin contributes a command button with an allowlisted insert-draft action
- **THEN** Locus prepares the declared draft text for the active chat
- **AND** does not send the message automatically
- **AND** does not execute an agent, terminal command, file edit, MCP approval, plugin enablement, or provider operation automatically

#### Scenario: Button declares unsupported action
- **WHEN** a contribution declares an action that is not allowlisted
- **THEN** Locus disables the button
- **AND** reports a Doctor/Debug diagnostic for the unsupported action

### Requirement: Fingerprint-Bound Controlled UI Grants

The system SHALL bind controlled UI permission grants to the current reviewed contribution fingerprint.

#### Scenario: User grants a controlled UI action permission
- **WHEN** a user approves a controlled UI permission for a contribution action or settings field
- **THEN** Locus stores the grant with the plugin review key, contribution id, action or field id, requested permission, and current contribution fingerprint
- **AND** does not treat the grant as valid for a different contribution fingerprint

#### Scenario: Contribution metadata changes after grant
- **WHEN** a plugin contribution manifest changes after a grant was stored
- **THEN** Locus treats the previous grant as stale
- **AND** blocks controlled action invocation until the current fingerprint is reviewed and the required permission is granted again
- **AND** reports the stale grant in Doctor/Debug without exposing plugin source code or secrets
