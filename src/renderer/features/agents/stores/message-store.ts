"use client"

import { atom } from "jotai"
import { atomFamily } from "jotai/utils"

// Types
export interface MessagePart {
  type: string
  text?: string
  toolCallId?: string
  state?: string
  input?: any
  output?: any
  result?: any
  [key: string]: any
}

export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  parts?: MessagePart[]
  metadata?: any
  createdAt?: Date
}

// ============================================================================
// MESSAGE STORE - OPTIMIZED ARCHITECTURE
// ============================================================================
// Key insight: Jotai atomFamily creates INDEPENDENT atoms for each key.
// When we use atomFamily with primitive atoms (not derived), each message
// has its own atom that can be updated without affecting other messages.
//
// Architecture:
// - messageAtomFamily: atomFamily<messageId, Message | null> - INDEPENDENT atoms per message
// - messageIdsAtom: string[] - ordered list of message IDs for rendering
// - messageRolesAtom: Map<messageId, role> - cached roles for grouping (avoids reading all messages)
// - lastMessageIdAtom: derived atom for the last message ID
// - streamingMessageIdAtom: ID of currently streaming message (or null)
//
// During streaming:
// - Only the streaming message's atom is updated
// - Other message atoms remain unchanged → no re-renders
// ============================================================================

// Per-message atom family - each message has its own INDEPENDENT atom
// This is the key optimization: updating one message doesn't affect others
export const messageAtomFamily = atomFamily((_messageId: string) =>
  atom<Message | null>(null)
)

// Track active message IDs per subChat for cleanup
const activeMessageIdsByChat = new Map<string, Set<string>>()

// Ordered list of message IDs (for rendering order)
export const messageIdsAtom = atom<string[]>([])

// Message roles cache - updated only when messages are added/removed
// This avoids reading all message atoms just to check roles
const messageRolesAtom = atom<Map<string, "user" | "assistant" | "system">>(new Map())

// Currently streaming message ID (null if not streaming)
export const streamingMessageIdAtom = atom<string | null>(null)

// Chat status atom
export const chatStatusAtom = atom<string>("ready")

// Rollback handler/state (optional) to avoid prop drilling
export const rollbackHandlerAtom = atom<((msg: any) => void) | null>(null)
export const isRollingBackAtom = atom<boolean>(false)

// Current subChatId - used to isolate caches per chat
export const currentSubChatIdAtom = atom<string>("default")

// Last message ID - derived (uses stable messageIdsAtom)
export const lastMessageIdAtom = atom((get) => {
  const ids = get(messageIdsAtom)
  return ids.length > 0 ? ids[ids.length - 1] : null
})

// ============================================================================
// SELECTORS
// ============================================================================

// Check if a specific message is the last one
export const isLastMessageAtomFamily = atomFamily((messageId: string) =>
  atom((get) => get(lastMessageIdAtom) === messageId)
)

// Check if a specific message is currently streaming
export const isMessageStreamingAtomFamily = atomFamily((messageId: string) =>
  atom((get) => {
    const streamingId = get(streamingMessageIdAtom)
    const lastId = get(lastMessageIdAtom)
    // A message is streaming if it's the last message and there's active streaming
    return messageId === lastId && streamingId === messageId
  })
)

// ============================================================================
// TEXT PART ATOMS - For IsolatedTextPart optimization
// ============================================================================
// Problem: When IsolatedTextPart subscribes to messageAtomFamily, ALL text parts
// of that message re-render when ANY part changes (even tool parts).
//
// Solution: Create a derived atom that extracts ONLY the specific text part.
// This way, a text part only re-renders when ITS text changes, not when
// other parts of the same message change.

// Cache for text part content to return stable references
const textPartCache = new Map<string, string>()

