/**
 * WorkflowModal Component
 *
 * Full-screen modal for the SpecKit workflow.
 * Dual-pane interface with chat pane (left) and document pane (right).
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useState, useCallback, useEffect, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"

import {
  speckitModalOpenAtom,
  speckitCurrentDocumentAtom,
  speckitExecutionIdAtom,
  speckitActiveStepAtom,
  speckitWorkflowStartStepAtom,
} from "../atoms"
import { useWorkflowState, useExecuteCommand, useCommandOutput } from "../hooks"
import { WORKFLOW_STEPS_ORDER, type WorkflowStepName, type ArtifactType } from "../types"

import { WorkflowStepper } from "./workflow-stepper"
import { ChatPane } from "./chat-pane"
import { DocumentPane } from "./document-pane"
import { StaleWarningBanner, checkStaleArtifacts } from "./stale-warning-banner"
import { SkipClarifyWarningBanner } from "./skip-clarify-warning"

import {
  ConstitutionStep,
  SpecifyStep,
  ClarifyStep,
  PlanStep,
  TasksStep,
  ImplementStep,
} from "./workflow-steps"

interface WorkflowModalProps {
  /** Project path */
  projectPath: string
}

/**
 * Map workflow steps to artifact types for document pane
 */
const STEP_TO_ARTIFACT: Record<WorkflowStepName, ArtifactType> = {
  "no-feature": "spec",
  constitution: "constitution",
  specify: "spec",
  clarify: "spec",
  plan: "plan",
  tasks: "tasks",
  analyze: "tasks",
  implement: "tasks",
}

/**
 * WorkflowModal - Main workflow interface
 */
