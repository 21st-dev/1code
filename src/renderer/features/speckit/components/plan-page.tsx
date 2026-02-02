/**
 * PlanPage Component
 *
 * Main Spec workflow page displayed in the right drawer.
 * Shows workflow status, feature info, and artifact previews.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useCallback, useState, useEffect } from "react"
import { useSetAtom } from "jotai"
import { FileText, RefreshCw, Sparkles, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { WorkflowModal } from "./workflow-modal"
import { InitializationPrompt } from "./initialization-prompt"
import { SubmoduleWarning } from "./submodule-warning"
import { SpecErrorBoundary } from "./speckit-error-boundary"
import { OverviewSection } from "./overview-section"
import { CurrentBranchSection } from "./current-branch-section"
import {
  speckitModalOpenAtom,
  speckitWorkflowStartStepAtom,
  speckitCurrentBranchNameAtom,
  speckitWorkflowStartModeAtom,
} from "../atoms"
import { WorkflowStartMode } from "../types/workflow"
import { useBranchDetection } from "../hooks/useBranchDetection"

interface PlanPageProps {
  /** Chat/workspace ID */
  chatId?: string
  /** Project path (required) */
  projectPath?: string
  /** Callback when close button is clicked */
  onClose?: () => void
}

/**
 * PlanPage - Spec workflow management page
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
  const setBranchName = useSetAtom(speckitCurrentBranchNameAtom)
  const setWorkflowStartMode = useSetAtom(speckitWorkflowStartModeAtom)

  // Branch detection for conditional button visibility
  const { isNamedFeature } = useBranchDetection()

  // Open workflow modal
  const handleOpenWorkflow = useCallback(() => {
    setModalOpen(true)
  }, [setModalOpen])

  // Handle new feature - opens workflow modal in empty state
  const handleNewFeature = useCallback(() => {
    setWorkflowStartMode(WorkflowStartMode.NewFeature)
    setWorkflowStartStep(null)
    setModalOpen(true)
  }, [setWorkflowStartMode, setWorkflowStartStep, setModalOpen])

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
  const [prevProjectPath, setPrevProjectPath] = useState(projectPath)
  const [prevSubmoduleStatus, setPrevSubmoduleStatus] = useState<boolean | null>(null)

  // Reset warning dismissal when project or submodule status changes
  useEffect(() => {
    if (
      projectPath !== prevProjectPath ||
      (submoduleStatus && submoduleStatus.initialized !== prevSubmoduleStatus)
    ) {
      setSubmoduleWarningDismissed(false)
      setPrevProjectPath(projectPath)
      setPrevSubmoduleStatus(submoduleStatus?.initialized ?? null)
    }
  }, [projectPath, prevProjectPath, submoduleStatus, prevSubmoduleStatus])

  // Show submodule warning if not initialized and not dismissed
  useEffect(() => {
    if (submoduleStatus && !submoduleStatus.initialized && !submoduleWarningDismissed) {
      setShowSubmoduleWarning(true)
    }
  }, [submoduleStatus, submoduleWarningDismissed])

  // Detect if on feature branch
  const isOnFeatureBranch = workflowState?.branchName &&
    workflowState.currentStep !== "no-feature"

  // Update branch name atom when workflow state changes
  useEffect(() => {
    if (workflowState?.branchName) {
      setBranchName(workflowState.branchName)
    }
  }, [workflowState?.branchName, setBranchName])


  // No project selected
  if (!projectPath) {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-center flex-1 text-center">
          <div className="max-w-[200px]">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Select a project to view Spec workflow
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
    <SpecErrorBoundary
      fallbackTitle="Spec Failed to Load"
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
          <span className="text-sm font-medium">Spec</span>
        </div>
        <div className="flex items-center gap-1">
          {/* New Feature button - only visible on named feature branches */}
          {isNamedFeature && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleNewFeature}
            >
              <Plus className="h-3 w-3 mr-1" />
              New Feature
            </Button>
          )}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Overview Section - Always visible */}
        {projectPath && (
          <OverviewSection
            projectPath={projectPath}
            onOpenWorkflow={handleOpenWorkflow}
          />
        )}

        {/* Divider between sections */}
        {projectPath && isOnFeatureBranch && workflowState && (
          <div className="border-t border-border" />
        )}

        {/* Current Branch Section - Only when on feature branch */}
        {projectPath && isOnFeatureBranch && workflowState && (
          <CurrentBranchSection
            projectPath={projectPath}
            branchName={workflowState.branchName!}
            featureNumber={workflowState.featureNumber || ""}
            featureName={workflowState.featureName || ""}
            currentStep={workflowState.currentStep}
          />
        )}
      </div>
    </div>
    </SpecErrorBoundary>
  )
})

PlanPage.displayName = "PlanPage"
