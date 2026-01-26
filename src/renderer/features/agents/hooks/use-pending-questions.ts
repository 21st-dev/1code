import { useCallback, useEffect, useMemo, useRef } from "react"
import { useAtom } from "jotai"
import { pendingUserQuestionsAtom } from "../atoms"
import { trpcClient } from "../../../lib/trpc"
import { agentChatStore } from "../stores/agent-chat-store"
import { clearSubChatDraft } from "../lib/drafts"
import type { AgentsMentionsEditorHandle } from "../ui/agents-mentions-editor"
import type { UserQuestionsPanelRef } from "../main/user-questions-panel"
import type { PendingUserQuestion } from "../atoms"

const QUESTIONS_SKIPPED_MESSAGE = "Questions skipped by user"

/**
 * Custom hook to manage pending questions from AskUserQuestion tool
 * Handles:
 * - Syncing pending questions with messages state
 * - Clearing questions when streaming stops
 * - Answering and skipping questions
 * - Submitting questions with custom text from input
 */
export function usePendingQuestions({
  subChatId,
  isStreaming,
  messages,
  editorRef,
  questionPanelRef,
  sendMessageRef,
  stopRef,
  isStreamingRef,
  shouldAutoScrollRef,
  parentChatId,
}: {
  subChatId: string
  isStreaming: boolean
  messages: any[]
  editorRef: React.RefObject<AgentsMentionsEditorHandle | null>
  questionPanelRef: React.RefObject<UserQuestionsPanelRef | null>
  sendMessageRef: React.MutableRefObject<((message: { role: "user"; parts: Array<{ type: "text"; text: string }> }) => Promise<void>) | null>
  stopRef: React.MutableRefObject<(() => Promise<void>) | null>
  isStreamingRef: React.MutableRefObject<boolean>
  shouldAutoScrollRef: React.MutableRefObject<boolean>
  parentChatId?: string
}) {
  const [pendingQuestionsMap, setPendingQuestionsMap] = useAtom(pendingUserQuestionsAtom)
  const pendingQuestions = pendingQuestionsMap.get(subChatId) ?? null

  // Memoize the last assistant message to avoid unnecessary recalculations
  const lastAssistantMessage = useMemo(
    () => messages.findLast((m: any) => m.role === "assistant"),
    [messages],
  )

  // Track previous streaming state to detect stream stop
  const prevIsStreamingRef = useRef(isStreaming)
  // Track if we recently stopped streaming (to prevent sync effect from restoring)
  const recentlyStoppedStreamRef = useRef(false)

  // Helper to clear pending question for this subChat
  const clearPendingQuestionCallback = useCallback(() => {
    setPendingQuestionsMap((current) => {
      if (current.has(subChatId)) {
        const newMap = new Map(current)
        newMap.delete(subChatId)
        return newMap
      }
      return current
    })
  }, [subChatId, setPendingQuestionsMap])

  // Clear pending questions when streaming is aborted
  // This effect runs when isStreaming transitions from true to false
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current
    prevIsStreamingRef.current = isStreaming

    // Detect streaming stop transition
    if (wasStreaming && !isStreaming) {
      // Mark that we recently stopped streaming
      recentlyStoppedStreamRef.current = true
      // Clear the flag after a delay
      const flagTimeout = setTimeout(() => {
        recentlyStoppedStreamRef.current = false
      }, 500)

      // Streaming just stopped - if there's a pending question for this chat,
      // clear it after a brief delay (backend already handled the abort)
      if (pendingQuestions) {
        const timeout = setTimeout(() => {
          // Re-check if still showing the same question (might have been cleared by other means)
          setPendingQuestionsMap((current) => {
            if (current.has(subChatId)) {
              const newMap = new Map(current)
              newMap.delete(subChatId)
              return newMap
            }
            return current
          })
        }, 150) // Small delay to allow for race conditions with transport chunks
        return () => {
          clearTimeout(timeout)
          clearTimeout(flagTimeout)
        }
      }
      return () => clearTimeout(flagTimeout)
    }
  }, [isStreaming, subChatId, pendingQuestions, setPendingQuestionsMap])

  // Sync pending questions with messages state
  // This handles: 1) restoring on chat switch, 2) clearing when question is answered/timed out
  useEffect(() => {
    // Check if there's a pending AskUserQuestion in the last assistant message
    const pendingQuestionPart = lastAssistantMessage?.parts?.find(
      (part: any) =>
        part.type === "tool-AskUserQuestion" &&
        part.state !== "output-available" &&
        part.state !== "output-error" &&
        part.state !== "result" &&
        part.input?.questions,
    ) as any | undefined

    // Helper to clear pending question for this subChat
    const clearPendingQuestion = () => {
      setPendingQuestionsMap((current) => {
        if (current.has(subChatId)) {
          const newMap = new Map(current)
          newMap.delete(subChatId)
          return newMap
        }
        return current
      })
    }

    // If streaming and we already have a pending question for this chat, keep it
    // (transport will manage it via chunks)
    if (isStreaming && pendingQuestions) {
      // But if the question in messages is already answered, clear the atom
      if (!pendingQuestionPart) {
        // Check if the specific toolUseId is now answered
        const answeredPart = lastAssistantMessage?.parts?.find(
          (part: any) =>
            part.type === "tool-AskUserQuestion" &&
            part.toolCallId === pendingQuestions.toolUseId &&
            (part.state === "output-available" ||
              part.state === "output-error" ||
              part.state === "result"),
        )
        if (answeredPart) {
          clearPendingQuestion()
        }
      }
      return
    }

    // Not streaming - DON'T restore pending questions from messages
    // If stream is not active, the question is either:
    // 1. Already answered (state would be "output-available")
    // 2. Interrupted/aborted (should not show dialog)
    // 3. Timed out (should not show dialog)
    // We only show the question dialog during active streaming when
    // the backend is waiting for user response.
    if (pendingQuestionPart) {
      // Don't restore - if there's an existing pending question for this chat, clear it
      if (pendingQuestions) {
        clearPendingQuestion()
      }
    } else {
      // No pending question - clear if belongs to this sub-chat
      if (pendingQuestions) {
        clearPendingQuestion()
      }
    }
  }, [subChatId, lastAssistantMessage, isStreaming, pendingQuestions, setPendingQuestionsMap])

  // Handle answering questions
  const handleQuestionsAnswer = useCallback(
    async (answers: Record<string, string>) => {
      if (!pendingQuestions) return
      await trpcClient.claude.respondToolApproval.mutate({
        toolUseId: pendingQuestions.toolUseId,
        approved: true,
        updatedInput: { questions: pendingQuestions.questions, answers },
      })
      clearPendingQuestionCallback()
    },
    [pendingQuestions, clearPendingQuestionCallback],
  )

  // Handle skipping questions
  const handleQuestionsSkip = useCallback(async () => {
    if (!pendingQuestions) return
    const toolUseId = pendingQuestions.toolUseId

    // Clear UI immediately - don't wait for backend
    // This ensures dialog closes even if stream was already aborted
    clearPendingQuestionCallback()

    // Try to notify backend (may fail if already aborted - that's ok)
    try {
      await trpcClient.claude.respondToolApproval.mutate({
        toolUseId,
        approved: false,
        message: QUESTIONS_SKIPPED_MESSAGE,
      })
    } catch {
      // Stream likely already aborted - ignore
    }
  }, [pendingQuestions, clearPendingQuestionCallback])

  // Ref to prevent double submit of question answer
  const isSubmittingQuestionAnswerRef = useRef(false)

  // Handle answering questions with custom text from input (called on Enter in input)
  const handleSubmitWithQuestionAnswer = useCallback(
    async () => {
      if (!pendingQuestions) return
      if (isSubmittingQuestionAnswerRef.current) return
      isSubmittingQuestionAnswerRef.current = true

      try {
        // 1. Get custom text from input
        const customText = editorRef.current?.getValue()?.trim() || ""
        if (!customText) {
          isSubmittingQuestionAnswerRef.current = false
          return
        }

        // 2. Get already selected answers from question component
        const selectedAnswers = questionPanelRef.current?.getAnswers() || {}
        const formattedAnswers: Record<string, string> = { ...selectedAnswers }

        // 3. Add custom text to the last question as "Other"
        const lastQuestion =
          pendingQuestions.questions[pendingQuestions.questions.length - 1]
        if (lastQuestion) {
          const existingAnswer = formattedAnswers[lastQuestion.question]
          if (existingAnswer) {
            // Append to existing answer
            formattedAnswers[lastQuestion.question] = `${existingAnswer}, Other: ${customText}`
          } else {
            formattedAnswers[lastQuestion.question] = `Other: ${customText}`
          }
        }

        // 4. Submit tool response with all answers
        await trpcClient.claude.respondToolApproval.mutate({
          toolUseId: pendingQuestions.toolUseId,
          approved: true,
          updatedInput: {
            questions: pendingQuestions.questions,
            answers: formattedAnswers,
          },
        })
        clearPendingQuestionCallback()

        // 5. Stop stream if currently streaming
        if (isStreamingRef.current) {
          agentChatStore.setManuallyAborted(subChatId, true)
          await stopRef.current?.()
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        // 6. Clear input
        editorRef.current?.clear()
        if (parentChatId) {
          clearSubChatDraft(parentChatId, subChatId)
        }

        // 7. Send custom text as a new user message
        shouldAutoScrollRef.current = true
        await sendMessageRef.current?.({
          role: "user",
          parts: [{ type: "text", text: customText }],
        })
      } finally {
        isSubmittingQuestionAnswerRef.current = false
      }
    },
    [pendingQuestions, clearPendingQuestionCallback, subChatId, parentChatId, editorRef, questionPanelRef, isStreamingRef, stopRef, shouldAutoScrollRef, sendMessageRef],
  )

  // Memoize the callback to prevent ChatInputArea re-renders
  // Only provide callback when there's a pending question for this subChat
  const submitWithQuestionAnswerCallback = useMemo(
    () =>
      pendingQuestions
        ? handleSubmitWithQuestionAnswer
        : undefined,
    [pendingQuestions, handleSubmitWithQuestionAnswer],
  )

  return {
    pendingQuestions,
    handleQuestionsAnswer,
    handleQuestionsSkip,
    submitWithQuestionAnswerCallback,
  }
}
