/**
 * ConstitutionStep Component
 *
 * First step of the workflow - view or create constitution.
 * Constitution defines project principles and guidelines.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo } from "react"
import { ScrollText, Sparkles, Loader2, CheckCircle2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownView } from "../markdown-view"

interface ConstitutionStepProps {
  /** Constitution content (if exists) */
  constitutionContent?: string
  /** Whether constitution exists */
  constitutionExists: boolean
  /** Callback to create constitution */
  onCreate: () => void
  /** Callback to proceed to next step */
  onProceed: () => void
  /** Callback to open in editor */
  onOpenInEditor?: () => void
  /** Whether the command is executing */
  isExecuting: boolean
  /** Whether this step is completed */
  isCompleted: boolean
}

/**
 * ConstitutionStep - View or create project constitution
 */
export const ConstitutionStep = memo(function ConstitutionStep({
  constitutionContent,
  constitutionExists,
  onCreate,
  onProceed,
  onOpenInEditor,
  isExecuting,
  isCompleted,
}: ConstitutionStepProps) {
  // No constitution yet - show create option
  if (!constitutionExists && !constitutionContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <ScrollText className="h-12 w-12 text-primary/50 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Project Constitution</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          The constitution defines the core principles and guidelines for your project.
          It helps maintain consistency across features and ensures AI assistants
          understand your project's standards.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onProceed}
            disabled={isExecuting}
          >
            Skip for Now
          </Button>
          <Button
            onClick={onCreate}
            disabled={isExecuting}
            className="min-w-[180px]"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Constitution
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Constitution exists - show content
  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Project Constitution</h2>
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </span>
          </div>
          {onOpenInEditor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenInEditor}
              className="text-muted-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Review your project's guiding principles. These will inform all feature specifications.
        </p>
      </div>

      {/* Constitution Content */}
      <div className="flex-1 overflow-y-auto bg-muted/20 rounded-lg p-4 border border-border/50">
        {isExecuting ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Creating constitution...</p>
            </div>
          </div>
        ) : constitutionContent ? (
          <MarkdownView content={constitutionContent} size="md" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Constitution content will appear here</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4 flex-shrink-0">
        <p className="text-xs text-muted-foreground">
          Your constitution is ready. Proceed to specify a new feature.
        </p>
        <Button
          onClick={onProceed}
          disabled={isExecuting}
          className="min-w-[180px]"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Continue to Specify
        </Button>
      </div>
    </div>
  )
})

ConstitutionStep.displayName = "ConstitutionStep"
