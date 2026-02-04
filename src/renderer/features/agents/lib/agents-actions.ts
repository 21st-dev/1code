/**
 * Centralized action system for Agents
 * Actions can be triggered via hotkeys or UI buttons
 */

import type { SettingsTab } from "../../../lib/atoms"

// ============================================================================
// TYPES
// ============================================================================

export type AgentActionSource = "hotkey" | "ui_button" | "context-menu"

export type AgentActionCategory = "general" | "navigation" | "chat" | "view"

export interface AgentActionContext {
  // Navigation
  setSelectedChatId?: (id: string | null) => void
  setSelectedDraftId?: (id: string | null) => void
  setShowNewChatForm?: (show: boolean) => void

  // UI states
  setSidebarOpen?: (open: boolean | ((prev: boolean) => boolean)) => void
  setSettingsActiveTab?: (tab: SettingsTab) => void
  setFileSearchDialogOpen?: (open: boolean) => void
  toggleChatSearch?: () => void

  // Data
  selectedChatId?: string | null
}

export interface AgentActionResult {
  success: boolean
  error?: string
}

export type AgentActionHandler = (
  context: AgentActionContext,
  source: AgentActionSource,
) => Promise<AgentActionResult> | AgentActionResult

export interface AgentActionDefinition {
  id: string
  label: string
  description?: string
  category: AgentActionCategory
  hotkey?: string | string[]
  handler: AgentActionHandler
  isAvailable?: (context: AgentActionContext) => boolean
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

const openShortcutsAction: AgentActionDefinition = {
  id: "open-shortcuts",
  label: "Keyboard shortcuts",
  description: "Show all keyboard shortcuts",
  category: "general",
  hotkey: "?",
  handler: async (context) => {
    // Open settings page on Keyboard tab
    // Settings are now opened via the icon bar drawer system
    context.setSettingsActiveTab?.("keyboard")
    context.setSidebarOpen?.(true)
    // Note: Settings drawer is now controlled by the icon bar
    return { success: true }
  },
}

const createNewAgentAction: AgentActionDefinition = {
  id: "create-new-agent",
  label: "New workspace",
  description: "Create a new workspace",
  category: "general",
  hotkey: "cmd+n",
  handler: async (context) => {
    console.log("[Action] create-new-agent handler called")
    // Clear selected chat
    context.setSelectedChatId?.(null)
    // Clear selected draft so form starts empty
    context.setSelectedDraftId?.(null)
    // Explicitly show new chat form
    context.setShowNewChatForm?.(true)
    return { success: true }
  },
}

const openSettingsAction: AgentActionDefinition = {
  id: "open-settings",
  label: "Settings",
  description: "Open settings page",
  category: "general",
  hotkey: ["cmd+,", "ctrl+,"],
  handler: async (context) => {
    // Settings are now opened via the icon bar drawer system
    context.setSettingsActiveTab?.("preferences")
    context.setSidebarOpen?.(true)
    // Note: Settings drawer is now controlled by the icon bar
    return { success: true }
  },
}

const toggleSidebarAction: AgentActionDefinition = {
  id: "toggle-sidebar",
  label: "Toggle sidebar",
  description: "Show/hide left sidebar",
  category: "view",
  hotkey: ["cmd+\\", "ctrl+\\"],
  handler: async (context) => {
    context.setSidebarOpen?.((prev) => !prev)
    return { success: true }
  },
}

const toggleChatSearchAction: AgentActionDefinition = {
  id: "toggle-chat-search",
  label: "Search messages",
  description: "Search through chat history",
  category: "view",
  hotkey: ["cmd+f", "ctrl+f"],
  handler: async (context) => {
    context.toggleChatSearch?.()
    return { success: true }
  },
}

const openKanbanAction: AgentActionDefinition = {
  id: "open-kanban",
  label: "Open Kanban board",
  description: "Open the Kanban board view",
  category: "view",
  hotkey: "cmd+shift+k",
  handler: async (context) => {
    // Clear selected chat, draft, and new form state to show Kanban view
    context.setSelectedChatId?.(null)
    context.setSelectedDraftId?.(null)
    context.setShowNewChatForm?.(false)
    return { success: true }
  },
}

const openAutomationsAction: AgentActionDefinition = {
  id: "open-automations",
  label: "Automations",
  description: "Open automations page",
  category: "navigation",
  handler: async (context) => {
    // Automations are now opened via the icon bar drawer system
    context.setSelectedChatId?.(null)
    context.setSelectedDraftId?.(null)
    context.setShowNewChatForm?.(false)
    // Note: Automations drawer is now controlled by the icon bar
    return { success: true }
  },
}

const openInEditorAction: AgentActionDefinition = {
  id: "open-in-editor",
  label: "Open in editor",
  description: "Open worktree in preferred editor",
  category: "general",
  hotkey: "cmd+o",
  handler: async () => {
    // Handled by the info-section component via event dispatch
    window.dispatchEvent(new CustomEvent("open-in-editor"))
    return { success: true }
  },
}

const openInboxAction: AgentActionDefinition = {
  id: "open-inbox",
  label: "Inbox",
  description: "Open inbox",
  category: "navigation",
  handler: async (context) => {
    // Inbox is now opened via the icon bar drawer system
    context.setSelectedChatId?.(null)
    context.setSelectedDraftId?.(null)
    context.setShowNewChatForm?.(false)
    // Note: Inbox drawer is now controlled by the icon bar
    return { success: true }
  },
}

const openFileInEditorAction: AgentActionDefinition = {
  id: "open-file-in-editor",
  label: "Open file in editor",
  description: "Open currently previewed file in preferred editor",
  category: "general",
  hotkey: "cmd+shift+o",
  handler: async () => {
    window.dispatchEvent(new CustomEvent("open-file-in-editor"))
    return { success: true }
  },
}

const fileSearchAction: AgentActionDefinition = {
  id: "file-search",
  label: "Go to file",
  description: "Search and open a file in the workspace",
  category: "navigation",
  hotkey: "cmd+p",
  handler: async (context) => {
    context.setFileSearchDialogOpen?.(true)
    return { success: true }
  },
}

// ============================================================================
// ACTION REGISTRY
// ============================================================================

export const AGENT_ACTIONS: Record<string, AgentActionDefinition> = {
  "open-shortcuts": openShortcutsAction,
  "create-new-agent": createNewAgentAction,
  "open-settings": openSettingsAction,
  "toggle-sidebar": toggleSidebarAction,
  "toggle-chat-search": toggleChatSearchAction,
  "open-kanban": openKanbanAction,
  "open-automations": openAutomationsAction,
  "open-inbox": openInboxAction,
  "open-in-editor": openInEditorAction,
  "open-file-in-editor": openFileInEditorAction,
  "file-search": fileSearchAction,
}

export function getAgentAction(id: string): AgentActionDefinition | undefined {
  return AGENT_ACTIONS[id]
}

export function getAvailableAgentActions(
  context: AgentActionContext,
): AgentActionDefinition[] {
  return Object.values(AGENT_ACTIONS).filter((action) => {
    if (action.isAvailable) {
      return action.isAvailable(context)
    }
    return true
  })
}

export async function executeAgentAction(
  actionId: string,
  context: AgentActionContext,
  source: AgentActionSource,
): Promise<AgentActionResult> {
  const action = AGENT_ACTIONS[actionId]

  if (!action) {
    return { success: false, error: `Action ${actionId} not found` }
  }

  if (action.isAvailable && !action.isAvailable(context)) {
    return { success: false, error: `Action ${actionId} not available` }
  }

  try {
    return await action.handler(context, source)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