export const textPartAtomFamily = atomFamily((key: string) => {
  // Key format: "messageId:partIndex"
  const [messageId, partIndexStr] = key.split(":")
  const partIndex = parseInt(partIndexStr!, 10)

  return atom((get) => {
    const message = get(messageAtomFamily(messageId!))
    const parts = message?.parts || []
    const part = parts[partIndex]
    const text = part?.type === "text" ? (part.text || "") : ""

    // Return cached value if text hasn't changed (stable reference)
    const cached = textPartCache.get(key)
    if (cached === text) {
      return cached
    }

    textPartCache.set(key, text)
    return text
  })
})

// ============================================================================
// MESSAGE PARTS STRUCTURE - For AssistantMessageItem optimization
// ============================================================================
// Problem: AssistantMessageItem subscribes to the whole message object.
// When ANY part changes (including text content), the whole component re-renders,
// causing all IsolatedTextPart children to re-render.
//
// Solution: Create an atom that returns only the STRUCTURE of parts (types, states,
// toolCallIds) without text content. This way AssistantMessageItem only re-renders
// when the structure changes (new part added, tool state changed), not when text
// content streams in.

interface PartStructure {
  type: string
  toolCallId?: string
  state?: string
  // For tools we need input to determine rendering
  inputJson?: string
  // For tool results
  hasOutput?: boolean
  hasResult?: boolean
  hasError?: boolean
  // For text parts - whether text is non-empty (without including actual text)
  hasText?: boolean
}

interface MessageStructure {
  id: string
  role: "user" | "assistant" | "system"
  partsStructure: PartStructure[]
  metadata?: any
}

// Cache for message structure
const messageStructureCache = new Map<string, MessageStructure>()

export const messageStructureAtomFamily = atomFamily((messageId: string) =>
  atom((get) => {
    const message = get(messageAtomFamily(messageId))
    if (!message) return null

    // Build structure without text content
    const partsStructure: PartStructure[] = (message.parts || []).map((part: any) => {
      const structure: PartStructure = {
        type: part.type,
      }
      if (part.toolCallId) structure.toolCallId = part.toolCallId
      if (part.state) structure.state = part.state
      // For tools, include input as JSON for comparison
      if (part.input) structure.inputJson = JSON.stringify(part.input)
      if (part.output !== undefined) structure.hasOutput = true
      if (part.result !== undefined) structure.hasResult = true
      if (part.error !== undefined || part.errorText !== undefined) structure.hasError = true
      // For text parts, track whether text is non-empty (without including actual text)
      if (part.type === "text") structure.hasText = !!part.text?.trim()
      return structure
    })

    const newStructure: MessageStructure = {
      id: message.id,
      role: message.role,
      partsStructure,
      metadata: message.metadata,
    }

    // Check if structure changed
    const cached = messageStructureCache.get(messageId)
    if (cached) {
      // Compare structures
      if (
        cached.id === newStructure.id &&
        cached.role === newStructure.role &&
        cached.partsStructure.length === newStructure.partsStructure.length &&
        cached.partsStructure.every((p, i) => {
          const n = newStructure.partsStructure[i]
          return (
            p.type === n?.type &&
            p.toolCallId === n?.toolCallId &&
            p.state === n?.state &&
            p.inputJson === n?.inputJson &&
            p.hasOutput === n?.hasOutput &&
            p.hasResult === n?.hasResult &&
            p.hasError === n?.hasError &&
            p.hasText === n?.hasText
          )
        }) &&
        // Shallow compare metadata (for usage tracking)
        cached.metadata === message.metadata
      ) {
        return cached
      }
    }

    messageStructureCache.set(messageId, newStructure)
    return newStructure
  })
)

// ============================================================================
// USER MESSAGE IDS - For IsolatedMessagesSection
// ============================================================================
// Uses a cache to return stable reference when IDs haven't changed
// Cache is per-subChatId to avoid collisions between different chats

