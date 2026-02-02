/**
 * PlanPage Component
 *
 * Main SpecKit workflow page displayed in the right drawer.
 * Shows workflow status, feature info, and artifact previews.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useCallback, useState, useEffect } from "react"
import { useSetAtom } from "jotai"
import { FileText, RefreshCw, Sparkles, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { MarkdownView } from "./markdown-view"
import { WorkflowModal } from "./workflow-modal"
import { ConstitutionSection } from "./constitution-section"
import { FeaturesTable } from "./features-table"
import { InitializationPrompt } from "./initialization-prompt"
import { SubmoduleWarning } from "./submodule-warning"
import { SpecKitErrorBoundary } from "./speckit-error-boundary"
import { speckitModalOpenAtom, speckitWorkflowStartStepAtom } from "../atoms"
import {
  WORKFLOW_STEP_LABELS,
  WORKFLOW_STEPS_ORDER,
  type WorkflowStepName,
} from "../types"

interface PlanPageProps {
  /** Chat/workspace ID */
  chatId?: string
  /** Project path (required) */
  projectPath?: string
  /** Callback when close button is clicked */
  onClose?: () => void
}

/**
 * PlanPage - SpecKit workflow management page
 *
 * Displays:
 * - Current workflow state (detected from Git branch + files)
 * - Feature info with artifacts
 * - Workflow stepper showing progress
 * - Action buttons for workflow steps
 */
