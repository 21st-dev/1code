import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

export type StreamingStatus = "ready" | "streaming" | "submitted" | "error"

interface StreamingStatusState {
  // Map: subChatId -> streaming status
  statuses: Record<string, StreamingStatus>

  // Actions
  setStatus: (subChatId: string, status: StreamingStatus) => void
  getStatus: (subChatId: string) => StreamingStatus
  isStreaming: (subChatId: string) => boolean
  clearStatus: (subChatId: string) => void

  // Get all sub-chats that are ready (not streaming)
  getReadySubChats: () => string[]
}

export const useStreamingStatusStore = create<StreamingStatusState>()(
  subscribeWithSelector((set, get) => ({
    statuses: {},

    setStatus: (subChatId, status) => {
      set((state) => ({
        statuses: {
          ...state.statuses,
          [subChatId]: status,
        },
      }))
    },

    getStatus: (subChatId) => {
      return get().statuses[subChatId] ?? "ready"
    },

    isStreaming: (subChatId) => {
      const status = get().statuses[subChatId] ?? "ready"
      return status === "streaming" || status === "submitted"
    },

    clearStatus: (subChatId) => {
      set((state) => {
        const newStatuses = { ...state.statuses }
        delete newStatuses[subChatId]
        return { statuses: newStatuses }
      })
    },

    getReadySubChats: () => {
      const { statuses } = get()
      return Object.entries(statuses)
        .filter(([_, status]) => status === "ready")
        .map(([subChatId]) => subChatId)
    },
  }))
)