const userMessageIdsCacheByChat = new Map<string, string[]>()
export const userMessageIdsAtom = atom((get) => {
  const ids = get(messageIdsAtom)
  const roles = get(messageRolesAtom)
  const subChatId = get(currentSubChatIdAtom)
  const newUserIds = ids.filter((id) => roles.get(id) === "user")

  // Return cached array if content is the same
  const cached = userMessageIdsCacheByChat.get(subChatId)
  if (
    cached &&
    newUserIds.length === cached.length &&
    newUserIds.every((id, i) => id === cached[i])
  ) {
    return cached
  }

  userMessageIdsCacheByChat.set(subChatId, newUserIds)
  return newUserIds
})

// ============================================================================
// MESSAGE GROUPS - For rendering structure
// ============================================================================

type MessageGroupType = { userMsgId: string; assistantMsgIds: string[] }
const messageGroupsCacheByChat = new Map<string, MessageGroupType[]>()

export const messageGroupsAtom = atom((get) => {
  const ids = get(messageIdsAtom)
  const roles = get(messageRolesAtom)
  const subChatId = get(currentSubChatIdAtom)

  const groups: MessageGroupType[] = []
  let currentGroup: MessageGroupType | null = null

  for (const id of ids) {
    const role = roles.get(id)
    if (!role) continue

    if (role === "user") {
      if (currentGroup) {
        groups.push(currentGroup)
      }
      currentGroup = { userMsgId: id, assistantMsgIds: [] }
    } else if (currentGroup && role === "assistant") {
      currentGroup.assistantMsgIds.push(id)
    }
  }

  if (currentGroup) {
    groups.push(currentGroup)
  }

  // Check if groups structurally match cached
  const cachedMessageGroups = messageGroupsCacheByChat.get(subChatId) ?? []
  if (groups.length === cachedMessageGroups.length) {
    let allMatch = true
    for (let i = 0; i < groups.length; i++) {
      const newGroup = groups[i]
      const cachedGroup = cachedMessageGroups[i]
      if (
        newGroup.userMsgId !== cachedGroup?.userMsgId ||
        newGroup.assistantMsgIds.length !== cachedGroup?.assistantMsgIds.length ||
        !newGroup.assistantMsgIds.every((id, j) => id === cachedGroup?.assistantMsgIds[j])
      ) {
        allMatch = false
        break
      }
    }
    if (allMatch) {
      return cachedMessageGroups
    }
  }

  messageGroupsCacheByChat.set(subChatId, groups)
  return groups
})

// ============================================================================
// ASSISTANT IDS FOR USER MESSAGE - For IsolatedMessageGroup
// ============================================================================

// Key format: "subChatId:userMsgId" to isolate per chat
const assistantIdsCacheByChat = new Map<string, string[]>()
export const assistantIdsForUserMsgAtomFamily = atomFamily((userMsgId: string) =>
  atom((get) => {
    const groups = get(messageGroupsAtom)
    const subChatId = get(currentSubChatIdAtom)
    const group = groups.find((g) => g.userMsgId === userMsgId)
    const newIds = group?.assistantMsgIds ?? []

    // Return cached array if content is the same
    const cacheKey = `${subChatId}:${userMsgId}`
    const cached = assistantIdsCacheByChat.get(cacheKey)
    if (
      cached &&
      cached.length === newIds.length &&
      cached.every((id, i) => id === newIds[i])
    ) {
      return cached
    }

    assistantIdsCacheByChat.set(cacheKey, newIds)
    return newIds
  })
)

// Is this user message the last one?
export const isLastUserMessageAtomFamily = atomFamily((userMsgId: string) =>
  atom((get) => {
    const userIds = get(userMessageIdsAtom)
    return userIds[userIds.length - 1] === userMsgId
  })
)

// ============================================================================
// STREAMING STATUS
// ============================================================================

export const isStreamingAtom = atom((get) => {
  const status = get(chatStatusAtom)
  return status === "streaming" || status === "submitted"
})

// Has any messages
export const hasMessagesAtom = atom((get) => {
  const ids = get(messageIdsAtom)
  return ids.length > 0
})

