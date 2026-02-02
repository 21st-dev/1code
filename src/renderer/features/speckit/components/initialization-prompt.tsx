/**
 * InitializationPrompt Component
 *
 * Displays when SpecKit is not initialized, with one-click setup.
 * Shows missing components and handles initialization with progress feedback.
 *
 * @see specs/001-speckit-ui-integration/plan.md Phase 8
 */

import { memo, useState, useCallback } from "react"
import { FileText, Plus, RefreshCw, AlertCircle, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"

interface InitializationPromptProps {
  /** Project path to initialize */
  projectPath: string
  /** Missing components from initialization check */
  missingComponents: string[]
  /** Whether this is a partial initialization (some components exist) */
  isPartial?: boolean
  /** Callback when initialization completes successfully */
  onInitialized?: () => void
}

type InitState = "idle" | "initializing" | "success" | "error"

/**
 * InitializationPrompt - Prompts user to initialize SpecKit
 *
 * Displays:
 * - Description of SpecKit
 * - List of missing components (if any)
 * - Initialize/Re-initialize button
 * - Progress indicator during initialization
 * - Error handling with retry capability
 */
export const InitializationPrompt = memo(function InitializationPrompt({
  projectPath,
  missingComponents,
  isPartial = false,
  onInitialized,
}: InitializationPromptProps) {
  const [initState, setInitState] = useState<InitState>("idle")
  const [errorMessage, setErrorMessage] = useState<string>("")

  const utils = trpc.useUtils()

  const initMutation = trpc.speckit.initializeSpecKit.useMutation({
    onMutate: () => {
      setInitState("initializing")
      setErrorMessage("")
    },
    onSuccess: (result) => {
      if (result.success) {
        setInitState("success")
        // Invalidate queries to refresh state
        utils.speckit.checkInitialization.invalidate({ projectPath })
        utils.speckit.getWorkflowState.invalidate({ projectPath })
        utils.speckit.getConstitution.invalidate({ projectPath })
        // Notify parent
        onInitialized?.()
      } else {
        setInitState("error")
        setErrorMessage(result.error || "Initialization failed. Please try again.")
      }
    },
    onError: (error) => {
      setInitState("error")
      setErrorMessage(error.message || "An unexpected error occurred.")
    },
  })

  const handleInitialize = useCallback(() => {
    initMutation.mutate({ projectPath })
  }, [initMutation, projectPath])

  const handleRetry = useCallback(() => {
    setInitState("idle")
    setErrorMessage("")
  }, [])

  // Success state - brief display before parent refreshes
  if (initState === "success") {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-center flex-1 text-center">
          <div className="max-w-[280px]">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium mb-2">SpecKit Initialized</p>
            <p className="text-xs text-muted-foreground">
              Setting up your workspace...
            </p>
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground mx-auto mt-4" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (initState === "error") {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-center flex-1 text-center">
          <div className="max-w-[280px]">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm font-medium mb-2">Initialization Failed</p>
            <p className="text-xs text-muted-foreground mb-4">
              {errorMessage}
            </p>
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={handleInitialize}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Initialization
              </Button>
              <Button size="sm" variant="ghost" onClick={handleRetry}>
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Initializing state
  if (initState === "initializing") {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-center flex-1 text-center">
          <div className="max-w-[280px]">
            <RefreshCw className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm font-medium mb-2">Initializing SpecKit</p>
            <p className="text-xs text-muted-foreground mb-2">
              Setting up project structure...
            </p>
            <div className="space-y-1 text-xs text-muted-foreground/70">
              <p>Creating .specify/ directory</p>
              <p>Installing templates</p>
              <p>Setting up configuration</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Idle state - show initialization prompt
  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-center flex-1 text-center">
        <div className="max-w-[280px]">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-2">
            {isPartial ? "Re-initialize SpecKit" : "Initialize SpecKit"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {isPartial
              ? "Some SpecKit components are missing. Re-initialize to restore them."
              : "Initialize ii-spec to enable feature specification workflows."}
          </p>

          {/* Missing Components List */}
          {missingComponents.length > 0 && (
            <div className="text-xs text-muted-foreground mb-4 text-left bg-muted/50 rounded-md p-2">
              <p className="font-medium mb-1">
                {isPartial ? "Missing Components:" : "Will Create:"}
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {missingComponents.slice(0, 5).map((component) => (
                  <li key={component} className="truncate">
                    <code className="text-[10px]">{component}</code>
                  </li>
                ))}
                {missingComponents.length > 5 && (
                  <li className="text-muted-foreground/70">
                    +{missingComponents.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Initialize Button */}
          <Button
            size="sm"
            onClick={handleInitialize}
            disabled={initMutation.isPending}
            className="w-full"
          >
            {initMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {isPartial ? "Re-initialize SpecKit" : "Initialize SpecKit"}
          </Button>

          {/* Command hint */}
          <p className="text-[10px] text-muted-foreground/50 mt-3">
            Runs: <code>specify init . --ai claude</code>
          </p>
        </div>
      </div>
    </div>
  )
})

InitializationPrompt.displayName = "InitializationPrompt"
