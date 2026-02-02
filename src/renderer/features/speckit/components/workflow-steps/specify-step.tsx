/**
 * SpecifyStep Component
 *
 * First workflow step for entering feature description.
 * User enters feature description and clicks to generate spec.md.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useState, useCallback } from "react"
import { FileText, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface SpecifyStepProps {
  /** Callback when user submits feature description */
  onSubmit: (description: string) => void
  /** Whether the command is executing */
  isExecuting: boolean
  /** Whether this step is already completed */
  isCompleted: boolean
  /** Existing description (for re-running) */
  existingDescription?: string
}

/**
 * SpecifyStep - Feature description input form
 */
export const SpecifyStep = memo(function SpecifyStep({
  onSubmit,
  isExecuting,
  isCompleted,
  existingDescription = "",
}: SpecifyStepProps) {
  const [description, setDescription] = useState(existingDescription)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = description.trim()
    if (!trimmed) {
      setError("Please enter a feature description")
      return
    }

    if (trimmed.length < 10) {
      setError("Description should be at least 10 characters")
      return
    }

    setError(null)
    onSubmit(trimmed)
  }, [description, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Submit on Cmd/Ctrl + Enter
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Specify Feature</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Describe the feature you want to build. Be specific about what users should be able to do
          and any important requirements.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col gap-2">
          <Label htmlFor="feature-description" className="text-sm font-medium">
            Feature Description
          </Label>
          <Textarea
            id="feature-description"
            placeholder="Example: Add a dark mode toggle to the settings page that allows users to switch between light and dark themes. The preference should persist across sessions..."
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "flex-1 min-h-[200px] resize-none",
              error && "border-red-500 focus-visible:ring-red-500"
            )}
            disabled={isExecuting}
          />
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘</kbd>+
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to submit
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4">
          <div className="text-xs text-muted-foreground">
            {description.length > 0 && (
              <span>{description.length} characters</span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isExecuting || !description.trim()}
            className="min-w-[140px]"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : isCompleted ? (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Regenerate Spec
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Spec
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 p-4 bg-muted/30 rounded-lg">
        <h3 className="text-sm font-medium mb-2">Tips for a good spec</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Describe what users can do, not how to implement it</li>
          <li>• Include acceptance criteria when possible</li>
          <li>• Mention any constraints or requirements</li>
          <li>• Be specific about edge cases you're aware of</li>
        </ul>
      </div>
    </div>
  )
})

SpecifyStep.displayName = "SpecifyStep"
