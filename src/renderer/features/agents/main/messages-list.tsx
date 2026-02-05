"use client"

import { useAtomValue } from "jotai"
import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { showMessageJsonAtom } from "../atoms"
import { extractTextMentions, TextMentionBlocks } from "../mentions/render-file-mentions"
import {
  chatStatusAtom,
  isLastMessageAtomFamily,
  isStreamingAtom,
  messageAtomFamily,
} from "../stores/message-store"
import { MessageJsonDisplay } from "../ui/message-json-display"
import { AssistantMessageItem } from "./assistant-message-item"

// ============================================================================
// MESSAGE STORE - External store for fine-grained subscriptions
// ============================================================================

type Message = any

interface MessageStore {
  messages: Message[]
  status: string
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { messages: Message[]; status: string }
  initMessages: (messages: Message[], status: string) => void  // Silent init, no notifications
  setMessages: (messages: Message[], status: string) => void   // Update with notifications
}

function createMessageStore(): MessageStore {
  let messages: Message[] = []
  let status = "ready"
  let listeners = new Set<() => void>()

  // Store snapshots of message state (not references!) to detect changes
  // Since AI SDK mutates objects in place, we can't compare object references
  //
  // NOTE: This is a thorough change detection that checks ALL parts.
  // Compare with message-store.ts hasMessageChanged() which only checks the
  // LAST part for performance during high-frequency streaming updates.
  // Both approaches are correct for their use cases:
  // - This (messages-list): useSyncExternalStore needs accurate change detection
  // - message-store.ts: Jotai atoms optimized for streaming (last part only)
  const messageSnapshotsMap = new Map<string, {
    partsCount: number
    textLengths: number[]  // Length of each text part
    partStates: (string | undefined)[]  // State of each part
  }>()

  function getMessageSnapshot(msg: Message) {
    const parts = msg.parts || []
    return {
      partsCount: parts.length,
      textLengths: parts.map((p: any) => p.type === "text" ? (p.text?.length || 0) : -1),
      partStates: parts.map((p: any) => p.state),
    }
  }

  function hasMessageChanged(msgId: string, newMsg: Message): boolean {
    const existingSnapshot = messageSnapshotsMap.get(msgId)
    const newSnapshot = getMessageSnapshot(newMsg)

    // No existing snapshot = new message
    if (!existingSnapshot) {
      return true
    }

    // Compare parts count
    if (existingSnapshot.partsCount !== newSnapshot.partsCount) {
      return true
    }

    // Compare text lengths (this detects streaming text changes!)
    for (let i = 0; i < newSnapshot.textLengths.length; i++) {
      if (existingSnapshot.textLengths[i] !== newSnapshot.textLengths[i]) {
        return true
      }
    }

    // Compare part states
    for (let i = 0; i < newSnapshot.partStates.length; i++) {
      if (existingSnapshot.partStates[i] !== newSnapshot.partStates[i]) {
        return true
      }
    }

    return false
  }

  function stabilizeMessages(newMessages: Message[]): Message[] {
    // Check if any message changed
    let anyChanged = false

    for (const msg of newMessages) {
      if (hasMessageChanged(msg.id, msg)) {
        anyChanged = true
        // Update snapshot for this message
        messageSnapshotsMap.set(msg.id, getMessageSnapshot(msg))
      }
    }

    // If length changed, definitely return new array
    if (newMessages.length !== messages.length) {
      anyChanged = true
    }

    // Return new array reference if anything changed, so subscribers see the update
    return anyChanged ? [...newMessages] : messages
  }

  return {
    get messages() { return messages },
    get status() { return status },

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot() {
      return { messages, status }
    },

    // Silent update - doesn't notify listeners, used for initialization
    initMessages(newMessages: Message[], newStatus: string) {
      const stabilized = stabilizeMessages(newMessages)
      messages = stabilized
      status = newStatus
    },

    setMessages(newMessages: Message[], newStatus: string) {
      const stabilized = stabilizeMessages(newMessages)
      // Only notify if something actually changed
      const messagesChanged = stabilized !== messages
      const statusChanged = newStatus !== status

      if (messagesChanged || statusChanged) {
        messages = stabilized
        status = newStatus
        listeners.forEach(l => l())
      }
    }
  }
}

// Context for the store
const MessageStoreContext = createContext<MessageStore | null>(null)

// Hook to sync messages to global store - NOT USED, keeping for reference
export function useMessageStoreSync(_messages: Message[], _status: string) {
  // Not used
}

