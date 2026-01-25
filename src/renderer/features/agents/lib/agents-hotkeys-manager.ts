/**
 * Hotkeys manager for Agents
 * Centralized keyboard shortcut handling
 */

import * as React from "react"
import { useCallback, useMemo } from "react"
import {
  AgentActionContext,
  AGENT_ACTIONS,
  executeAgentAction,
  getAvailableAgentActions,
} from "./agents-actions"
import type { SettingsTab, CustomHotkeysConfig } from "../../../lib/atoms"
import { getResolvedHotkey, type ShortcutActionId } from "../../../lib/hotkeys"

// ============================================================================
// ACTION ID MAPPING
// ============================================================================

/**
 * Maps shortcut registry IDs to agent action IDs
 * This allows the shortcut system to work with the existing action system
 */
const SHORTCUT_TO_ACTION_MAP: Record<ShortcutActionId, string> = {
  "show-shortcuts": "open-shortcuts",
  "open-settings": "open-settings",
  "toggle-sidebar": "toggle-sidebar",
  "toggle-details": "toggle-details",
  "undo-archive": "undo-archive",
  "new-workspace": "create-new-agent",
  "search-workspaces": "search-workspaces",
  "archive-workspace": "archive-workspace",
  "quick-switch-workspaces": "quick-switch-workspaces",
  "open-kanban": "open-kanban",
  "new-agent": "create-new-agent",
  "search-chats": "search-chats",
  "search-in-chat": "toggle-chat-search",
  "archive-agent": "archive-agent",
  "quick-switch-agents": "quick-switch-agents",
  "prev-agent": "prev-agent",
  "next-agent": "next-agent",
  "focus-input": "focus-input",
  "toggle-focus": "toggle-focus",
  "stop-generation": "stop-generation",
  "switch-model": "switch-model",
  "toggle-terminal": "toggle-terminal",
  "open-diff": "open-diff",
  "create-pr": "create-pr",
  "voice-input": "voice-input", // Handled directly in chat-input-area.tsx
}

// Reverse mapping: action ID -> shortcut ID
const ACTION_TO_SHORTCUT_MAP: Record<string, ShortcutActionId> = Object.fromEntries(
  Object.entries(SHORTCUT_TO_ACTION_MAP).map(([k, v]) => [v, k as ShortcutActionId])
) as Record<string, ShortcutActionId>

// ============================================================================
// HOTKEY MATCHING
// ============================================================================

/**
 * Parse a hotkey string and match against a keyboard event
 * Supports: "?", "shift+?", "cmd+k", "cmd+shift+i"
 */
function matchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split("+")
  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)

  const needsMeta = modifiers.includes("cmd") || modifiers.includes("meta")
  const needsAlt = modifiers.includes("opt") || modifiers.includes("alt")
  const needsCtrl = modifiers.includes("ctrl")
  let needsShift = modifiers.includes("shift")

  // "?" requires shift implicitly
  if (key === "?" && !modifiers.includes("shift")) {
    needsShift = true
  }

  if (needsMeta !== e.metaKey) return false
  if (needsAlt !== e.altKey) return false
  if (needsCtrl !== e.ctrlKey) return false
  if (needsShift !== e.shiftKey) return false

  const eventKey = e.key.toLowerCase()
  const eventCode = e.code.toLowerCase()

  if (eventKey === key) return true
  if (key === "?" && eventKey === "?") return true
  if (key === "/" && (eventKey === "/" || eventCode === "slash")) return true
  if (key === "\\" && (eventKey === "\\" || eventCode === "backslash")) return true
  if (key === "," && (eventKey === "," || eventCode === "comma")) return true
  if (key.length === 1 && eventCode === `key${key}`) return true

  return false
}

// ============================================================================
// TYPES
// ============================================================================

export interface AgentsHotkeysManagerConfig {
  setSelectedChatId?: (id: string | null) => void
  setSelectedDraftId?: (id: string | null) => void
  setShowNewChatForm?: (show: boolean) => void
  setSidebarOpen?: (open: boolean | ((prev: boolean) => boolean)) => void
  setPreviewOpen?: (open: boolean | ((prev: boolean) => boolean)) => void
  setSettingsDialogOpen?: (open: boolean) => void
  setSettingsActiveTab?: (tab: SettingsTab) => void
  toggleChatSearch?: () => void
  selectedChatId?: string | null
  customHotkeysConfig?: CustomHotkeysConfig
  // Feature flags
  betaKanbanEnabled?: boolean
}

export interface UseAgentsHotkeysOptions {
  enabled?: boolean
  preventDefault?: boolean
}

// Hotkeys that work even in inputs
const GLOBAL_HOTKEYS = new Set(["open-shortcuts"])

// ============================================================================
// HOTKEYS MANAGER HOOK
// ============================================================================

