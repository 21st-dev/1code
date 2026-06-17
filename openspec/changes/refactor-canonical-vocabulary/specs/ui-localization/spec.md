## MODIFIED Requirements

### Requirement: Quick Chat And Sidebar Localization
All user-facing strings introduced for quick chat, the assistant composer, project-grouped navigation, project entry points, and delete/clear actions SHALL be localized in English and Simplified Chinese.

#### Scenario: New strings ship in both locales
- **WHEN** a new string is added for quick chat, assistant mode, "Open a Project", "Attach a Project", per-project "New Workspace", "New Quick chat", "permanent delete", or "clear archive"
- **THEN** the string is present in both the English and Simplified Chinese dictionaries
- **AND** the second tree level is displayed as "工作区" and folderless chats as "快速对话" in Simplified Chinese

#### Scenario: Confirmation copy is localized
- **WHEN** a delete confirmation is shown for a code workspace with uncommitted changes or an open PR
- **THEN** the confirmation copy is available in both English and Simplified Chinese
