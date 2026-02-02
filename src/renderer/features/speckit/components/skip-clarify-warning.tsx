/**
 * SkipClarifyWarningBanner Component
 *
 * Warning shown when user tries to skip the Clarify step
 * when there are unresolved clarification questions.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo } from "react"
import { AlertCircle, X, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SkipClarifyWarningBannerProps {
  /** Number of unanswered questions */
  questionCount: number
  /** Callback when user confirms skip */
  onConfirmSkip: () => void
  /** Callback to dismiss and stay on clarify */
  onCancel: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * SkipClarifyWarningBanner - Warning for skipping clarification
 */
export const SkipClarifyWarningBanner = memo(function SkipClarifyWarningBanner({
  questionCount,
  onConfirmSkip,
  onCancel,
  className,
}: SkipClarifyWarningBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50",
        className
      )}
      role="alert"
    >
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          There {questionCount === 1 ? "is" : "are"}{" "}
          <span className="font-medium">{questionCount}</span>{" "}
          unanswered clarification {questionCount === 1 ? "question" : "questions"}.
          Skipping may result in a less accurate specification.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Stay
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
          onClick={onConfirmSkip}
        >
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip Anyway
        </Button>
      </div>
    </div>
  )
})

SkipClarifyWarningBanner.displayName = "SkipClarifyWarningBanner"

/**
 * Simple inline skip confirmation dialog
 */
export const SkipConfirmationDialog = memo(function SkipConfirmationDialog({
  isOpen,
  questionCount,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  questionCount: number
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-lg shadow-lg max-w-md mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2">Skip Clarification?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              There {questionCount === 1 ? "is" : "are"}{" "}
              <span className="font-medium">{questionCount}</span>{" "}
              unanswered {questionCount === 1 ? "question" : "questions"}.
              Proceeding without answering may result in a less accurate specification
              and implementation plan.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onCancel}>
                Go Back
              </Button>
              <Button variant="default" onClick={onConfirm}>
                Skip Anyway
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

SkipConfirmationDialog.displayName = "SkipConfirmationDialog"