export function useAgentsHotkeys(
  config: AgentsHotkeysManagerConfig,
  options: UseAgentsHotkeysOptions = {},
) {
  const { enabled = true, preventDefault = true } = options

  const createActionContext = useCallback(
    (): AgentActionContext => ({
      setSelectedChatId: config.setSelectedChatId,
      setSelectedDraftId: config.setSelectedDraftId,
      setShowNewChatForm: config.setShowNewChatForm,
      setSidebarOpen: config.setSidebarOpen,
      setSettingsDialogOpen: config.setSettingsDialogOpen,
      setSettingsActiveTab: config.setSettingsActiveTab,
      toggleChatSearch: config.toggleChatSearch,
      selectedChatId: config.selectedChatId,
    }),
    [
      config.setSelectedChatId,
      config.setSelectedDraftId,
      config.setShowNewChatForm,
      config.setSidebarOpen,
      config.setSettingsDialogOpen,
      config.setSettingsActiveTab,
      config.toggleChatSearch,
      config.selectedChatId,
    ],
  )

  const handleHotkeyAction = useCallback(
    async (actionId: string) => {
      const context = createActionContext()
      const availableActions = getAvailableAgentActions(context)
      const action = availableActions.find((a) => a.id === actionId)

      if (!action) return

      await executeAgentAction(actionId, context, "hotkey")
    },
    [createActionContext],
  )

  // Listen for Cmd+N via IPC from main process (menu accelerator)
  React.useEffect(() => {
    if (!enabled) return
    if (!window.desktopApi?.onShortcutNewAgent) return

    const cleanup = window.desktopApi.onShortcutNewAgent(() => {
      console.log("[Hotkey] Cmd+N received via IPC, executing create-new-agent")
      handleHotkeyAction("create-new-agent")
    })

    return cleanup
  }, [enabled, handleHotkeyAction])

  // Get the resolved hotkey for a shortcut, respecting custom bindings
  const getHotkeyForAction = useCallback(
    (shortcutId: ShortcutActionId): string | null => {
      const customConfig = config.customHotkeysConfig || { version: 1, bindings: {} }
      return getResolvedHotkey(shortcutId, customConfig)
    },
    [config.customHotkeysConfig]
  )

  // Unified hotkey listener that respects custom configurations
  React.useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true" ||
        activeElement?.closest('[contenteditable="true"]')

      // Check toggle-sidebar hotkey
      const toggleSidebarHotkey = getHotkeyForAction("toggle-sidebar")
      if (toggleSidebarHotkey && matchesHotkey(e, toggleSidebarHotkey)) {
        e.preventDefault()
        e.stopPropagation()
        handleHotkeyAction("toggle-sidebar")
        return
      }

      // Check show-shortcuts hotkey (only when not in input)
      if (!isInputFocused) {
        const showShortcutsHotkey = getHotkeyForAction("show-shortcuts")
        if (showShortcutsHotkey && matchesHotkey(e, showShortcutsHotkey)) {
          e.preventDefault()
          e.stopPropagation()
          handleHotkeyAction("open-shortcuts")
          return
        }
      }

      // Check open-settings hotkey
      const openSettingsHotkey = getHotkeyForAction("open-settings")
      if (openSettingsHotkey && matchesHotkey(e, openSettingsHotkey)) {
        e.preventDefault()
        e.stopPropagation()
        handleHotkeyAction("open-settings")
        return
      }

      // Check search-in-chat hotkey
      const searchInChatHotkey = getHotkeyForAction("search-in-chat")
      if (searchInChatHotkey && matchesHotkey(e, searchInChatHotkey)) {
        e.preventDefault()
        e.stopPropagation()
        handleHotkeyAction("toggle-chat-search")
        return
      }

      // Check open-kanban hotkey (only if feature is enabled)
      if (config.betaKanbanEnabled) {
        const openKanbanHotkey = getHotkeyForAction("open-kanban")
        if (openKanbanHotkey && matchesHotkey(e, openKanbanHotkey)) {
          e.preventDefault()
          e.stopPropagation()
          handleHotkeyAction("open-kanban")
          return
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [enabled, handleHotkeyAction, getHotkeyForAction, config.betaKanbanEnabled])

  // General hotkey handler for remaining actions
  const actionsWithHotkeys = useMemo(
    () =>
      Object.values(AGENT_ACTIONS).filter(
        (action) =>
          action.hotkey !== undefined &&
          action.id !== "create-new-agent" &&
          action.id !== "toggle-sidebar" &&
          action.id !== "open-shortcuts" &&
          action.id !== "open-settings" &&
          action.id !== "toggle-chat-search" &&
          action.id !== "open-kanban",
      ),
    [],
  )

  const hotkeyMappings = useMemo(() => {
    const mappings: Array<{
      actionId: string
      hotkeys: string[]
      isGlobal: boolean
    }> = []

    for (const action of actionsWithHotkeys) {
      if (!action.hotkey) continue
      const hotkeys = Array.isArray(action.hotkey)
        ? action.hotkey
        : [action.hotkey]
      const isGlobal = GLOBAL_HOTKEYS.has(action.id)
      mappings.push({
        actionId: action.id,
        hotkeys: hotkeys.filter(Boolean) as string[],
        isGlobal,
      })
    }

    return mappings
  }, [actionsWithHotkeys])

  React.useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable

      for (const mapping of hotkeyMappings) {
        if (isInInput && !mapping.isGlobal) continue

        for (const hotkey of mapping.hotkeys) {
          if (matchesHotkey(e, hotkey)) {
            if (preventDefault) {
              e.preventDefault()
              e.stopPropagation()
            }
            handleHotkeyAction(mapping.actionId)
            return
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [enabled, preventDefault, hotkeyMappings, handleHotkeyAction])

  return {
    executeAction: handleHotkeyAction,
    getAvailableActions: () => getAvailableAgentActions(createActionContext()),
    createActionContext,
  }
}
