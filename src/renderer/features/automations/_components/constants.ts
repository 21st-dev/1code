import type { TranslationKey } from "@/lib/i18n"

// ==============================================================================
// Trigger Options
// ==============================================================================

export const GITHUB_TRIGGER_OPTIONS = [
  { value: "pr_opened", labelKey: "automations.trigger.github.prOpened" as TranslationKey },
  { value: "pr_closed", labelKey: "automations.trigger.github.prClosed" as TranslationKey },
  { value: "pr_merged", labelKey: "automations.trigger.github.prMerged" as TranslationKey },
  { value: "pr_commits_pushed", labelKey: "automations.trigger.github.prCommitsPushed" as TranslationKey },
  { value: "issue_opened", labelKey: "automations.trigger.github.issueOpened" as TranslationKey },
  { value: "issue_closed", labelKey: "automations.trigger.github.issueClosed" as TranslationKey },
  { value: "issue_comment_created", labelKey: "automations.trigger.github.issueCommentCreated" as TranslationKey },
  { value: "branch_created", labelKey: "automations.trigger.github.branchCreated" as TranslationKey },
  { value: "workflow_failed", labelKey: "automations.trigger.github.workflowFailed" as TranslationKey },
] as const

export const LINEAR_TRIGGER_OPTIONS = [
  { value: "linear_issue_created", labelKey: "automations.trigger.linear.issueCreated" as TranslationKey },
  { value: "linear_issue_updated", labelKey: "automations.trigger.linear.issueUpdated" as TranslationKey },
  { value: "linear_label_added", labelKey: "automations.trigger.linear.labelAdded" as TranslationKey },
  { value: "linear_issue_assigned", labelKey: "automations.trigger.linear.issueAssigned" as TranslationKey },
  { value: "linear_comment_created", labelKey: "automations.trigger.linear.commentCreated" as TranslationKey },
  { value: "linear_issue_state_changed", labelKey: "automations.trigger.linear.issueStateChanged" as TranslationKey },
] as const

// ==============================================================================
// Tab Options
// ==============================================================================

export const AUTOMATION_TABS = [
  { value: "active", labelKey: "automations.tab.automations" as TranslationKey },
  { value: "templates", labelKey: "automations.tab.templates" as TranslationKey },
] as const

// ==============================================================================
// Model Options
// ==============================================================================

export const CLAUDE_MODELS = [
  { id: "opus", name: "Opus 4.6" },
  { id: "sonnet", name: "Sonnet 4.6" },
  { id: "haiku", name: "Haiku 4.5" },
] as const
