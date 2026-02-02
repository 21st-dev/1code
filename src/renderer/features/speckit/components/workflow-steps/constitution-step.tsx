/**
 * ConstitutionStep Component
 *
 * First step of the workflow - view or create constitution.
 * Constitution defines project principles and guidelines.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo } from "react"
import { ScrollText, Sparkles, Loader2, CheckCircle2, ExternalLink, BookOpen, FileText } from "lucide-react"
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
      <div className="mb-6 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Project Constitution</h2>
          {/* Show completion badge when completed */}
          {isCompleted && (
            <span className="ml-auto text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Created
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {isCompleted
            ? "Your project constitution has been created and defines the guiding principles."
            : "Create your project's constitution to define guiding principles and constraints."}
        </p>
      </div>

      {/* Content Section - Conditional rendering based on isCompleted */}
      {isCompleted ? (
        // Show read-only constitution content when completed
        <div className="flex-1 overflow-y-auto border border-border/50 rounded-lg p-4 bg-muted/10">
          {constitutionContent ? (
            <MarkdownView content={constitutionContent} size="md" />
          ) : (
            <p className="text-sm text-muted-foreground">Constitution content not available</p>
          )}
        </div>
      ) : (
        // Show creation prompt when not completed
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mb-6">
              The constitution will be created in <code className="text-xs">.specify/memory/constitution.md</code>
            </p>
            <Button
              onClick={() => onCreate()}
              disabled={isExecuting}
              size="lg"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Constitution...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Create Constitution
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})

ConstitutionStep.displayName = "ConstitutionStep"