export const PlanPage = memo(function PlanPage({
  chatId,
  projectPath,
  onClose,
}: PlanPageProps) {
  const setModalOpen = useSetAtom(speckitModalOpenAtom)
  const setWorkflowStartStep = useSetAtom(speckitWorkflowStartStepAtom)

  // Open workflow modal
  const handleOpenWorkflow = useCallback(() => {
    setModalOpen(true)
  }, [setModalOpen])

  // Handle create constitution - opens workflow modal at constitution step
  const handleCreateConstitution = useCallback(() => {
    setWorkflowStartStep("constitution")
    setModalOpen(true)
  }, [setWorkflowStartStep, setModalOpen])

  // Query workflow state
  const {
    data: workflowState,
    isLoading: isWorkflowLoading,
    refetch: refetchWorkflow,
  } = trpc.speckit.getWorkflowState.useQuery(
    { projectPath: projectPath || "" },
    { enabled: !!projectPath, refetchOnWindowFocus: false }
  )

  // Query initialization status
  const { data: initStatus, isLoading: isInitLoading } =
    trpc.speckit.checkInitialization.useQuery(
      { projectPath: projectPath || "" },
      { enabled: !!projectPath }
    )

  // Query submodule status (T123)
  const { data: submoduleStatus } =
    trpc.speckit.checkSubmodule.useQuery(
      { projectPath: projectPath || "" },
      { enabled: !!projectPath }
    )

  // State for submodule warning dialog (T124)
  const [showSubmoduleWarning, setShowSubmoduleWarning] = useState(false)
  const [submoduleWarningDismissed, setSubmoduleWarningDismissed] = useState(false)

  // Show submodule warning if not initialized and not dismissed
  useEffect(() => {
    if (submoduleStatus && !submoduleStatus.initialized && !submoduleWarningDismissed) {
      setShowSubmoduleWarning(true)
    }
  }, [submoduleStatus, submoduleWarningDismissed])

  // Query current artifact content based on workflow state
  const { data: specArtifact } = trpc.speckit.getArtifact.useQuery(
    {
      projectPath: projectPath || "",
      featureBranch: workflowState?.branchName || "",
      artifactType: "spec",
    },
    {
      enabled:
        !!projectPath &&
        !!workflowState?.branchName &&
        workflowState.artifactsPresent.spec,
    }
  )

  const { data: planArtifact } = trpc.speckit.getArtifact.useQuery(
    {
      projectPath: projectPath || "",
      featureBranch: workflowState?.branchName || "",
      artifactType: "plan",
    },
    {
      enabled:
        !!projectPath &&
        !!workflowState?.branchName &&
        workflowState.artifactsPresent.plan,
    }
  )


  // No project selected
  if (!projectPath) {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-center flex-1 text-center">
          <div className="max-w-[200px]">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Select a project to view SpecKit workflow
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isWorkflowLoading || isInitLoading) {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Not initialized - show InitializationPrompt component
  if (initStatus && !initStatus.initialized) {
    // Check if this is a partial initialization (some components exist but not all)
    const isPartialInit = initStatus.missingComponents.length > 0 &&
      initStatus.missingComponents.length < 5 // Less than all components missing

    return (
      <InitializationPrompt
        projectPath={projectPath}
        missingComponents={initStatus.missingComponents}
        isPartial={isPartialInit}
        onInitialized={() => {
          // Refetch all relevant queries
          refetchWorkflow()
        }}
      />
    )
  }

  // Main workflow view - wrapped in error boundary
  return (
    <SpecKitErrorBoundary
      fallbackTitle="SpecKit Failed to Load"
      onReset={() => refetchWorkflow()}
    >
    <div className="flex flex-col h-full">
      {/* Submodule Warning Dialog (T124) */}
      <SubmoduleWarning
        open={showSubmoduleWarning}
        onOpenChange={setShowSubmoduleWarning}
        message={submoduleStatus?.message}
        onDismiss={() => setSubmoduleWarningDismissed(true)}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">SpecKit</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleOpenWorkflow}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Workflow
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refetchWorkflow()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Workflow Modal */}
      {projectPath && <WorkflowModal projectPath={projectPath} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Constitution Section */}
        {projectPath && (
          <ConstitutionSection
            projectPath={projectPath}
            onCreateConstitution={handleCreateConstitution}
          />
        )}

        {/* Features Table */}
        {projectPath && (
          <FeaturesTable projectPath={projectPath} />
        )}

        {/* Current Feature Info */}
        {workflowState?.branchName && (
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Feature Branch
              </span>
            </div>
            <p className="text-sm font-mono truncate">
              {workflowState.branchName}
            </p>
            {workflowState.featureName && (
              <p className="text-xs text-muted-foreground mt-1">
                {workflowState.featureName}
              </p>
            )}
          </div>
        )}

        {/* Workflow Stepper */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Workflow Progress
          </span>
          <div className="flex flex-col gap-1">
            {WORKFLOW_STEPS_ORDER.map((step) => {
              const isActive = workflowState?.currentStep === step
              const isPassed = isStepPassed(
                step,
                workflowState?.currentStep || "no-feature"
              )

              return (
                <div
                  key={step}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs",
                    isActive && "bg-primary/10 text-primary font-medium",
                    isPassed && !isActive && "text-muted-foreground",
                    !isPassed && !isActive && "text-muted-foreground/50"
                  )}
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isActive && "bg-primary",
                      isPassed && !isActive && "bg-green-500",
                      !isPassed && !isActive && "bg-muted-foreground/30"
                    )}
                  />
                  {WORKFLOW_STEP_LABELS[step]}
                </div>
              )
            })}
          </div>
        </div>

        {/* Artifact Previews */}
        {specArtifact?.exists && specArtifact.content && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Specification
              </span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 max-h-[200px] overflow-y-auto">
              <MarkdownView content={specArtifact.content} size="sm" />
            </div>
          </div>
        )}

        {planArtifact?.exists && planArtifact.content && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Implementation Plan
              </span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 max-h-[200px] overflow-y-auto">
              <MarkdownView content={planArtifact.content} size="sm" />
            </div>
          </div>
        )}

        {/* No Feature State */}
        {workflowState?.currentStep === "no-feature" && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-2">
              No feature branch checked out
            </p>
            <p className="text-xs text-muted-foreground/70 mb-4">
              Checkout a feature branch (e.g., 001-my-feature) to start the
              workflow
            </p>
            <Button
              size="sm"
              onClick={handleOpenWorkflow}
            >
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              Start New Feature
            </Button>
          </div>
        )}

        {/* Continue Workflow Button */}
        {workflowState?.currentStep &&
          workflowState.currentStep !== "no-feature" &&
          workflowState.currentStep !== "implement" && (
          <div className="pt-2">
            <Button
              className="w-full"
              onClick={handleOpenWorkflow}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Continue Workflow
            </Button>
          </div>
        )}
      </div>
    </div>
    </SpecKitErrorBoundary>
  )
})

/**
 * Check if a step is passed (completed) relative to current step
 */
function isStepPassed(
  step: WorkflowStepName,
  currentStep: WorkflowStepName
): boolean {
  const stepIndex = WORKFLOW_STEPS_ORDER.indexOf(step)
  const currentIndex = WORKFLOW_STEPS_ORDER.indexOf(currentStep)

  // If current step is not in the ordered list, nothing is passed
  if (currentIndex === -1) return false

  return stepIndex < currentIndex
}

PlanPage.displayName = "PlanPage"
