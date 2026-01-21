"use client"

import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react"
import { Chat, useChat } from "@ai-sdk/react"
import { useSetAtom } from "jotai"
import { syncMessagesWithStatusAtom } from "../stores/message-store"

// ============================================================================
// CHAT DATA SYNC (LAYER 1)
// ============================================================================
// This component's ONLY job is to:
// 1. Call useChat() to get messages and status
// 2. Sync them to Jotai store
// 3. Provide chat actions (sendMessage, stop, regenerate) via context
//
// It WILL re-render on every streaming chunk (330+ times), but:
// - It does NO expensive computations
// - It renders ONLY children (which are memoized)
// - All message rendering is done by isolated components that subscribe to atoms
// ============================================================================

// Context for chat actions (sendMessage, stop, regenerate)
interface ChatActionsContextValue {
  sendMessage: ReturnType<typeof useChat>["sendMessage"]
  stop: ReturnType<typeof useChat>["stop"]
  regenerate: ReturnType<typeof useChat>["regenerate"]
  status: string
}

const ChatActionsContext = createContext<ChatActionsContextValue | null>(null)

export function useChatActions() {
  const context = useContext(ChatActionsContext)
  if (!context) {
    throw new Error("useChatActions must be used within ChatDataSync")
  }
  return context
}

// Props
interface ChatDataSyncProps {
  chat: Chat<any>
  subChatId: string
  streamId?: string | null
  children: ReactNode
}

export function ChatDataSync({
  chat,
  subChatId,
  streamId,
  children,
}: ChatDataSyncProps) {
  // Call useChat - this causes re-renders on every chunk
  const { messages, sendMessage, status, stop, regenerate } = useChat({
    id: subChatId,
    chat,
    resume: !!streamId,
    experimental_throttle: 50,
  })

  // Get setter for Jotai store
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)

  // Sync to Jotai store - this is the ONLY thing we do with messages
  // Using useLayoutEffect to sync before paint
  // CRITICAL: Must pass subChatId to correctly key caches per chat
  useLayoutEffect(() => {
    syncMessages({ messages, status, subChatId })
  }, [messages, status, subChatId, syncMessages])

  // Stable refs for actions to prevent context recreation
  const actionsRef = useRef<ChatActionsContextValue>({
    sendMessage,
    stop,
    regenerate,
    status,
  })

  // Update refs (no re-render triggered)
  actionsRef.current.sendMessage = sendMessage
  actionsRef.current.stop = stop
  actionsRef.current.regenerate = regenerate
  actionsRef.current.status = status

  // Memoized context value - only recreate when status changes
  // (actions are accessed via ref, so they're always current)
  const contextValue = useRef<ChatActionsContextValue>({
    get sendMessage() {
      return actionsRef.current.sendMessage
    },
    get stop() {
      return actionsRef.current.stop
    },
    get regenerate() {
      return actionsRef.current.regenerate
    },
    get status() {
      return actionsRef.current.status
    },
  }).current

  return (
    <ChatActionsContext.Provider value={contextValue}>
      {children}
    </ChatActionsContext.Provider>
  )
}
