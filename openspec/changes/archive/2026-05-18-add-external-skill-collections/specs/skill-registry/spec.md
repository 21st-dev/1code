## ADDED Requirements
### Requirement: External Skill Collections
The system SHALL allow the bundled skill registry to list external skill collections that are browse-only and not treated as verified installable skill packages.

#### Scenario: User views an external collection
- **WHEN** the user opens Settings > Skills and browses the registry
- **THEN** the app may show external collections alongside installable registry skills
- **AND** each external collection shows its source link and install guidance
- **AND** the app does not show install, update, restore, or rollback actions for that collection
