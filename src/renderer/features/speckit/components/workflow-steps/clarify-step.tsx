/**
 * ClarifyStep Component
 *
 * Second workflow step for answering clarification questions.
 * Displays questions parsed from spec.md [NEEDS CLARIFICATION] markers.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useState, useCallback, useMemo } from "react"
import { HelpCircle, Send, Loader2, CheckCircle2, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ClarificationQuestion } from "../../types"

interface ClarifyStepProps {
  /** Clarification questions parsed from spec.md */
  questions: ClarificationQuestion[]
  /** Callback when user submits answers */
  onSubmit: (answers: Record<string, string>) => void
  /** Callback to skip clarification */
  onSkip?: () => void
  /** Whether the command is executing */
  isExecuting: boolean
  /** Whether clarification is already complete */
  isCompleted: boolean
}

/**
 * ClarifyStep - Clarification question answering
 */
export const ClarifyStep = memo(function ClarifyStep({
  questions,
  onSubmit,
  onSkip,
  isExecuting,
  isCompleted,
}: ClarifyStepProps) {
  // Initialize answers state
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    questions.reduce((acc, q, index) => {
      acc[`Q${index + 1}`] = ""
      return acc
    }, {} as Record<string, string>)
  )

  // Track which questions are answered
  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a.trim().length > 0).length,
    [answers]
  )

  const allAnswered = answeredCount === questions.length

  const handleAnswerChange = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  const handleSubmit = useCallback(() => {
    // Filter out empty answers
    const filledAnswers = Object.fromEntries(
      Object.entries(answers).filter(([_, v]) => v.trim().length > 0)
    )

    if (Object.keys(filledAnswers).length === 0) {
      return
    }

    onSubmit(filledAnswers)
  }, [answers, onSubmit])

  // No questions state
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
        <h2 className="text-lg font-semibold mb-2">No Clarifications Needed</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          The specification is complete and doesn't require any clarifications.
          You can proceed to the next step.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      {/* Header */}
      <div className="mb-6 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Clarify Requirements</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Answer the following questions to clarify the specification.
          The answers will be incorporated into the spec.
        </p>
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {questions.map((question, index) => {
          const questionId = `Q${index + 1}`
          const answer = answers[questionId] || ""
          const isAnswered = answer.trim().length > 0

          return (
            <div
              key={questionId}
              className={cn(
                "p-4 rounded-lg border transition-colors",
                isAnswered
                  ? "border-green-500/30 bg-green-50/30 dark:bg-green-950/10"
                  : "border-border bg-muted/20"
              )}
            >
              {/* Question Header */}
              <div className="flex items-start gap-3 mb-3">
                <span
                  className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                    isAnswered
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isAnswered ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <div className="flex-1">
                  {question.topic && (
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {question.topic}
                    </span>
                  )}
                  <p className="text-sm font-medium mt-0.5">{question.question}</p>
                </div>
              </div>

              {/* Options (if any) */}
              {question.options && question.options.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 ml-9">
                  {question.options.map((option, optIndex) => (
                    <button
                      key={optIndex}
                      type="button"
                      onClick={() => handleAnswerChange(questionId, option)}
                      className={cn(
                        "px-3 py-1 text-xs rounded-full border transition-colors",
                        answer === option
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {/* Answer Input */}
              <div className="ml-9">
                <Label htmlFor={questionId} className="sr-only">
                  Answer for question {index + 1}
                </Label>
                <Textarea
                  id={questionId}
                  placeholder="Type your answer..."
                  value={answer}
                  onChange={(e) => handleAnswerChange(questionId, e.target.value)}
                  className="min-h-[80px] resize-none"
                  disabled={isExecuting}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4 flex-shrink-0">
        <div className="text-xs text-muted-foreground">
          {answeredCount} of {questions.length} questions answered
        </div>
        <div className="flex items-center gap-2">
          {onSkip && (
            <Button
              variant="ghost"
              onClick={onSkip}
              disabled={isExecuting}
              className="text-muted-foreground"
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Skip
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={isExecuting || answeredCount === 0}
            className="min-w-[160px]"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating Spec...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Answers
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
})

ClarifyStep.displayName = "ClarifyStep"
