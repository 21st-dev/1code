import { memo, useRef, forwardRef, useImperativeHandle } from "react"
import { AgentUserQuestion, type AgentUserQuestionHandle } from "../ui/agent-user-question"
import type { PendingUserQuestion } from "../atoms"

interface UserQuestionsPanelProps {
  pendingQuestions: PendingUserQuestion | null
  subChatId: string
  onAnswer: (answers: Record<string, string>) => Promise<void>
  onSkip: () => Promise<void>
  inputHasContent: boolean
}

export interface UserQuestionsPanelRef {
  getAnswers: () => Record<string, string> | null
}

/**
 * Component that displays the user questions panel when AskUserQuestion tool is called
 * Only shows if the pending question belongs to the current sub-chat
 */
export const UserQuestionsPanel = memo(
  forwardRef<UserQuestionsPanelRef, UserQuestionsPanelProps>(
    function UserQuestionsPanel(
      { pendingQuestions, subChatId, onAnswer, onSkip, inputHasContent },
      ref,
    ) {
      const questionRef = useRef<AgentUserQuestionHandle>(null)

      // Expose getAnswers method to parent component
      useImperativeHandle(
        ref,
        () => ({
          getAnswers: () => questionRef.current?.getAnswers() || null,
        }),
        [],
      )

      if (!pendingQuestions) {
        return null
      }

      return (
        <div className="px-4 relative z-20">
          <div className="w-full px-2 max-w-2xl mx-auto">
            <AgentUserQuestion
              ref={questionRef}
              pendingQuestions={pendingQuestions}
              onAnswer={onAnswer}
              onSkip={onSkip}
              hasCustomText={inputHasContent}
            />
          </div>
        </div>
      )
    },
  ),
)