// ============================================================================
// LAST ASSISTANT MESSAGE - For plan detection
// ============================================================================

// Cache for last assistant message to avoid re-reading on every check
// Keyed by subChatId to isolate per chat
const lastAssistantCacheByChat = new Map<string, { id: string | null; msg: Message | null }>()

export const lastAssistantMessageAtom = atom((get) => {
  const ids = get(messageIdsAtom)
  const roles = get(messageRolesAtom)
  const subChatId = get(currentSubChatIdAtom)

  // Find the last assistant ID
  let lastAssistantId: string | null = null
  for (let i = ids.length - 1; i >= 0; i--) {
    if (roles.get(ids[i]!) === "assistant") {
      lastAssistantId = ids[i]!
      break
    }
  }

  const cached = lastAssistantCacheByChat.get(subChatId)

  if (!lastAssistantId) {
    lastAssistantCacheByChat.set(subChatId, { id: null, msg: null })
    return null
  }

  // If same ID, return cached message
  if (lastAssistantId === cached?.id && cached.msg) {
    // But we need to get fresh message in case it changed during streaming
    const freshMsg = get(messageAtomFamily(lastAssistantId))
    if (freshMsg === cached.msg) {
      return cached.msg
    }
    lastAssistantCacheByChat.set(subChatId, { id: lastAssistantId, msg: freshMsg })
    return freshMsg
  }

  // Different ID, get fresh message
  const msg = get(messageAtomFamily(lastAssistantId))
  lastAssistantCacheByChat.set(subChatId, { id: lastAssistantId, msg })
  return msg
})

// Has unapproved plan (for approve button)
export const hasUnapprovedPlanAtom = atom((get) => {
  const lastAssistant = get(lastAssistantMessageAtom)
  if (!lastAssistant) return false

  const parts = lastAssistant.parts || []
  for (const part of parts) {
    if (part.type === "tool-invocation" && part.toolName === "ExitPlanMode") {
      if (!part.result) return true
    }
  }
  return false
})

// ============================================================================
// TOKEN DATA - For input area
// ============================================================================

// Cache for token data to avoid full recalculation
// Keyed by subChatId to isolate per chat
type TokenData = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  totalTokens: number
  messageCount: number
  // Track last message's output tokens to detect when streaming completes
  lastMsgOutputTokens: number
}
const tokenDataCacheByChat = new Map<string, TokenData>()

export const messageTokenDataAtom = atom((get) => {
  const ids = get(messageIdsAtom)
  const subChatId = get(currentSubChatIdAtom)

  // Get the last message to check if its tokens changed
  const lastId = ids[ids.length - 1]
  const lastMsg = lastId ? get(messageAtomFamily(lastId)) : null
  const lastMsgOutputTokens = (lastMsg?.metadata as any)?.usage?.outputTokens || 0

  const cached = tokenDataCacheByChat.get(subChatId)

  // Cache is valid if:
  // 1. Message count is the same AND
  // 2. Last message's output tokens haven't changed (detects streaming completion)
  if (
    cached &&
    ids.length === cached.messageCount &&
    lastMsgOutputTokens === cached.lastMsgOutputTokens
  ) {
    return cached
  }

  // Recalculate token data
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let reasoningTokens = 0

  for (const id of ids) {
    const msg = get(messageAtomFamily(id))
    const metadata = msg?.metadata as any
    if (metadata?.usage) {
      inputTokens += metadata.usage.inputTokens || 0
      outputTokens += metadata.usage.outputTokens || 0
      cacheReadTokens += metadata.usage.cacheReadInputTokens || 0
      cacheWriteTokens += metadata.usage.cacheCreationInputTokens || 0
      reasoningTokens += metadata.usage.reasoningTokens || 0
    }
  }

  const newTokenData: TokenData = {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens,
    messageCount: ids.length,
    lastMsgOutputTokens,
  }

  tokenDataCacheByChat.set(subChatId, newTokenData)
  return newTokenData
})

