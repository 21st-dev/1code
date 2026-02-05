// ==============================================================================
// Trigger Options
// ==============================================================================

export const GITHUB_TRIGGER_OPTIONS = [
  { value: "pr_opened", label: "Pull Request Opened" },
  { value: "pr_closed", label: "Pull Request Closed" },
  { value: "pr_merged", label: "Pull Request Merged" },
  { value: "pr_commits_pushed", label: "Pull Request Commits Pushed" },
  { value: "issue_opened", label: "Issue Opened" },
  { value: "issue_closed", label: "Issue Closed" },
  { value: "issue_comment_created", label: "Issue Comment Created" },
  { value: "branch_created", label: "Branch or Tag Created" },
  { value: "workflow_failed", label: "GitHub Action Run Failed" },
] as const

export const LINEAR_TRIGGER_OPTIONS = [
  { value: "linear_issue_created", label: "Issue Created" },
  { value: "linear_issue_updated", label: "Issue Updated" },
  { value: "linear_label_added", label: "Label Added to Issue" },
  { value: "linear_issue_assigned", label: "Issue Assigned" },
  { value: "linear_comment_created", label: "Comment Created" },
  { value: "linear_issue_state_changed", label: "Issue State Changed" },
] as const

// ==============================================================================
// Tab Options
// ==============================================================================

export const AUTOMATION_TABS = [
  { value: "active", label: "Automations" },
  { value: "templates", label: "Templates" },
] as const

// ==============================================================================
// Model Options
// ==============================================================================

export const CLAUDE_MODELS = [
  { id: "opus", name: "Opus 4.6" },
  { id: "sonnet", name: "Sonnet 4.5" },
  { id: "haiku", name: "Haiku 4.5" },
] as const
