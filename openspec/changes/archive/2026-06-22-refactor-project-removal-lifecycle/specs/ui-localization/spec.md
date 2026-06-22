## MODIFIED Requirements
### Requirement: Quick Chat And Sidebar Localization
All user-facing strings introduced for quick chat, the assistant composer, project-grouped navigation, project entry points, delete/clear actions, and project lifecycle actions SHALL be localized in English and Simplified Chinese.

#### Scenario: New strings ship in both locales
- **WHEN** a new string is added for quick chat, assistant mode, "Open a Project",
  "Attach a Project", per-project "New Workspace", "New Quick chat",
  "permanent delete", "clear archive", "Remove from Projects list",
  "Restore Project", "Delete Project History", removed-project history, or
  project lifecycle blockers
- **THEN** the string is present in both the English and Simplified Chinese
  dictionaries
- **AND** the second tree level is displayed as "工作区", folderless chats as
  "快速对话", and project-history deletion as "删除项目历史" in Simplified Chinese

#### Scenario: Confirmation copy is localized
- **WHEN** a delete confirmation is shown for a code workspace with uncommitted
  changes, an open PR, or project-history deletion
- **THEN** the confirmation copy is available in both English and Simplified
  Chinese
- **AND** destructive project-history confirmation copy includes localized counts
  for affected chats and worktrees
- **AND** non-destructive remove-from-list confirmation copy says retained chats
  and repository files are not deleted
