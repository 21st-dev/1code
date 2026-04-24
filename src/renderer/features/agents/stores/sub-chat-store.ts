import { create } from "zustand"
import { useMessageQueueStore } from "./message-queue-store"
import { useStreamingStatusStore } from "./streaming-status-store"
import { agentChatStore } from "./agent-chat-store"
import { getWindowId } from "../../../contexts/WindowContext"
import { clearTaskSnapshotCache } from "../ui/agent-task-tools"
import { clearSubChatRuntimeCaches } from "./sub-chat-runtime-cleanup"
import { getDefaultRatios, addPaneRatio, removePaneRatio } from "../atoms"
import { trpcClient } from "../../../lib/trpc"

export const MAX_SPLIT_PANES = 4

/**
 * Whether a sub-chat can be added to split via drag-and-drop.
 * Mirrors the guards in `addToSplit`; used by droppables to skip the
 * "drop would silently do nothing" case so no hover highlight shows.
 */
export function canAddToSplit(
  state: Pick<
    AgentSubChatStore,
    "activeSubChatId" | "splitPaneIds"
  >,
  subChatId: string,
): boolean {
  if (state.splitPaneIds.includes(subChatId)) return false
  if (state.splitPaneIds.length >= MAX_SPLIT_PANES) return false
  if (state.splitPaneIds.length === 0) {
    // Need an active tab to pair with the dragged one.
    if (!state.activeSubChatId) return false
    if (subChatId === state.activeSubChatId) return false
  }
  return true
}

export interface SubChatMeta {
  id: string
  name: string
  created_at?: string
  updated_at?: string
  mode?: "plan" | "agent"
}

interface AgentSubChatStore {
  // Current parent chat context
  chatId: string | null

  // State
  activeSubChatId: string | null // Currently selected tab
  openSubChatIds: string[] // Open tabs (preserves order)
  pinnedSubChatIds: string[] // Pinned sub-chats
  allSubChats: SubChatMeta[] // All sub-chats for history
  splitPaneIds: string[] // Ordered IDs of panes in split group (empty = no split)
  splitRatios: number[] // Per-pane width ratios summing to 1.0

  // Actions
  setChatId: (chatId: string | null) => void
  setActiveSubChat: (subChatId: string) => void
  setOpenSubChats: (subChatIds: string[]) => void
  addToOpenSubChats: (subChatId: string) => void
  removeFromOpenSubChats: (subChatId: string) => void
  togglePinSubChat: (subChatId: string) => void
  setAllSubChats: (subChats: SubChatMeta[]) => void
  addToAllSubChats: (subChat: SubChatMeta) => void
  updateSubChatName: (subChatId: string, name: string) => void
  updateSubChatMode: (subChatId: string, mode: "plan" | "agent") => void
  updateSubChatTimestamp: (subChatId: string) => void
  addToSplit: (subChatId: string, explicitFirstPane?: string) => void
  removeFromSplit: (subChatId: string) => void
  closeSplit: () => void
  setSplitRatios: (ratios: number[]) => void
  initSplitFromWindow: (paneIds: string[]) => void
  reset: () => void
}

// localStorage helpers - store open tabs, active tab, and pinned tabs
// Prefixed with windowId to isolate state per Electron window
const getStorageKey = (chatId: string, type: "open" | "active" | "pinned" | "split" | "splitOrigin" | "splitPanes" | "splitRatios") =>
  `${getWindowId()}:agent-${type}-sub-chats-${chatId}`

const getLegacyStorageKey = (chatId: string, type: "open" | "active" | "pinned" | "split" | "splitOrigin" | "splitPanes" | "splitRatios") =>
  `agent-${type}-sub-chats-${chatId}`

// Custom event for notifying other components when open sub-chats change
export const OPEN_SUB_CHATS_CHANGE_EVENT = "open-sub-chats-change"

// Debounce timer to avoid rapid-fire events
let openSubChatsChangeTimer: ReturnType<typeof setTimeout> | null = null

const saveToLS = (chatId: string, type: "open" | "active" | "pinned" | "split" | "splitOrigin" | "splitPanes" | "splitRatios", value: unknown) => {
  if (typeof window === "undefined") return
  localStorage.setItem(getStorageKey(chatId, type), JSON.stringify(value))
  // Dispatch debounced event when open sub-chats change so sidebar can update
  if (type === "open") {
    if (openSubChatsChangeTimer) clearTimeout(openSubChatsChangeTimer)
    openSubChatsChangeTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SUB_CHATS_CHANGE_EVENT))
      openSubChatsChangeTimer = null
    }, 50)
  }
}