// ============================================================================
// SYNC WITH STATUS - Main sync function
// ============================================================================
// This is called from useChat to sync messages to the store.
// Key optimization: Only updates atoms for messages that actually changed.
// ============================================================================

// Track previous message state to detect changes
// Key format: "subChatId:msgId" to isolate per chat
//
// NOTE: This is a simplified change detection optimized for streaming performance.
// It only checks the LAST part (partsLength + lastPartText + lastPartState).
// During streaming, only the last part changes, so this is sufficient and fast.
//
// Compare with messages-list.tsx which uses a more thorough check (all parts'
// textLengths[] and partStates[]) for useSyncExternalStore. That approach is
// more comprehensive but slightly slower. Both are correct for their use cases:
// - This (message-store): Jotai atom updates during high-frequency streaming
// - messages-list.tsx: External store subscription for React render triggering
const previousMessageState = new Map<string, {
  partsLength: number
  lastPartText: string | undefined
  lastPartState: string | undefined
  lastPartInputJson: string | undefined
}>()

function hasMessageChanged(subChatId: string, msgId: string, msg: Message): boolean {
  const cacheKey = `${subChatId}:${msgId}`
  const prev = previousMessageState.get(cacheKey)
  const parts = msg.parts || []
  const lastPart = parts[parts.length - 1]

  const current = {
    partsLength: parts.length,
    lastPartText: lastPart?.text,
    lastPartState: lastPart?.state,
    lastPartInputJson: lastPart?.input ? JSON.stringify(lastPart.input) : undefined,
  }

  if (!prev) {
    previousMessageState.set(cacheKey, current)
    return true
  }

  const changed =
    prev.partsLength !== current.partsLength ||
    prev.lastPartText !== current.lastPartText ||
    prev.lastPartState !== current.lastPartState ||
    prev.lastPartInputJson !== current.lastPartInputJson

  if (changed) {
    previousMessageState.set(cacheKey, current)
  }

  return changed
}

export const syncMessagesWithStatusAtom = atom(
  null,
  (get, set, payload: { messages: Message[]; status: string; subChatId?: string }) => {
    const { messages, status, subChatId } = payload

    // Update current subChatId if provided AND changed
    // Avoid unnecessary set() calls - even though Jotai won't re-render for same primitive,
    // this saves the overhead of the comparison check in subscribers
    const prevSubChatId = get(currentSubChatIdAtom)
    if (subChatId && subChatId !== prevSubChatId) {
      set(currentSubChatIdAtom, subChatId)
    }
    const currentSubChatId = subChatId ?? prevSubChatId

    // Update status only if changed
    const prevStatus = get(chatStatusAtom)
    if (status !== prevStatus) {
      set(chatStatusAtom, status)
    }

    const currentIds = get(messageIdsAtom)
    const currentRoles = get(messageRolesAtom)

    // Build new IDs list and roles map
    const newIds = messages.map((m) => m.id)
    const newRoles = new Map<string, "user" | "assistant" | "system">()

    for (const msg of messages) {
      newRoles.set(msg.id, msg.role)
    }

    // Check if IDs changed (new message added or removed)
    const idsChanged =
      newIds.length !== currentIds.length ||
      newIds.some((id, i) => id !== currentIds[i])

    if (idsChanged) {
      set(messageIdsAtom, newIds)
    }

    // Check if roles changed
    let rolesChanged = newRoles.size !== currentRoles.size
    if (!rolesChanged) {
      for (const [id, role] of newRoles) {
        if (currentRoles.get(id) !== role) {
          rolesChanged = true
          break
        }
      }
    }

    if (rolesChanged) {
      set(messageRolesAtom, newRoles)
    }

    // Update individual message atoms ONLY if they changed
    // This is the key optimization - only changed messages trigger re-renders
    // CRITICAL: AI SDK mutates objects in-place, so we MUST create a new reference
    // for Jotai to detect the change (it uses Object.is() for comparison)
    // We need to deep clone the message because:
    // 1. msg object itself is mutated in-place
    // 2. msg.parts array is mutated in-place
    // 3. Individual part objects inside parts are mutated in-place
    for (const msg of messages) {
      if (hasMessageChanged(currentSubChatId, msg.id, msg)) {
        // Deep clone message with new parts array and new part objects
        const clonedMsg = {
          ...msg,
          parts: msg.parts?.map((part: any) => ({ ...part, input: part.input ? { ...part.input } : undefined })),
        }
        set(messageAtomFamily(msg.id), clonedMsg)
      }
    }

    // Cleanup removed message atoms to prevent memory leaks
    const newIdsSet = new Set(newIds)
    const previousIds = activeMessageIdsByChat.get(currentSubChatId) ?? new Set()

    for (const oldId of previousIds) {
      if (!newIdsSet.has(oldId)) {
        // Message was removed - cleanup its atom and caches
        messageAtomFamily.remove(oldId)
        previousMessageState.delete(`${currentSubChatId}:${oldId}`)
        assistantIdsCacheByChat.delete(`${currentSubChatId}:${oldId}`)
      }
    }

    // Update active IDs tracking
    activeMessageIdsByChat.set(currentSubChatId, newIdsSet)

    // Update streaming message ID
    if (status === "streaming" || status === "submitted") {
      const lastId = newIds[newIds.length - 1] ?? null
      set(streamingMessageIdAtom, lastId)
    } else {
      set(streamingMessageIdAtom, null)
    }
  }
)

