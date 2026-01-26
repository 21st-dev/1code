/**
 * Unique identifier for each configurable shortcut action
 */
export type ShortcutActionId =
  // General
  | "show-shortcuts"
  | "open-settings"
  | "toggle-sidebar"
  | "toggle-details"
  | "undo-archive"
  // Workspaces
  | "new-workspace"
  | "search-workspaces"
  | "archive-workspace"
  | "quick-switch-workspaces"
  // Agents
  | "new-agent"
  | "search-chats"
  | "search-in-chat"
  | "archive-agent"
  | "quick-switch-agents"
  | "prev-agent"
  | "next-agent"
  | "focus-input"
  | "toggle-focus"
  | "stop-generation"
  | "switch-model"
  | "toggle-terminal"
  | "open-diff"
  | "create-pr"

/**
 * Category for organizing shortcuts in the UI
 */
export type ShortcutCategory = "general" | "workspaces" | "agents"

/**
 * Definition of a configurable shortcut action
 */
export interface ShortcutAction {
  id: ShortcutActionId
  label: string
  category: ShortcutCategory
  /** Default key combination, e.g., ["cmd", "N"] or ["?"] */
  defaultKeys: string[]
  /** Alternative key combination shown with "or", e.g., ["cmd", "]"] */
  altKeys?: string[]
  /** If true, this shortcut's keys are dynamic based on preferences */
  isDynamic?: boolean
  /** Description for dynamic shortcuts explaining what controls them */
  dynamicDescription?: string
}

/**
 * Storage structure for custom hotkey overrides
 * Stored in localStorage
 */
export interface CustomHotkeysConfig {
  version: 1
  /** Map of actionId to custom hotkey string (e.g., "cmd+shift+n") or null for default */
  bindings: Record<string, string | null>
}

/**
 * Conflict information for a shortcut
 */
export interface ShortcutConflict {
  actionId: ShortcutActionId
  conflictingActionIds: ShortcutActionId[]
  hotkey: string
}
