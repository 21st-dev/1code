## ADDED Requirements

### Requirement: Quick Chat Details Inspector Scope
If a Details inspector is shown for a folderless quick chat, it SHALL be limited to runtime-relevant, non-repository widgets, consistent with the quick-chat surface scope.

#### Scenario: Only runtime-relevant widgets in a quick chat Details inspector
- **WHEN** a Details inspector is shown for a folderless quick chat
- **THEN** only runtime-relevant non-repository widgets (such as usage, trace, and error) are allowed
- **AND** repository surfaces (info, diff, terminal, mcp, plan, browser, file) are not shown

#### Scenario: Quick chat Details is optional
- **WHEN** a folderless quick chat is active
- **THEN** this scope does not by itself require showing a Details inspector
- **AND** it only constrains the content if one is shown