// Provider component
export function MessageStoreProvider({
  children,
  messages,
  status,
}: {
  children: React.ReactNode
  messages: Message[]
  status: string
}) {
  // Create store once per provider instance, initialized with current messages
  const storeRef = useRef<MessageStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createMessageStore()
    // Initialize with current messages SILENTLY - no subscribers yet anyway
    storeRef.current.initMessages(messages, status)
  }

  // CRITICAL: Use useLayoutEffect to sync messages AFTER render, not during
  // This avoids "Cannot update a component while rendering a different component" error
  useLayoutEffect(() => {
    storeRef.current?.setMessages(messages, status)
  }, [messages, status])

  return (
    <MessageStoreContext.Provider value={storeRef.current}>
      {children}
    </MessageStoreContext.Provider>
  )
}

// Hook to get a specific message by ID - only triggers re-render when THIS message changes
export function useMessage(messageId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessage must be used within MessageStoreProvider")

  const prevMessageRef = useRef<any>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      // Only notify if THIS message changed
      const currentMsg = store.messages.find(m => m.id === messageId)
      if (currentMsg !== prevMessageRef.current) {
        prevMessageRef.current = currentMsg
        onStoreChange()
      }
    })
  }, [store, messageId])

  const getSnapshot = useCallback(() => {
    const msg = store.messages.find(m => m.id === messageId)
    prevMessageRef.current = msg
    return msg
  }, [store, messageId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Hook to get message IDs only (for list rendering)
export function useMessageIds() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessageIds must be used within MessageStoreProvider")

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  const idsRef = useRef<string[]>([])

  const getSnapshot = useCallback(() => {
    const newIds = store.messages.filter(m => m.role === "assistant").map(m => m.id)
    // Only return new array if IDs actually changed
    if (
      newIds.length === idsRef.current.length &&
      newIds.every((id, i) => id === idsRef.current[i])
    ) {
      return idsRef.current
    }
    idsRef.current = newIds
    return newIds
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Hook to get streaming status - only triggers re-render when status actually changes
export function useStreamingStatus() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useStreamingStatus must be used within MessageStoreProvider")

  const cacheRef = useRef<{ isStreaming: boolean; status: string; lastMessageId: string | null } | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const isStreaming = store.status === "streaming" || store.status === "submitted"
      const lastMsgId = store.messages.length > 0 ? store.messages[store.messages.length - 1]?.id : null

      if (
        !cacheRef.current ||
        cacheRef.current.isStreaming !== isStreaming ||
        cacheRef.current.status !== store.status ||
        cacheRef.current.lastMessageId !== lastMsgId
      ) {
        cacheRef.current = { isStreaming, status: store.status, lastMessageId: lastMsgId }
        onStoreChange()
      }
    })
  }, [store])

  const getSnapshot = useCallback(() => {
    const isStreaming = store.status === "streaming" || store.status === "submitted"
    const lastMsgId = store.messages.length > 0 ? store.messages[store.messages.length - 1]?.id : null

    if (
      cacheRef.current &&
      cacheRef.current.isStreaming === isStreaming &&
      cacheRef.current.status === store.status &&
      cacheRef.current.lastMessageId === lastMsgId
    ) {
      return cacheRef.current
    }

    cacheRef.current = { isStreaming, status: store.status, lastMessageId: lastMsgId }
    return cacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// MESSAGE ITEM - Subscribes to its own message only
// ============================================================================

interface MessageItemWrapperProps {
  messageId: string
  subChatId: string
  chatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  onRollback?: (msg: any) => void
}

// Hook that only re-renders THIS component when it becomes/stops being the last message
function useIsLastMessage(messageId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useIsLastMessage must be used within MessageStoreProvider")

  const prevIsLastRef = useRef<boolean>(false)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const lastMsgId = store.messages.length > 0 ? store.messages[store.messages.length - 1]?.id : null
      const isLast = messageId === lastMsgId

      // Only notify if THIS message's "isLast" status changed
      if (prevIsLastRef.current !== isLast) {
        prevIsLastRef.current = isLast
        onStoreChange()
      }
    })
  }, [store, messageId])

  const getSnapshot = useCallback(() => {
    const lastMsgId = store.messages.length > 0 ? store.messages[store.messages.length - 1]?.id : null
    const isLast = messageId === lastMsgId
    prevIsLastRef.current = isLast
    return isLast
  }, [store, messageId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Hook that only re-renders when streaming status changes
function useIsStreaming() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useIsStreaming must be used within MessageStoreProvider")

  // Cache must be stable and only updated when values actually change
  const cacheRef = useRef<{ isStreaming: boolean; status: string } | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const isStreaming = store.status === "streaming" || store.status === "submitted"
      if (!cacheRef.current || cacheRef.current.isStreaming !== isStreaming || cacheRef.current.status !== store.status) {
        cacheRef.current = { isStreaming, status: store.status }
        onStoreChange()
      }
    })
  }, [store])

  const getSnapshot = useCallback(() => {
    const isStreaming = store.status === "streaming" || store.status === "submitted"
    // Return cached value if it matches current state
    if (cacheRef.current && cacheRef.current.isStreaming === isStreaming && cacheRef.current.status === store.status) {
      return cacheRef.current
    }
    // Create and cache new value
    cacheRef.current = { isStreaming, status: store.status }
    return cacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// For non-last messages - no streaming subscription needed
// Subscribes to message via Jotai messageAtomFamily, passes message as prop to AssistantMessageItem
const NonStreamingMessageItem = memo(function NonStreamingMessageItem({
  messageId,
  subChatId,
  chatId,
  isMobile,
  sandboxSetupStatus,
  onRollback,
}: {
  messageId: string
  subChatId: string
  chatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  onRollback?: (msg: any) => void
}) {
  // Subscribe to this specific message via Jotai - only re-renders when THIS message changes
  const message = useAtomValue(messageAtomFamily(messageId))

  if (!message) return null

  return (
    <AssistantMessageItem
      message={message}
      isLastMessage={false}
      isStreaming={false}
      status="ready"
      subChatId={subChatId}
      chatId={chatId}
      isMobile={isMobile}
      sandboxSetupStatus={sandboxSetupStatus}
      onRollback={onRollback}
    />
  )
})

// For the last message - subscribes to streaming status AND message via Jotai
// Passes message as prop to AssistantMessageItem
const StreamingMessageItem = memo(function StreamingMessageItem({
  messageId,
  subChatId,
  chatId,
  isMobile,
  sandboxSetupStatus,
  onRollback,
}: {
  messageId: string
  subChatId: string
  chatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  onRollback?: (msg: any) => void
}) {
  // Subscribe to this specific message via Jotai - only re-renders when THIS message changes
  const message = useAtomValue(messageAtomFamily(messageId))

  // Subscribe to streaming status
  const isStreaming = useAtomValue(isStreamingAtom)
  const status = useAtomValue(chatStatusAtom)

  if (!message) return null

  return (
    <AssistantMessageItem
      message={message}
      isLastMessage={true}
      isStreaming={isStreaming}
      status={status}
      subChatId={subChatId}
      chatId={chatId}
      isMobile={isMobile}
      sandboxSetupStatus={sandboxSetupStatus}
      onRollback={onRollback}
    />
  )
})

// Combined hook - get message AND isLast in one subscription to avoid double re-renders
function useMessageWithLastStatus(messageId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessageWithLastStatus must be used within MessageStoreProvider")

  // Track what we last returned to detect changes
  const lastReturnedRef = useRef<{ message: any; isLast: boolean } | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const currentMsg = store.messages.find(m => m.id === messageId)
      const lastMsgId = store.messages.length > 0 ? store.messages[store.messages.length - 1]?.id : null
      const isLast = messageId === lastMsgId

      const msgChanged = lastReturnedRef.current?.message !== currentMsg
      const isLastChanged = lastReturnedRef.current?.isLast !== isLast

      // Only notify if message changed OR isLast changed
      // DO NOT update lastReturnedRef here - only in getSnapshot!
      if (!lastReturnedRef.current || msgChanged || isLastChanged) {
        onStoreChange()
      }
    })
  }, [store, messageId])

  const getSnapshot = useCallback(() => {
    const currentMsg = store.messages.find(m => m.id === messageId)
    const lastMsgId = store.messages.length > 0 ? store.messages[store.messages.length - 1]?.id : null
    const isLast = messageId === lastMsgId

    // Return cached object if nothing changed
    if (
      lastReturnedRef.current &&
      lastReturnedRef.current.message === currentMsg &&
      lastReturnedRef.current.isLast === isLast
    ) {
      return lastReturnedRef.current
    }

    // Create new object and cache it
    lastReturnedRef.current = { message: currentMsg, isLast }
    return lastReturnedRef.current
  }, [store, messageId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export const MessageItemWrapper = memo(function MessageItemWrapper({
  messageId,
  subChatId,
  chatId,
  isMobile,
  sandboxSetupStatus,
  onRollback,
}: MessageItemWrapperProps) {

  // Only subscribe to isLast - NOT to message content!
  // StreamingMessageItem and NonStreamingMessageItem will subscribe to message themselves
  const isLast = useAtomValue(isLastMessageAtomFamily(messageId))

  // Only the last message subscribes to streaming status
  if (isLast) {
    // StreamingMessageItem subscribes to messageAtomFamily internally
    return (
      <StreamingMessageItem
        messageId={messageId}
        subChatId={subChatId}
        chatId={chatId}
        isMobile={isMobile}
        sandboxSetupStatus={sandboxSetupStatus}
        onRollback={onRollback}
      />
    )
  }

  // NonStreamingMessageItem subscribes to messageAtomFamily internally
  return (
    <NonStreamingMessageItem
      messageId={messageId}
      subChatId={subChatId}
      chatId={chatId}
      isMobile={isMobile}
      sandboxSetupStatus={sandboxSetupStatus}
      onRollback={onRollback}
    />
  )
})

// ============================================================================
// MEMOIZED ASSISTANT MESSAGES - Only re-renders when message IDs change
// ============================================================================

// This is the KEY optimization component.
// By wrapping the assistant messages .map() in a memoized component that
// compares ONLY the message IDs (not the full message objects), we prevent
// the parent's re-render from causing MessageItemWrapper to be called.

interface MemoizedAssistantMessagesProps {
  assistantMsgIds: string[]
  subChatId: string
  chatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  onRollback?: (msg: any) => void
}

function areMemoizedAssistantMessagesEqual(
  prev: MemoizedAssistantMessagesProps,
  next: MemoizedAssistantMessagesProps
): boolean {
  // Only re-render if IDs changed (new message added/removed)
  if (prev.assistantMsgIds.length !== next.assistantMsgIds.length) {
    return false
  }

  // Check if all IDs are the same
  for (let i = 0; i < prev.assistantMsgIds.length; i++) {
    if (prev.assistantMsgIds[i] !== next.assistantMsgIds[i]) {
      return false
    }
  }

  // Also check static props
  if (prev.subChatId !== next.subChatId) return false
  if (prev.chatId !== next.chatId) return false
  if (prev.isMobile !== next.isMobile) return false
  if (prev.sandboxSetupStatus !== next.sandboxSetupStatus) return false
  if (prev.onRollback !== next.onRollback) return false

  return true
}

export const MemoizedAssistantMessages = memo(function MemoizedAssistantMessages({
  assistantMsgIds,
  subChatId,
  chatId,
  isMobile,
  sandboxSetupStatus,
  onRollback,
}: MemoizedAssistantMessagesProps) {
  // This component only re-renders when assistantMsgIds changes
  // During streaming, IDs stay the same, so this doesn't re-render
  // Therefore, MessageItemWrapper is never called, and the store
  // subscription handles updates directly
  return (
    <>
      {assistantMsgIds.map((id) => (
        <MessageItemWrapper
          key={id}
          messageId={id}
          subChatId={subChatId}
          chatId={chatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
          onRollback={onRollback}
        />
      ))}
    </>
  )
}, areMemoizedAssistantMessagesEqual)

// ============================================================================
// HOOKS FOR ISOLATED RENDERING
// ============================================================================

// Hook to get ALL messages (user + assistant) with stable references
export function useAllMessages() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useAllMessages must be used within MessageStoreProvider")

  const cacheRef = useRef<Message[]>([])

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  const getSnapshot = useCallback(() => {
    // Return cached array if messages haven't changed
    if (cacheRef.current === store.messages) {
      return cacheRef.current
    }
    cacheRef.current = store.messages
    return cacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Hook to get message groups - computed from store, only updates when messages change
// Returns stable references for groups that haven't changed
interface MessageGroup {
  userMsg: Message
  assistantMsgIds: string[]
  assistantMsgsCount: number
}

export function useMessageGroups() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useMessageGroups must be used within MessageStoreProvider")

  // Cache for stable group references
  const groupsCacheRef = useRef<MessageGroup[]>([])
  const assistantIdsCacheRef = useRef<Map<string, string[]>>(new Map())

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  const getSnapshot = useCallback(() => {
    const messages = store.messages

    // Compute groups
    const groups: MessageGroup[] = []
    let currentGroup: MessageGroup | null = null

    for (const msg of messages) {
      if (msg.role === "user") {
        if (currentGroup) {
          groups.push(currentGroup)
        }
        currentGroup = {
          userMsg: msg,
          assistantMsgIds: [],
          assistantMsgsCount: 0
        }
      } else if (currentGroup && msg.role === "assistant") {
        currentGroup.assistantMsgIds.push(msg.id)
        currentGroup.assistantMsgsCount++
      }
    }
    if (currentGroup) {
      groups.push(currentGroup)
    }

    // Stabilize group references - only create new objects if content changed
    // Check if groups count changed
    if (groups.length !== groupsCacheRef.current.length) {
      // Stabilize individual groups
      for (let i = 0; i < groups.length; i++) {
        const newGroup = groups[i]
        const cachedGroup = groupsCacheRef.current[i]
        const cachedIds = assistantIdsCacheRef.current.get(newGroup.userMsg.id)

        // Stabilize assistantMsgIds array
        if (cachedIds &&
            cachedIds.length === newGroup.assistantMsgIds.length &&
            cachedIds.every((id, j) => id === newGroup.assistantMsgIds[j])) {
          newGroup.assistantMsgIds = cachedIds
        } else {
          assistantIdsCacheRef.current.set(newGroup.userMsg.id, newGroup.assistantMsgIds)
        }

        // Reuse cached group object if nothing changed
        if (cachedGroup &&
            cachedGroup.userMsg === newGroup.userMsg &&
            cachedGroup.assistantMsgIds === newGroup.assistantMsgIds &&
            cachedGroup.assistantMsgsCount === newGroup.assistantMsgsCount) {
          groups[i] = cachedGroup
        }
      }
      groupsCacheRef.current = groups
      return groups
    }

    // Same length - check each group for changes
    let anyChanged = false
    for (let i = 0; i < groups.length; i++) {
      const newGroup = groups[i]
      const cachedGroup = groupsCacheRef.current[i]
      const cachedIds = assistantIdsCacheRef.current.get(newGroup.userMsg.id)

      // Stabilize assistantMsgIds array
      if (cachedIds &&
          cachedIds.length === newGroup.assistantMsgIds.length &&
          cachedIds.every((id, j) => id === newGroup.assistantMsgIds[j])) {
        newGroup.assistantMsgIds = cachedIds
      } else {
        assistantIdsCacheRef.current.set(newGroup.userMsg.id, newGroup.assistantMsgIds)
        anyChanged = true
      }

      // Check if group itself changed
      if (!cachedGroup ||
          cachedGroup.userMsg !== newGroup.userMsg ||
          cachedGroup.assistantMsgIds !== newGroup.assistantMsgIds ||
          cachedGroup.assistantMsgsCount !== newGroup.assistantMsgsCount) {
        anyChanged = true
      } else {
        // Reuse cached group
        groups[i] = cachedGroup
      }
    }

    if (anyChanged) {
      groupsCacheRef.current = groups
      return groups
    }

    return groupsCacheRef.current
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// MESSAGES LIST - Only re-renders when message IDs change (add/remove)
// ============================================================================

interface MessagesListProps {
  subChatId: string
  chatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
}

export const MessagesList = memo(function MessagesList({
  subChatId,
  chatId,
  isMobile,
  sandboxSetupStatus,
}: MessagesListProps) {
  const messageIds = useMessageIds()

  return (
    <>
      {messageIds.map((id) => (
        <MessageItemWrapper
          key={id}
          messageId={id}
          subChatId={subChatId}
          chatId={chatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
        />
      ))}
    </>
  )
})

// ============================================================================
// HOOK: useUserMessageIds - Only returns user message IDs (for groups)
// ============================================================================

export function useUserMessageIds() {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useUserMessageIds must be used within MessageStoreProvider")

  const idsRef = useRef<string[]>([])

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(onStoreChange)
  }, [store])

  const getSnapshot = useCallback(() => {
    const newIds = store.messages.filter(m => m.role === "user").map(m => m.id)
    // Only return new array if IDs actually changed
    if (
      newIds.length === idsRef.current.length &&
      newIds.every((id, i) => id === idsRef.current[i])
    ) {
      return idsRef.current
    }
    idsRef.current = newIds
    return newIds
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// HOOK: useUserMessageWithAssistants - Get user message and its assistant IDs
// ============================================================================

export function useUserMessageWithAssistants(userMsgId: string) {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error("useUserMessageWithAssistants must be used within MessageStoreProvider")

  // Cache for stable return value
  const cacheRef = useRef<{
    userMsg: Message | undefined
    assistantMsgIds: string[]
    isLastGroup: boolean
  } | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      // Get user message
      const userMsg = store.messages.find(m => m.id === userMsgId)
      if (!userMsg) {
        if (cacheRef.current?.userMsg !== undefined) {
          onStoreChange()
        }
        return
      }

      // Find assistant messages that follow this user message
      const userIndex = store.messages.findIndex(m => m.id === userMsgId)
      const assistantMsgIds: string[] = []
      for (let i = userIndex + 1; i < store.messages.length; i++) {
        const msg = store.messages[i]
        if (msg.role === "user") break  // Next user message = end of group
        if (msg.role === "assistant") {
          assistantMsgIds.push(msg.id)
        }
      }

      // Check if this is the last group
      const userMsgIds = store.messages.filter(m => m.role === "user").map(m => m.id)
      const isLastGroup = userMsgIds[userMsgIds.length - 1] === userMsgId

      // Check if anything changed
      if (cacheRef.current) {
        const idsChanged =
          assistantMsgIds.length !== cacheRef.current.assistantMsgIds.length ||
          !assistantMsgIds.every((id, i) => id === cacheRef.current!.assistantMsgIds[i])
        const isLastChanged = isLastGroup !== cacheRef.current.isLastGroup
        const userMsgChanged = userMsg !== cacheRef.current.userMsg

        if (!idsChanged && !isLastChanged && !userMsgChanged) {
          return  // Nothing changed, don't notify
        }
      }

      onStoreChange()
    })
  }, [store, userMsgId])

  const getSnapshot = useCallback(() => {
    const userMsg = store.messages.find(m => m.id === userMsgId)
    if (!userMsg) {
      if (!cacheRef.current || cacheRef.current.userMsg !== undefined) {
        cacheRef.current = { userMsg: undefined, assistantMsgIds: [], isLastGroup: false }
      }
      return cacheRef.current
    }

    // Find assistant messages
    const userIndex = store.messages.findIndex(m => m.id === userMsgId)
    const assistantMsgIds: string[] = []
    for (let i = userIndex + 1; i < store.messages.length; i++) {
      const msg = store.messages[i]
      if (msg.role === "user") break
      if (msg.role === "assistant") {
        assistantMsgIds.push(msg.id)
      }
    }

    // Check if this is the last group
    const userMsgIds = store.messages.filter(m => m.role === "user").map(m => m.id)
    const isLastGroup = userMsgIds[userMsgIds.length - 1] === userMsgId

    // Return cached value if nothing changed
    if (cacheRef.current) {
      const idsMatch =
        assistantMsgIds.length === cacheRef.current.assistantMsgIds.length &&
        assistantMsgIds.every((id, i) => id === cacheRef.current!.assistantMsgIds[i])

      if (
        userMsg === cacheRef.current.userMsg &&
        idsMatch &&
        isLastGroup === cacheRef.current.isLastGroup
      ) {
        return cacheRef.current
      }

      // Stabilize assistantMsgIds if they match
      if (idsMatch) {
        cacheRef.current = {
          userMsg,
          assistantMsgIds: cacheRef.current.assistantMsgIds,  // Reuse stable reference
          isLastGroup
        }
        return cacheRef.current
      }
    }

    cacheRef.current = { userMsg, assistantMsgIds, isLastGroup }
    return cacheRef.current
  }, [store, userMsgId])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// ISOLATED MESSAGE GROUP - Renders a single user message + its assistants
// ============================================================================
// This component subscribes to ONE user message and its assistant IDs.
// It only re-renders when:
// - The user message content changes
// - New assistant messages are added to this group
// - This becomes/stops being the last group

interface SimpleIsolatedGroupProps {
  userMsgId: string
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  isSubChatsSidebarOpen: boolean
  stickyTopClass: string
  sandboxSetupError?: string
  onRetrySetup?: () => void
  // Components passed from parent - must be stable references
  UserBubbleComponent: React.ComponentType<{
    messageId: string
    textContent: string
    imageParts: any[]
    skipTextMentionBlocks?: boolean
  }>
  ToolCallComponent: React.ComponentType<{
    icon: any
    title: string
    isPending: boolean
    isError: boolean
  }>
  MessageGroupComponent: React.ComponentType<{ children: React.ReactNode }>
  toolRegistry: Record<string, { icon: any; title: (args: any) => string }>
}

function areSimpleGroupPropsEqual(
  prev: SimpleIsolatedGroupProps,
  next: SimpleIsolatedGroupProps
): boolean {
  return (
    prev.userMsgId === next.userMsgId &&
    prev.subChatId === next.subChatId &&
    prev.isMobile === next.isMobile &&
    prev.sandboxSetupStatus === next.sandboxSetupStatus &&
    prev.isSubChatsSidebarOpen === next.isSubChatsSidebarOpen &&
    prev.stickyTopClass === next.stickyTopClass &&
    prev.sandboxSetupError === next.sandboxSetupError &&
    prev.onRetrySetup === next.onRetrySetup &&
    prev.UserBubbleComponent === next.UserBubbleComponent &&
    prev.ToolCallComponent === next.ToolCallComponent &&
    prev.MessageGroupComponent === next.MessageGroupComponent &&
    prev.toolRegistry === next.toolRegistry
  )
}

export const SimpleIsolatedGroup = memo(function SimpleIsolatedGroup({
  userMsgId,
  subChatId,
  isMobile,
  sandboxSetupStatus,
  stickyTopClass,
  sandboxSetupError,
  onRetrySetup,
  UserBubbleComponent,
  ToolCallComponent,
  MessageGroupComponent,
  toolRegistry,
}: SimpleIsolatedGroupProps) {
  // Subscribe to this specific user message and its assistant IDs
  const { userMsg, assistantMsgIds, isLastGroup } = useUserMessageWithAssistants(userMsgId)
  const { isStreaming } = useStreamingStatus()
  const showMessageJson = useAtomValue(showMessageJsonAtom)
  const isDev = import.meta.env.DEV

  if (!userMsg) return null

  // User message data
  const rawTextContent = userMsg.parts
    ?.filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("\n") || ""

  const imageParts = userMsg.parts?.filter((p: any) => p.type === "data-image") || []

  // Extract text mentions (quote/diff) to render separately above sticky block
  const { textMentions, cleanedText: textContent } = useMemo(
    () => extractTextMentions(rawTextContent),
    [rawTextContent]
  )

  // Show cloning when sandbox is being set up
  const shouldShowCloning =
    sandboxSetupStatus === "cloning" &&
    isLastGroup &&
    assistantMsgIds.length === 0

  // Show setup error if sandbox setup failed
  const shouldShowSetupError =
    sandboxSetupStatus === "error" &&
    isLastGroup &&
    assistantMsgIds.length === 0

  return (
    <MessageGroupComponent>
      {/* Attachments - NOT sticky */}
      {imageParts.length > 0 && (
        <div className="mb-2 pointer-events-auto">
          <UserBubbleComponent
            messageId={userMsg.id}
            textContent=""
            imageParts={imageParts}
            skipTextMentionBlocks
          />
        </div>
      )}

      {/* Text mentions (quote/diff/pasted) - NOT sticky */}
      {textMentions.length > 0 && (
        <div className="mb-2 pointer-events-auto">
          <TextMentionBlocks mentions={textMentions} />
        </div>
      )}

      {/* User message text - sticky */}
      <div
        data-user-message-id={userMsg.id}
        className={`[&>div]:!mb-4 pointer-events-auto sticky z-10 ${stickyTopClass}`}
      >
        {/* Show "Using X" summary when no text but have attachments */}
        {!textContent.trim() && (imageParts.length > 0 || textMentions.length > 0) ? (
          <div className="flex justify-start drop-shadow-[0_10px_20px_hsl(var(--background))]" data-user-bubble>
            <div className="space-y-2 w-full">
              <div className="bg-input-background border px-3 py-2 rounded-xl text-sm text-muted-foreground italic">
                {(() => {
                  const parts: string[] = []
                  if (imageParts.length > 0) {
                    parts.push(imageParts.length === 1 ? "image" : `${imageParts.length} images`)
                  }
                  const quoteCount = textMentions.filter(m => m.type === "quote" || m.type === "pasted").length
                  const codeCount = textMentions.filter(m => m.type === "diff").length
                  if (quoteCount > 0) {
                    parts.push(quoteCount === 1 ? "selected text" : `${quoteCount} text selections`)
                  }
                  if (codeCount > 0) {
                    parts.push(codeCount === 1 ? "code selection" : `${codeCount} code selections`)
                  }
                  return `Using ${parts.join(", ")}`
                })()}
              </div>
            </div>
          </div>
        ) : (
          <UserBubbleComponent
            messageId={userMsg.id}
            textContent={textContent}
            imageParts={[]}
            skipTextMentionBlocks
          />
        )}

        {/* Cloning indicator */}
        {shouldShowCloning && (
          <div className="mt-4">
            <ToolCallComponent
              icon={toolRegistry["tool-cloning"]?.icon}
              title={toolRegistry["tool-cloning"]?.title({}) || "Cloning..."}
              isPending={true}
              isError={false}
            />
          </div>
        )}

        {/* Setup error with retry */}
        {shouldShowSetupError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <span>
                Failed to set up sandbox
                {sandboxSetupError ? `: ${sandboxSetupError}` : ""}
              </span>
              {onRetrySetup && (
                <button className="px-2 py-1 text-sm hover:bg-destructive/20 rounded" onClick={onRetrySetup}>
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* User message JSON display (dev only) */}
      {isDev && showMessageJson && (
        <div className="pointer-events-auto mt-1 mb-2">
          <MessageJsonDisplay message={userMsg} label="User" />
        </div>
      )}

      {/* Assistant messages */}
      {assistantMsgIds.length > 0 && (
        <MemoizedAssistantMessages
          assistantMsgIds={assistantMsgIds}
          subChatId={subChatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
        />
      )}

      {/* Planning indicator */}
      {isStreaming && isLastGroup && assistantMsgIds.length === 0 && sandboxSetupStatus === "ready" && (
        <div className="mt-4">
          <ToolCallComponent
            icon={toolRegistry["tool-planning"]?.icon}
            title={toolRegistry["tool-planning"]?.title({}) || "Planning..."}
            isPending={true}
            isError={false}
          />
        </div>
      )}
    </MessageGroupComponent>
  )
}, areSimpleGroupPropsEqual)

// ============================================================================
// SIMPLE ISOLATED MESSAGES LIST - Renders all message groups
// ============================================================================

interface SimpleIsolatedListProps {
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  isSubChatsSidebarOpen: boolean
  stickyTopClass: string
  sandboxSetupError?: string
  onRetrySetup?: () => void
  UserBubbleComponent: SimpleIsolatedGroupProps["UserBubbleComponent"]
  ToolCallComponent: SimpleIsolatedGroupProps["ToolCallComponent"]
  MessageGroupComponent: SimpleIsolatedGroupProps["MessageGroupComponent"]
  toolRegistry: SimpleIsolatedGroupProps["toolRegistry"]
}

function areSimpleListPropsEqual(
  prev: SimpleIsolatedListProps,
  next: SimpleIsolatedListProps
): boolean {
  return (
    prev.subChatId === next.subChatId &&
    prev.isMobile === next.isMobile &&
    prev.sandboxSetupStatus === next.sandboxSetupStatus &&
    prev.isSubChatsSidebarOpen === next.isSubChatsSidebarOpen &&
    prev.stickyTopClass === next.stickyTopClass &&
    prev.sandboxSetupError === next.sandboxSetupError &&
    prev.onRetrySetup === next.onRetrySetup &&
    prev.UserBubbleComponent === next.UserBubbleComponent &&
    prev.ToolCallComponent === next.ToolCallComponent &&
    prev.MessageGroupComponent === next.MessageGroupComponent &&
    prev.toolRegistry === next.toolRegistry
  )
}

export const SimpleIsolatedMessagesList = memo(function SimpleIsolatedMessagesList({
  subChatId,
  isMobile,
  sandboxSetupStatus,
  isSubChatsSidebarOpen,
  stickyTopClass,
  sandboxSetupError,
  onRetrySetup,
  UserBubbleComponent,
  ToolCallComponent,
  MessageGroupComponent,
  toolRegistry,
}: SimpleIsolatedListProps) {
  // Subscribe to user message IDs only
  const userMsgIds = useUserMessageIds()

  return (
    <>
      {userMsgIds.map((userMsgId) => (
        <SimpleIsolatedGroup
          key={userMsgId}
          userMsgId={userMsgId}
          subChatId={subChatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
          isSubChatsSidebarOpen={isSubChatsSidebarOpen}
          stickyTopClass={stickyTopClass}
          sandboxSetupError={sandboxSetupError}
          onRetrySetup={onRetrySetup}
          UserBubbleComponent={UserBubbleComponent}
          ToolCallComponent={ToolCallComponent}
          MessageGroupComponent={MessageGroupComponent}
          toolRegistry={toolRegistry}
        />
      ))}
    </>
  )
}, areSimpleListPropsEqual)
