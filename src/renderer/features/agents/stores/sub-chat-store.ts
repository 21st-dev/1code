import { create } from "zustand"
import { useMessageQueueStore } from "./message-queue-store"
import { useStreamingStatusStore } from "./streaming-status-store"
import { agentChatStore } from "./agent-chat-store"
import { getWindowId } from "../../../contexts/WindowContext"
import { clearTaskSnapshotCache } from "../ui/agent-task-tools"

export interface SubChatMeta {
  id: string
  name: string
  created_at?: string
  updated_at?: string
  mode?: "plan" | "agent" | "ask"
}

interface AgentSubChatStore {
  // Current parent chat context
  chatId: string | null

  // State
  activeSubChatId: string | null // Currently selected tab
  openSubChatIds: string[] // Open tabs (preserves order)
  pinnedSubChatIds: string[] // Pinned sub-chats
  allSubChats: SubChatMeta[] // All sub-chats for history

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
  updateSubChatMode: (subChatId: string, mode: "plan" | "agent" | "ask") => void
  updateSubChatTimestamp: (subChatId: string) => void
  reset: () => void
}

// localStorage helpers - store open tabs, active tab, and pinned tabs
// Prefixed with windowId to isolate state per Electron window
const getStorageKey = (chatId: string, type: "open" | "active" | "pinned") =>
  `${getWindowId()}:agent-${type}-sub-chats-${chatId}`

const getLegacyStorageKey = (chatId: string, type: "open" | "active" | "pinned") =>
  `agent-${type}-sub-chats-${chatId}`

// Custom event for notifying other components when open sub-chats change
export const OPEN_SUB_CHATS_CHANGE_EVENT = "open-sub-chats-change"

// Debounce timer to avoid rapid-fire events
let openSubChatsChangeTimer: ReturnType<typeof setTimeout> | null = null

const saveToLS = (chatId: string, type: "open" | "active" | "pinned", value: unknown) => {
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

const loadFromLS = <T>(chatId: string, type: "open" | "active" | "pinned", fallback: T): T => {
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

  setChatId: (chatId) => {
    if (!chatId) {
      set({
        chatId: null,
        activeSubChatId: null,
        openSubChatIds: [],
        pinnedSubChatIds: [],
        allSubChats: [],
      })
      return
    }

    // Load open/active/pinned IDs from localStorage
    // allSubChats will be populated from DB + placeholders in init effect
    const openSubChatIds = loadFromLS<string[]>(chatId, "open", [])
    const activeSubChatId = loadFromLS<string | null>(chatId, "active", null)
    const pinnedSubChatIds = loadFromLS<string[]>(chatId, "pinned", [])

    set({ chatId, openSubChatIds, activeSubChatId, pinnedSubChatIds, allSubChats: [] })
  },

  setActiveSubChat: (subChatId) => {
    const { chatId } = get()
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
    const { openSubChatIds, activeSubChatId, chatId } = get()
    const newIds = openSubChatIds.filter((id) => id !== subChatId)

    // If closing active tab, switch to last remaining tab
    let newActive = activeSubChatId
    if (activeSubChatId === subChatId) {
      newActive = newIds[newIds.length - 1] || null
    }

    set({ openSubChatIds: newIds, activeSubChatId: newActive })
    if (chatId) {
      saveToLS(chatId, "open", newIds)
      saveToLS(chatId, "active", newActive)
    }

    // Cleanup queue, streaming status, Chat instance, and task snapshot cache
    // to prevent memory leaks and race conditions (QueueProcessor sending to closed subChat)
    useMessageQueueStore.getState().clearQueue(subChatId)
    useStreamingStatusStore.getState().clearStatus(subChatId)
    agentChatStore.delete(subChatId)
    clearTaskSnapshotCache(subChatId)
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

  reset: () => {
    set({
      chatId: null,
      activeSubChatId: null,
      openSubChatIds: [],
      pinnedSubChatIds: [],
      allSubChats: [],
    })
  },
}))
