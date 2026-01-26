import { useCallback } from "react"
import { getQueryClient } from "../../../contexts/TRPCProvider"
import { trackMessageSent } from "../../../lib/analytics"
import { api } from "../../../lib/mock-api"
import { clearSubChatDraft } from "../lib/drafts"
import {
  createQueueItem,
  generateQueueId,
  toQueuedFile,
  toQueuedImage,
  toQueuedTextContext,
} from "../lib/queue-utils"
import { MENTION_PREFIXES } from "../mentions"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import { utf8ToBase64 } from "../utils/chat-helpers"
import type { AgentsMentionsEditorHandle } from "../mentions"

type MessagePart = 
  | { type: "text"; text: string }
  | { type: "data-image"; data: any }
  | { type: "data-file"; data: any }

type SendMessageFn = (message: { role: "user"; parts: MessagePart[] }) => Promise<void>

/**
 * Custom hook to handle message sending logic
 * Handles:
 * - Building message parts (images, files, text contexts, diff contexts)
 * - Queue management when streaming
 * - Optimistic updates for sidebar sorting
 * - Auto-rename on first message
 * - Analytics tracking
 * - Clearing inputs and attachments
 */
export function useMessageSending({
  editorRef,
  imagesRef,
  filesRef,
  textContextsRef,
  diffTextContextsRef,
  isStreamingRef,
  sendMessageRef,
  messagesLengthRef,
  isPlanModeRef,
  shouldAutoScrollRef,
  scrollToBottom,
  sandboxSetupStatus,
  isArchived,
  onRestoreWorkspace,
  parentChatId,
  subChatId,
  onAutoRename,
  clearAll,
  clearTextContexts,
  clearDiffTextContexts,
  teamId,
  addToQueue,
  popItemFromQueue,
  handleStop,
  hasTriggeredRenameRef,
}: {
  editorRef: React.RefObject<AgentsMentionsEditorHandle | null>
  imagesRef: React.MutableRefObject<any[]>
  filesRef: React.MutableRefObject<any[]>
  textContextsRef: React.MutableRefObject<any[]>
  diffTextContextsRef: React.MutableRefObject<any[]>
  isStreamingRef: React.MutableRefObject<boolean>
  sendMessageRef: React.MutableRefObject<SendMessageFn | null>
  messagesLengthRef: React.MutableRefObject<number>
  isPlanModeRef: React.MutableRefObject<boolean>
  shouldAutoScrollRef: React.MutableRefObject<boolean>
  scrollToBottom: () => void
  sandboxSetupStatus: string
  isArchived: boolean
  onRestoreWorkspace?: () => void
  parentChatId?: string
  subChatId: string
  onAutoRename: (text: string, subChatId: string) => void
  clearAll: () => void
  clearTextContexts: () => void
  clearDiffTextContexts: () => void
  teamId?: string
  addToQueue: (subChatId: string, item: any) => void
  popItemFromQueue: (subChatId: string, itemId: string) => any
  handleStop: () => Promise<void>
  hasTriggeredRenameRef: React.MutableRefObject<boolean>
}) {
  const utils = api.useUtils()

  // Helper to build message parts from images, files, and text contexts
  const buildMessageParts = useCallback(
    (
      text: string,
      images: any[],
      files: any[],
      textContexts: any[],
      diffTextContexts: any[],
    ): Array<{ type: "text"; text: string } | { type: "data-image" | "data-file"; data: any }> => {
      const parts: any[] = [
        ...images
          .filter((img) => !img.isLoading && img.url)
          .map((img) => ({
            type: "data-image" as const,
            data: {
              url: img.url,
              mediaType: img.mediaType,
              filename: img.filename,
              base64Data: img.base64Data,
            },
          })),
        ...files
          .filter((f) => !f.isLoading && f.url)
          .map((f) => ({
            type: "data-file" as const,
            data: {
              url: f.url,
              mediaType: (f as any).mediaType || (f as any).type,
              filename: f.filename,
              size: f.size,
            },
          })),
      ]

      // Add text contexts as mention tokens
      let mentionPrefix = ""
      if (textContexts.length > 0 || diffTextContexts.length > 0) {
        const quoteMentions = textContexts.map((tc) => {
          const preview = (tc.preview || tc.text.slice(0, 50)).replace(/[:\[\]]/g, "")
          const encodedText = utf8ToBase64(tc.text)
          return `@[${MENTION_PREFIXES.QUOTE}${preview}:${encodedText}]`
        })

        const diffMentions = diffTextContexts.map((dtc) => {
          const preview = (dtc.preview || dtc.text.slice(0, 50)).replace(/[:\[\]]/g, "")
          const encodedText = utf8ToBase64(dtc.text)
          const lineNum = dtc.lineNumber || 0
          return `@[${MENTION_PREFIXES.DIFF}${dtc.filePath}:${lineNum}:${preview}:${encodedText}]`
        })

        mentionPrefix = [...quoteMentions, ...diffMentions].join(" ") + " "
      }

      if (text || mentionPrefix) {
        parts.push({ type: "text", text: mentionPrefix + (text || "") })
      }

      return parts
    },
    [],
  )

  // Helper to update optimistic cache for sidebar sorting
  const updateOptimisticCache = useCallback(
    (chatId: string) => {
      const now = new Date()

      // Update team chats cache
      if (teamId) {
        utils.agents.getAgentChats.setData({ teamId }, (old: any) => {
          if (!old) return old
          const updated = old.map((c: any) =>
            c.id === chatId ? { ...c, updated_at: now } : c,
          )
          return updated.sort(
            (a: any, b: any) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          )
        })
      }

      // Update desktop chats.list cache
      const queryClient = getQueryClient()
      if (queryClient) {
        const queries = queryClient.getQueryCache().getAll()
        const chatsListQuery = queries.find(
          (q) =>
            Array.isArray(q.queryKey) &&
            Array.isArray(q.queryKey[0]) &&
            q.queryKey[0][0] === "chats" &&
            q.queryKey[0][1] === "list",
        )
        if (chatsListQuery) {
          queryClient.setQueryData(chatsListQuery.queryKey, (old: any[] | undefined) => {
            if (!old) return old
            const updated = old.map((c: any) =>
              c.id === chatId ? { ...c, updatedAt: now } : c,
            )
            return updated.sort(
              (a: any, b: any) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
            )
          })
        }
      }

      // Update sub-chat timestamp
      useAgentSubChatStore.getState().updateSubChatTimestamp(subChatId)
    },
    [teamId, subChatId, utils],
  )

  // Main send handler
  const handleSend = useCallback(async () => {
    // Block sending while sandbox is still being set up
    if (sandboxSetupStatus !== "ready") {
      return
    }

    // Get value from uncontrolled editor
    const inputValue = editorRef.current?.getValue() || ""
    const hasText = inputValue.trim().length > 0
    const currentImages = imagesRef.current
    const currentFiles = filesRef.current
    const currentTextContexts = textContextsRef.current
    const hasImages =
      currentImages.filter((img) => !img.isLoading && img.url).length > 0
    const hasTextContexts = currentTextContexts.length > 0

    if (!hasText && !hasImages && !hasTextContexts) return

    // If streaming, add to queue instead of sending directly
    if (isStreamingRef.current) {
      const queuedImages = currentImages
        .filter((img) => !img.isLoading && img.url)
        .map(toQueuedImage)
      const queuedFiles = currentFiles
        .filter((f) => !f.isLoading && f.url)
        .map(toQueuedFile)
      const queuedTextContexts = currentTextContexts.map(toQueuedTextContext)

      const item = createQueueItem(
        generateQueueId(),
        inputValue.trim(),
        queuedImages.length > 0 ? queuedImages : undefined,
        queuedFiles.length > 0 ? queuedFiles : undefined,
        queuedTextContexts.length > 0 ? queuedTextContexts : undefined,
      )
      addToQueue(subChatId, item)

      // Clear input and attachments
      editorRef.current?.clear()
      if (parentChatId) {
        clearSubChatDraft(parentChatId, subChatId)
      }
      clearAll()
      clearTextContexts()
      return
    }

    // Auto-restore archived workspace when sending a message
    if (isArchived && onRestoreWorkspace) {
      onRestoreWorkspace()
    }

    const text = inputValue.trim()
    // Clear editor and draft from localStorage
    editorRef.current?.clear()
    if (parentChatId) {
      clearSubChatDraft(parentChatId, subChatId)
    }

    // Track message sent
    trackMessageSent({
      workspaceId: subChatId,
      messageLength: text.length,
      mode: isPlanModeRef.current ? "plan" : "agent",
    })

    // Trigger auto-rename on first message in a new sub-chat
    if (messagesLengthRef.current === 0 && !hasTriggeredRenameRef.current) {
      hasTriggeredRenameRef.current = true
      onAutoRename(text || "Image message", subChatId)
    }

    // Build message parts
    const currentDiffTextContexts = diffTextContextsRef.current
    const parts = buildMessageParts(
      text,
      currentImages,
      currentFiles,
      currentTextContexts,
      currentDiffTextContexts,
    )

    clearAll()
    clearTextContexts()
    clearDiffTextContexts()

    // Optimistic update for sidebar sorting
    if (parentChatId) {
      updateOptimisticCache(parentChatId)
    }

    // Enable auto-scroll and immediately scroll to bottom
    shouldAutoScrollRef.current = true
    scrollToBottom()

    await sendMessageRef.current({ role: "user", parts })
  }, [
    sandboxSetupStatus,
    isArchived,
    onRestoreWorkspace,
    parentChatId,
    subChatId,
    onAutoRename,
    clearAll,
    clearTextContexts,
    clearDiffTextContexts,
    teamId,
    addToQueue,
    editorRef,
    imagesRef,
    filesRef,
    textContextsRef,
    diffTextContextsRef,
    isStreamingRef,
    sendMessageRef,
    messagesLengthRef,
    isPlanModeRef,
    shouldAutoScrollRef,
    scrollToBottom,
    hasTriggeredRenameRef,
    buildMessageParts,
    updateOptimisticCache,
  ])

  // Queue handler for sending queued messages
  const handleSendFromQueue = useCallback(
    async (itemId: string) => {
      const item = popItemFromQueue(subChatId, itemId)
      if (!item) return

      // Stop current stream if streaming
      if (isStreamingRef.current) {
        await handleStop()
        // Small delay to ensure stop completes
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Build message parts from queued item
      const parts = buildMessageParts(
        item.message || "",
        item.images || [],
        item.files || [],
        item.textContexts || [],
        item.diffTextContexts || [],
      )

      // Track message sent
      trackMessageSent({
        workspaceId: subChatId,
        messageLength: item.message.length,
        mode: isPlanModeRef.current ? "plan" : "agent",
      })

      // Update timestamps
      if (parentChatId) {
        updateOptimisticCache(parentChatId)
      }

      // Enable auto-scroll and immediately scroll to bottom
      shouldAutoScrollRef.current = true
      scrollToBottom()

      await sendMessageRef.current({ role: "user", parts })
    },
    [
      subChatId,
      popItemFromQueue,
      handleStop,
      isStreamingRef,
      sendMessageRef,
      isPlanModeRef,
      shouldAutoScrollRef,
      scrollToBottom,
      parentChatId,
      buildMessageParts,
      updateOptimisticCache,
    ],
  )

  // Force send - stop stream and send immediately, bypassing queue (Opt+Enter)
  const handleForceSend = useCallback(async () => {
    // Block sending while sandbox is still being set up
    if (sandboxSetupStatus !== "ready") {
      return
    }

    // Get value from uncontrolled editor
    const inputValue = editorRef.current?.getValue() || ""
    const hasText = inputValue.trim().length > 0
    const currentImages = imagesRef.current
    const currentFiles = filesRef.current
    const hasImages =
      currentImages.filter((img) => !img.isLoading && img.url).length > 0

    if (!hasText && !hasImages) return

    // Stop current stream if streaming
    if (isStreamingRef.current) {
      await handleStop()
      // Small delay to ensure stop completes
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Auto-restore archived workspace when sending a message
    if (isArchived && onRestoreWorkspace) {
      onRestoreWorkspace()
    }

    const text = inputValue.trim()
    // Clear editor and draft from localStorage
    editorRef.current?.clear()
    if (parentChatId) {
      clearSubChatDraft(parentChatId, subChatId)
    }

    // Track message sent
    trackMessageSent({
      workspaceId: subChatId,
      messageLength: text.length,
      mode: isPlanModeRef.current ? "plan" : "agent",
    })

    // Build message parts (no text contexts for force send)
    const parts = buildMessageParts(text, currentImages, currentFiles, [], [])

    // Clear attachments
    clearAll()

    // Update timestamps
    if (parentChatId) {
      updateOptimisticCache(parentChatId)
    }

    // Force scroll to bottom
    shouldAutoScrollRef.current = true
    scrollToBottom()

    await sendMessageRef.current({ role: "user", parts })
  }, [
    sandboxSetupStatus,
    isArchived,
    onRestoreWorkspace,
    parentChatId,
    subChatId,
    handleStop,
    clearAll,
    editorRef,
    imagesRef,
    filesRef,
    isStreamingRef,
    sendMessageRef,
    isPlanModeRef,
    shouldAutoScrollRef,
    scrollToBottom,
    buildMessageParts,
    updateOptimisticCache,
  ])

  return {
    handleSend,
    handleSendFromQueue,
    handleForceSend,
  }
}