// Legacy sync atom (not used, but kept for compatibility)
export const syncMessagesAtom = atom(
  null,
  (get, set, messages: Message[]) => {
    set(syncMessagesWithStatusAtom, { messages, status: get(chatStatusAtom) })
  }
)

// ============================================================================
// CLEANUP - For clearing store when switching chats
// ============================================================================

// Clear all caches for a specific subChat (call when unmounting/switching)
export function clearSubChatCaches(subChatId: string) {
  // Clear message atoms
  const activeIds = activeMessageIdsByChat.get(subChatId)
  if (activeIds) {
    for (const id of activeIds) {
      messageAtomFamily.remove(id)
      previousMessageState.delete(`${subChatId}:${id}`)
      assistantIdsCacheByChat.delete(`${subChatId}:${id}`)
    }
    activeMessageIdsByChat.delete(subChatId)
  }

  // Clear other caches
  userMessageIdsCacheByChat.delete(subChatId)
  messageGroupsCacheByChat.delete(subChatId)
  lastAssistantCacheByChat.delete(subChatId)
  tokenDataCacheByChat.delete(subChatId)
}

// Clear all caches (call on app reset/logout)
export function clearAllCaches() {
  for (const subChatId of activeMessageIdsByChat.keys()) {
    clearSubChatCaches(subChatId)
  }
}

// ============================================================================
// TTS PLAYBACK RATE - For PlayButton
// ============================================================================
// Stored in localStorage and accessible via Jotai atom.
// This allows PlayButton to manage its own state without passing callbacks
// through props (which would break memoization).

export const PLAYBACK_SPEEDS = [1, 2, 3] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

// Atom with localStorage persistence
export const ttsPlaybackRateAtom = atom<PlaybackSpeed>(
  // Initial value from localStorage
  (() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tts-playback-rate")
      if (saved && PLAYBACK_SPEEDS.includes(Number(saved) as PlaybackSpeed)) {
        return Number(saved) as PlaybackSpeed
      }
    }
    return 1
  })()
)

// Write atom that also persists to localStorage
export const setTtsPlaybackRateAtom = atom(
  null,
  (_get, set, rate: PlaybackSpeed) => {
    set(ttsPlaybackRateAtom, rate)
    if (typeof window !== "undefined") {
      localStorage.setItem("tts-playback-rate", String(rate))
    }
  }
)