export const WorkflowModal = memo(function WorkflowModal({
  projectPath,
}: WorkflowModalProps) {
  const [isOpen, setIsOpen] = useAtom(speckitModalOpenAtom)
  const [activeStep, setActiveStep] = useAtom(speckitActiveStepAtom)
  const [startStep, setStartStep] = useAtom(speckitWorkflowStartStepAtom)
  const executionId = useAtomValue(speckitExecutionIdAtom)
  const setCurrentDocument = useSetAtom(speckitCurrentDocumentAtom)

  // Local state
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactType>("spec")
  const [staleWarningDismissed, setStaleWarningDismissed] = useState(false)
  const [showSkipWarning, setShowSkipWarning] = useState(false)
  const [showOutput, setShowOutput] = useState(false)

  // Fetch workflow state
  const {
    workflowState,
    isLoading: workflowLoading,
    refetch: refetchWorkflow,
    currentStep,
    branchName,
    artifactsPresent,
    needsClarification,
    clarificationQuestions,
  } = useWorkflowState({ projectPath, enabled: isOpen })

  // Command execution
  const {
    execute,
    cancel,
    reset: resetExecution,
    isExecuting,
    lastError,
    executionId: currentExecutionId,
  } = useExecuteCommand({
    projectPath,
    onStart: () => setShowOutput(true),
    onSuccess: () => {
      // Refetch workflow state after command completes
      setTimeout(() => refetchWorkflow(), 500)
    },
  })

  // Command output streaming
  const {
    outputLines,
    isComplete: outputComplete,
    hasError: outputHasError,
    clearOutput,
  } = useCommandOutput({
    executionId: currentExecutionId,
    onComplete: () => {
      refetchWorkflow()
    },
  })

  // Query artifacts
  const { data: constitution } = trpc.speckit.getConstitution.useQuery(
    { projectPath },
    { enabled: isOpen }
  )

  const { data: specArtifact } = trpc.speckit.getArtifact.useQuery(
    { projectPath, featureBranch: branchName || "", artifactType: "spec" },
    { enabled: isOpen && !!branchName }
  )

  const { data: planArtifact } = trpc.speckit.getArtifact.useQuery(
    { projectPath, featureBranch: branchName || "", artifactType: "plan" },
    { enabled: isOpen && !!branchName }
  )

  const { data: tasksArtifact } = trpc.speckit.getArtifact.useQuery(
    { projectPath, featureBranch: branchName || "", artifactType: "tasks" },
    { enabled: isOpen && !!branchName }
  )

  // Open file in editor mutation
  const openInEditorMutation = trpc.speckit.openFileInEditor.useMutation()

  // Determine effective step (active override or detected)
  const effectiveStep = (activeStep as WorkflowStepName) || currentStep || "specify"

  // Check for stale artifacts when navigating
  const staleArtifacts = useMemo(() => {
    if (!artifactsPresent || staleWarningDismissed) return []
    return checkStaleArtifacts(effectiveStep, {
      spec: artifactsPresent.spec,
      plan: artifactsPresent.plan,
      tasks: artifactsPresent.tasks,
    })
  }, [effectiveStep, artifactsPresent, staleWarningDismissed])

  // Update selected artifact when step changes
  useEffect(() => {
    const newArtifact = STEP_TO_ARTIFACT[effectiveStep]
    if (newArtifact) {
      setSelectedArtifact(newArtifact)
    }
  }, [effectiveStep])

  // Handle start step when modal opens
  useEffect(() => {
    if (isOpen && startStep) {
      setActiveStep(startStep)
      setStartStep(null)
    }
  }, [isOpen, startStep, setActiveStep, setStartStep])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveStep(null)
      setStartStep(null)
      setStaleWarningDismissed(false)
      setShowSkipWarning(false)
      setShowOutput(false)
      clearOutput()
      resetExecution()
    }
  }, [isOpen, setActiveStep, setStartStep, clearOutput, resetExecution])

  // Handle step navigation
  const handleStepClick = useCallback(
    (step: WorkflowStepName) => {
      // Check if trying to skip clarify
      if (
        effectiveStep === "clarify" &&
        step === "plan" &&
        needsClarification &&
        (clarificationQuestions?.length || 0) > 0
      ) {
        setShowSkipWarning(true)
        return
      }

      setActiveStep(step)
      setStaleWarningDismissed(false)
      setShowOutput(false)
    },
    [effectiveStep, needsClarification, clarificationQuestions, setActiveStep]
  )

  // Handle step actions
  const handleSpecifySubmit = useCallback(
    (description: string) => {
      execute("/speckit.specify", description)
    },
    [execute]
  )

  const handleClarifySubmit = useCallback(
    (answers: Record<string, string>) => {
      const answersStr = Object.entries(answers)
        .map(([q, a]) => `${q}: ${a}`)
        .join("\n")
      execute("/speckit.clarify", answersStr)
    },
    [execute]
  )

  const handleClarifySkip = useCallback(() => {
    setShowSkipWarning(true)
  }, [])

  const handleConfirmSkip = useCallback(() => {
    setShowSkipWarning(false)
    setActiveStep("plan")
  }, [setActiveStep])

  const handleGeneratePlan = useCallback(() => {
    execute("/speckit.plan", "")
  }, [execute])

  const handleGenerateTasks = useCallback(() => {
    execute("/speckit.tasks", "")
  }, [execute])

  const handleCreateConstitution = useCallback(() => {
    execute("/speckit.constitution", "")
  }, [execute])

  const handleProceedToStep = useCallback(
    (step: WorkflowStepName) => {
      setActiveStep(step)
      setShowOutput(false)
    },
    [setActiveStep]
  )

  const handleOpenInEditor = useCallback(
    (filePath: string) => {
      openInEditorMutation.mutate({ filePath })
    },
    [openInEditorMutation]
  )

  // Render step content
  const renderStepContent = () => {
    switch (effectiveStep) {
      case "constitution":
        return (
          <ConstitutionStep
            constitutionContent={constitution?.content}
            constitutionExists={constitution?.exists ?? false}
            onCreate={handleCreateConstitution}
            onProceed={() => handleProceedToStep("specify")}
            onOpenInEditor={() =>
              handleOpenInEditor(`${projectPath}/.specify/memory/constitution.md`)
            }
            isExecuting={isExecuting}
            isCompleted={constitution?.exists ?? false}
          />
        )

      case "specify":
        return (
          <SpecifyStep
            onSubmit={handleSpecifySubmit}
            isExecuting={isExecuting}
            isCompleted={artifactsPresent?.spec ?? false}
          />
        )

      case "clarify":
        return (
          <ClarifyStep
            questions={clarificationQuestions || []}
            onSubmit={handleClarifySubmit}
            onSkip={handleClarifySkip}
            isExecuting={isExecuting}
            isCompleted={!needsClarification}
          />
        )

      case "plan":
        return (
          <PlanStep
            planContent={planArtifact?.content}
            planExists={artifactsPresent?.plan ?? false}
            onGenerate={handleGeneratePlan}
            onRegenerate={handleGeneratePlan}
            onApprove={() => handleProceedToStep("tasks")}
            isExecuting={isExecuting}
            isCompleted={artifactsPresent?.plan ?? false}
          />
        )

      case "tasks":
        return (
          <TasksStep
            tasksContent={tasksArtifact?.content}
            tasksExist={artifactsPresent?.tasks ?? false}
            onGenerate={handleGenerateTasks}
            onRegenerate={handleGenerateTasks}
            onProceed={() => handleProceedToStep("implement")}
            isExecuting={isExecuting}
            isCompleted={artifactsPresent?.tasks ?? false}
          />
        )

      case "implement":
        return (
          <ImplementStep
            tasksContent={tasksArtifact?.content || ""}
            featureBranch={branchName || ""}
          />
        )

      default:
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Select a workflow step to continue</p>
          </div>
        )
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">SpecKit Workflow</h2>
            {branchName && (
              <span className="text-sm text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                {branchName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Stepper */}
            <WorkflowStepper
              currentStep={currentStep || "specify"}
              activeStep={effectiveStep}
              onStepClick={handleStepClick}
              enableNavigation={!isExecuting}
              compact
            />

            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        {/* Warning Banners */}
        {staleArtifacts.length > 0 && (
          <StaleWarningBanner
            step={effectiveStep}
            downstreamArtifacts={staleArtifacts}
            onDismiss={() => setStaleWarningDismissed(true)}
          />
        )}

        {showSkipWarning && (
          <SkipClarifyWarningBanner
            questionCount={clarificationQuestions?.length || 0}
            onConfirmSkip={handleConfirmSkip}
            onCancel={() => setShowSkipWarning(false)}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane - Step Content or Command Output */}
          <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
            {showOutput && outputLines.length > 0 ? (
              <ChatPane
                outputLines={outputLines}
                isStreaming={isExecuting}
                isComplete={outputComplete}
                hasError={outputHasError}
                lastError={lastError}
                onCancel={cancel}
                onRetry={() => {
                  clearOutput()
                  // Re-run based on current step
                  switch (effectiveStep) {
                    case "specify":
                      // Can't retry specify without description
                      break
                    case "plan":
                      handleGeneratePlan()
                      break
                    case "tasks":
                      handleGenerateTasks()
                      break
                    case "constitution":
                      handleCreateConstitution()
                      break
                  }
                }}
                title={`Running ${effectiveStep}...`}
                headerContent={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOutput(false)}
                    className="text-xs"
                  >
                    Back to Step
                  </Button>
                }
              />
            ) : (
              renderStepContent()
            )}
          </div>

          {/* Right Pane - Document Preview */}
          <div className="w-[45%] flex-shrink-0 overflow-hidden">
            <DocumentPane
              projectPath={projectPath}
              featureBranch={branchName || ""}
              selectedArtifact={selectedArtifact}
              onArtifactChange={setSelectedArtifact}
              showConstitution={true}
              onOpenInEditor={handleOpenInEditor}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
})

WorkflowModal.displayName = "WorkflowModal"