// Find data from old numeric window IDs (e.g., "1:agent-open-sub-chats-xxx")
const findNumericWindowIdValue = (legacyKey: string, targetKey: string): string | null => {
  // Only migrate for "main" window
  if (!targetKey.startsWith("main:")) return null

  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey) continue

    // Check if this key matches pattern: <number>:<legacyKey>
    const match = storageKey.match(/^(\d+):(.+)$/)
    if (match && match[2] === legacyKey) {
      const value = localStorage.getItem(storageKey)
      if (value !== null) {
        console.log(`[SubChatStore] Migrated from numeric ID: ${storageKey} to ${targetKey}`)
        return value
      }
    }
  }
  return null
}

const loadFromLS = <T>(chatId: string, type: "open" | "active" | "pinned" | "split" | "splitOrigin" | "splitPanes" | "splitRatios", fallback: T): T => {
  if (typeof window === "undefined") return fallback
  try {
    const key = getStorageKey(chatId, type)
    let stored = localStorage.getItem(key)

    // Migration 1: check for old numeric window ID keys
    if (stored === null) {
      const legacyKey = getLegacyStorageKey(chatId, type)
      const numericValue = findNumericWindowIdValue(legacyKey, key)
      if (numericValue !== null) {
        localStorage.setItem(key, numericValue)
        stored = numericValue
      }
    }

    // Migration 2: check legacy key if window-scoped key doesn't exist
    if (stored === null) {
      const legacyKey = getLegacyStorageKey(chatId, type)
      const legacyStored = localStorage.getItem(legacyKey)
      if (legacyStored !== null) {
        // Migrate to window-scoped key
        localStorage.setItem(key, legacyStored)
        stored = legacyStored
        console.log(`[SubChatStore] Migrated ${legacyKey} to ${key}`)
      }
    }

    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

export const useAgentSubChatStore = create<AgentSubChatStore>((set, get) => ({
  chatId: null,
  activeSubChatId: null,
  openSubChatIds: [],
  pinnedSubChatIds: [],
  allSubChats: [],
  splitPaneIds: [],
  splitRatios: [],

  setChatId: (chatId) => {
    if (!chatId) {
      set({
        chatId: null,
        activeSubChatId: null,
        openSubChatIds: [],
        pinnedSubChatIds: [],
        allSubChats: [],
        splitPaneIds: [],
        splitRatios: [],
      })
      return
    }

    // Load open/active/pinned IDs from localStorage
    // allSubChats will be populated from DB + placeholders in init effect
    const openSubChatIds = loadFromLS<string[]>(chatId, "open", [])
    const activeSubChatId = loadFromLS<string | null>(chatId, "active", null)
    const pinnedSubChatIds = loadFromLS<string[]>(chatId, "pinned", [])

    // Load split panes — migrate from old splitSubChatId/splitOriginId if needed
    let splitPaneIds = loadFromLS<string[]>(chatId, "splitPanes", [])
    if (splitPaneIds.length === 0) {
      const oldSplit = loadFromLS<string | null>(chatId, "split", null)
      const oldOrigin = loadFromLS<string | null>(chatId, "splitOrigin", null)
      if (oldSplit && oldOrigin) {
        splitPaneIds = [oldOrigin, oldSplit]
        saveToLS(chatId, "splitPanes", splitPaneIds)
      }
    }

    // Validate splitPaneIds against openSubChatIds and pane cap
    splitPaneIds = splitPaneIds
      .filter(id => openSubChatIds.includes(id))
      .slice(0, MAX_SPLIT_PANES)
    if (splitPaneIds.length < 2) splitPaneIds = []

    // Load per-chat ratios, reset if length doesn't match pane count
    let splitRatios = loadFromLS<number[]>(chatId, "splitRatios", [])
    if (splitRatios.length !== splitPaneIds.length) {
      splitRatios = getDefaultRatios(splitPaneIds.length)
    }

    set({ chatId, openSubChatIds, activeSubChatId, pinnedSubChatIds, splitPaneIds, splitRatios, allSubChats: [] })
  },

  setActiveSubChat: (subChatId) => {
    const { chatId } = get()
    // Split group is independent — navigating tabs never touches it.
    // Split view shows automatically when active tab is part of the group.
    set({ activeSubChatId: subChatId })
    if (chatId) saveToLS(chatId, "active", subChatId)
  },

  setOpenSubChats: (subChatIds) => {
    const { chatId } = get()
    set({ openSubChatIds: subChatIds })
    if (chatId) saveToLS(chatId, "open", subChatIds)
  },

  addToOpenSubChats: (subChatId) => {
    const { openSubChatIds, chatId } = get()
    if (openSubChatIds.includes(subChatId)) return
    const newIds = [...openSubChatIds, subChatId]
    set({ openSubChatIds: newIds })
    if (chatId) saveToLS(chatId, "open", newIds)
  },

  removeFromOpenSubChats: (subChatId) => {
    const { openSubChatIds, activeSubChatId, chatId, splitPaneIds, splitRatios } = get()
    const newIds = openSubChatIds.filter((id) => id !== subChatId)

    // If closing active tab, switch to last remaining tab
    let newActive = activeSubChatId
    if (activeSubChatId === subChatId) {
      newActive = newIds[newIds.length - 1] || null
    }

    // If closing a tab in the split group, remove it and update ratios
    let newSplitPaneIds = splitPaneIds
    let newRatios = splitRatios
    if (splitPaneIds.includes(subChatId)) {
      const removeIdx = splitPaneIds.indexOf(subChatId)
      newSplitPaneIds = splitPaneIds.filter((id) => id !== subChatId)
      newRatios = removePaneRatio(splitRatios, removeIdx)
      if (newSplitPaneIds.length < 2) { newSplitPaneIds = []; newRatios = [] }
    }

    set({ openSubChatIds: newIds, activeSubChatId: newActive, splitPaneIds: newSplitPaneIds, splitRatios: newRatios })
    if (chatId) {
      saveToLS(chatId, "open", newIds)
      saveToLS(chatId, "active", newActive)
      if (newSplitPaneIds !== splitPaneIds) {
        saveToLS(chatId, "splitPanes", newSplitPaneIds)
        saveToLS(chatId, "splitRatios", newRatios)
      }
    }

    // Cleanup queue, streaming status, Chat instance, and task snapshot cache
    // to prevent memory leaks and race conditions (QueueProcessor sending to closed subChat)
    useMessageQueueStore.getState().clearQueue(subChatId)
    const isStreaming = useStreamingStatusStore.getState().isStreaming(subChatId)
    useStreamingStatusStore.getState().clearStatus(subChatId)
    clearSubChatRuntimeCaches(subChatId)
    agentChatStore.delete(subChatId)
    clearTaskSnapshotCache(subChatId)

    // Auto-delete the DB row if the sub-chat was never used (no messages).
    // Skip if a stream is in flight — the final write would land on a deleted row.
    if (!isStreaming) {
      trpcClient.chats.deleteSubChatIfEmpty
        .mutate({ id: subChatId })
        .catch(() => {
          // Ignore — non-fatal. The row may have been streamed-into between the
          // gate and the request, or the sub-chat may not yet be persisted (sandbox).
        })
    }
  },

  togglePinSubChat: (subChatId) => {
    const { pinnedSubChatIds, chatId } = get()
    const newPinnedIds = pinnedSubChatIds.includes(subChatId)
      ? pinnedSubChatIds.filter((id) => id !== subChatId)
      : [...pinnedSubChatIds, subChatId]

    set({ pinnedSubChatIds: newPinnedIds })
    if (chatId) saveToLS(chatId, "pinned", newPinnedIds)
  },

  setAllSubChats: (subChats) => {
    set({ allSubChats: subChats })
  },

  addToAllSubChats: (subChat) => {
    const { allSubChats } = get()
    if (allSubChats.some((sc) => sc.id === subChat.id)) return
    set({ allSubChats: [...allSubChats, subChat] })
    // No localStorage persistence - allSubChats is rebuilt from DB + open IDs on init
  },

  updateSubChatName: (subChatId, name) => {
    const { allSubChats } = get()
    set({
      allSubChats: allSubChats.map((sc) =>
        sc.id === subChatId
          ? { ...sc, name }
          : sc,
      ),
    })
    // No localStorage modification - just update in-memory state (like Canvas)
  },

  updateSubChatMode: (subChatId, mode) => {
    const { allSubChats } = get()
    set({
      allSubChats: allSubChats.map((sc) =>
        sc.id === subChatId
          ? { ...sc, mode }
          : sc,
      ),
    })
  },

  updateSubChatTimestamp: (subChatId: string) => {
    const { allSubChats } = get()
    const newTimestamp = new Date().toISOString()

    set({
      allSubChats: allSubChats.map((sc) =>
        sc.id === subChatId
          ? { ...sc, updated_at: newTimestamp }
          : sc,
      ),
    })
  },

  addToSplit: (subChatId, explicitFirstPane) => {
    const { chatId, activeSubChatId, splitPaneIds, splitRatios, openSubChatIds } = get()
    // Pane 1 source: explicit override (for "create new in split" flows where active
    // has already been flipped to the new id) or the current active tab.
    const firstPane = explicitFirstPane ?? activeSubChatId
    if (subChatId === firstPane) return
    if (splitPaneIds.includes(subChatId)) return

    let newPaneIds: string[]
    let newRatios: number[]
    if (splitPaneIds.length === 0) {
      // Start new split group: [firstPane, new]
      if (!firstPane) return
      newPaneIds = [firstPane, subChatId]
      newRatios = getDefaultRatios(2)
    } else if (splitPaneIds.length < MAX_SPLIT_PANES) {
      newPaneIds = [...splitPaneIds, subChatId]
      newRatios = addPaneRatio(splitRatios.length === splitPaneIds.length ? splitRatios : getDefaultRatios(splitPaneIds.length))
    } else {
      return // Max split panes reached
    }

    // Ensure the new pane is in open tabs
    let newOpenIds = openSubChatIds
    if (!openSubChatIds.includes(subChatId)) {
      newOpenIds = [...openSubChatIds, subChatId]
    }

    set({ splitPaneIds: newPaneIds, splitRatios: newRatios, openSubChatIds: newOpenIds })
    if (chatId) {
      saveToLS(chatId, "splitPanes", newPaneIds)
      saveToLS(chatId, "splitRatios", newRatios)
      if (newOpenIds !== openSubChatIds) saveToLS(chatId, "open", newOpenIds)
    }
  },

  removeFromSplit: (subChatId) => {
    const { chatId, splitPaneIds, splitRatios, activeSubChatId } = get()
    if (!splitPaneIds.includes(subChatId)) return

    const removeIdx = splitPaneIds.indexOf(subChatId)
    let newPaneIds = splitPaneIds.filter((id) => id !== subChatId)
    let newRatios = removePaneRatio(splitRatios, removeIdx)
    if (newPaneIds.length < 2) { newPaneIds = []; newRatios = [] }

    // If the removed pane was active, shift active to an adjacent remaining
    // pane. Without this, clicking X on the active pane collapses the split
    // but leaves `activeSubChatId` pointing at the just-removed pane — the
    // user sees the closed chat stay visible and the other one "disappear".
    let newActiveSubChatId = activeSubChatId
    if (activeSubChatId === subChatId) {
      const remaining = splitPaneIds.filter((id) => id !== subChatId)
      newActiveSubChatId =
        remaining[removeIdx] ?? remaining[removeIdx - 1] ?? remaining[0] ?? activeSubChatId
    }

    set({
      splitPaneIds: newPaneIds,
      splitRatios: newRatios,
      activeSubChatId: newActiveSubChatId,
    })
    if (chatId) {
      saveToLS(chatId, "splitPanes", newPaneIds)
      saveToLS(chatId, "splitRatios", newRatios)
      if (newActiveSubChatId !== activeSubChatId) {
        saveToLS(chatId, "active", newActiveSubChatId)
      }
    }
  },

  closeSplit: () => {
    const { chatId } = get()
    set({ splitPaneIds: [], splitRatios: [] })
    if (chatId) {
      saveToLS(chatId, "splitPanes", [])
      saveToLS(chatId, "splitRatios", [])
    }
  },

  setSplitRatios: (ratios) => {
    const { chatId } = get()
    set({ splitRatios: ratios })
    if (chatId) saveToLS(chatId, "splitRatios", ratios)
  },

  initSplitFromWindow: (paneIds) => {
    if (paneIds.length < 2) return
    const normalizedPaneIds = paneIds.slice(0, MAX_SPLIT_PANES)
    const { chatId, openSubChatIds } = get()
    // Add all pane IDs to open tabs
    const newOpenIds = [...openSubChatIds]
    for (const id of normalizedPaneIds) {
      if (!newOpenIds.includes(id)) newOpenIds.push(id)
    }
    const ratios = getDefaultRatios(normalizedPaneIds.length)
    set({
      openSubChatIds: newOpenIds,
      activeSubChatId: normalizedPaneIds[0],
      splitPaneIds: normalizedPaneIds,
      splitRatios: ratios,
    })
    if (chatId) {
      saveToLS(chatId, "open", newOpenIds)
      saveToLS(chatId, "active", normalizedPaneIds[0])
      saveToLS(chatId, "splitPanes", normalizedPaneIds)
      saveToLS(chatId, "splitRatios", ratios)
    }
  },

  reset: () => {
    set({
      chatId: null,
      activeSubChatId: null,
      openSubChatIds: [],
      pinnedSubChatIds: [],
      allSubChats: [],
      splitPaneIds: [],
      splitRatios: [],
    })
  },
}))
