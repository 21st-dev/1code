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
import type { SettingsTab } from "../../../lib/atoms"

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
  setSidebarOpen?: (open: boolean | ((prev: boolean) => boolean)) => void
  setSettingsDialogOpen?: (open: boolean) => void
  setSettingsActiveTab?: (tab: SettingsTab) => void
  setShortcutsDialogOpen?: (open: boolean) => void
  toggleChatSearch?: () => void
  selectedChatId?: string | null
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
      setSidebarOpen: config.setSidebarOpen,
      setSettingsDialogOpen: config.setSettingsDialogOpen,
      setSettingsActiveTab: config.setSettingsActiveTab,
      setShortcutsDialogOpen: config.setShortcutsDialogOpen,
      toggleChatSearch: config.toggleChatSearch,
      selectedChatId: config.selectedChatId,
    }),
    [
      config.setSelectedChatId,
      config.setSidebarOpen,
      config.setSettingsDialogOpen,
      config.setSettingsActiveTab,
      config.setShortcutsDialogOpen,
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

  // Direct listener for Cmd+\ - toggle sidebar
  React.useEffect(() => {
    if (!enabled) return

    const handleToggleSidebar = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "\\" || e.code === "Backslash") &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleHotkeyAction("toggle-sidebar")
      }
    }

    window.addEventListener("keydown", handleToggleSidebar, true)
    return () => window.removeEventListener("keydown", handleToggleSidebar, true)
  }, [enabled, handleHotkeyAction])

  // Direct listener for ? - open shortcuts
  React.useEffect(() => {
    if (!enabled) return

    const handleShortcuts = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true" ||
        activeElement?.closest('[contenteditable="true"]')

      if (
        !isInputFocused &&
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleHotkeyAction("open-shortcuts")
      }
    }

    window.addEventListener("keydown", handleShortcuts, true)
    return () => window.removeEventListener("keydown", handleShortcuts, true)
  }, [enabled, handleHotkeyAction])

  // Direct listener for Cmd+, - open settings
  React.useEffect(() => {
    if (!enabled) return

    const handleSettings = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.code === "Comma" &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleHotkeyAction("open-settings")
      }
    }

    window.addEventListener("keydown", handleSettings, true)
    return () => window.removeEventListener("keydown", handleSettings, true)
  }, [enabled, handleHotkeyAction])

  // Direct listener for Cmd+F - toggle chat search
  React.useEffect(() => {
    if (!enabled) return

    const handleChatSearch = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "f" &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleHotkeyAction("toggle-chat-search")
      }
    }

    window.addEventListener("keydown", handleChatSearch, true)
    return () => window.removeEventListener("keydown", handleChatSearch, true)
  }, [enabled, handleHotkeyAction])

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
          action.id !== "toggle-chat-search",
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
