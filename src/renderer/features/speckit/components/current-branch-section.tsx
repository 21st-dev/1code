/**
 * CurrentBranchSection Component
 *
 * Displays the current feature branch section with workflow progress
 * and tabbed interface for viewing artifacts (Spec, Plan, Tasks, Implement).
 *
 * @see specs/001-speckit-ui-integration/tasks.md T159-T166
 */

import { memo, useState, useMemo } from "react"
import { FileText, GitBranch, ExternalLink, Square, CheckSquare, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { MarkdownView } from "./markdown-view"
import { WorkflowProgressIndicator } from "./workflow-progress-indicator"
import { PhaseSection } from "./phase-section"
import type { WorkflowStepName } from "../types"

interface CurrentBranchSectionProps {
  /** Project path (required) */
  projectPath: string
  /** Current branch name */
  branchName: string
  /** Feature number (e.g., "001") */
  featureNumber: string
  /** Feature name (e.g., "speckit-ui-integration") */
  featureName: string
  /** Current workflow step */
  currentStep: WorkflowStepName
}

type ArtifactTab = "specification" | "plan" | "tasks" | "implement"

interface ParsedTask {
  id: string
  description: string
  isComplete: boolean
  isParallel: boolean
  phase?: string
  phaseNumber?: string
  filePaths: string[]
}

interface PhaseInfo {
  number: string
  title: string
}

/**
 * Parse tasks.md content to extract tasks and phases
 */
function parseTasksForImplement(content: string): { tasks: ParsedTask[]; phaseInfoMap: Map<string, PhaseInfo> } {
  const tasks: ParsedTask[] = []
  const phaseInfoMap = new Map<string, PhaseInfo>()
  let currentPhase: string | undefined
  let currentPhaseNumber: string | undefined

  const lines = content.split("\n")

  for (const line of lines) {
    const phaseMatch = line.match(/^##\s+Phase\s+(\d+)[:\s]+(.+)$/i)
    if (phaseMatch) {
      const phaseNumber = phaseMatch[1]
      const phaseTitle = phaseMatch[2].trim()
      currentPhase = phaseTitle
      currentPhaseNumber = phaseNumber

      if (!phaseInfoMap.has(phaseTitle)) {
        phaseInfoMap.set(phaseTitle, { number: phaseNumber, title: phaseTitle })
      }
      continue
    }

    const taskMatch = line.match(/^-\s+\[([ xX])\]\s+(T\d+(?:\.\d+)?)\s*(\[P\])?\s*(\[V2\])?\s*(\[US\d+\])?\s+(.+)$/)
    if (taskMatch) {
      const [, checkmark, id, parallel, , , description] = taskMatch
      const filePathMatches = description.match(/(?:src|submodules|specs)\/[^\s,]+/g)

      tasks.push({
        id,
        description: description.trim(),
        isComplete: checkmark.toLowerCase() === "x",
        isParallel: !!parallel,
        phase: currentPhase,
        phaseNumber: currentPhaseNumber,
        filePaths: filePathMatches || [],
      })
    }
  }

  return { tasks, phaseInfoMap }
}

/**
 * CurrentBranchSection - Displays current feature branch info
 *
 * Shows:
 * - Branch name and feature info
 * - Workflow progress indicator
 * - Tabbed interface for viewing artifacts
 */
export const CurrentBranchSection = memo(function CurrentBranchSection({
  projectPath,
  branchName,
  featureNumber,
  featureName,
  currentStep,
}: CurrentBranchSectionProps) {
  const [activeTab, setActiveTab] = useState<ArtifactTab>("specification")
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)

  // Determine completed steps based on current step
  const completedSteps = useMemo(() => {
    const steps = new Set<WorkflowStepName>()
    const stepOrder: WorkflowStepName[] = ["specify", "clarify", "plan", "tasks", "implement"]
    const currentIndex = stepOrder.indexOf(currentStep)

    for (let i = 0; i < currentIndex; i++) {
      steps.add(stepOrder[i])
    }

    return steps
  }, [currentStep])

  // Fetch artifacts
  const { data: specData, isLoading: isLoadingSpec } = trpc.speckit.getArtifact.useQuery(
    { projectPath, featureBranch: branchName, artifactType: "spec" },
    { enabled: activeTab === "specification" }
  )

  const { data: planData, isLoading: isLoadingPlan } = trpc.speckit.getArtifact.useQuery(
    { projectPath, featureBranch: branchName, artifactType: "plan" },
    { enabled: activeTab === "plan" }
  )

  const { data: tasksData, isLoading: isLoadingTasks } = trpc.speckit.getArtifact.useQuery(
    { projectPath, featureBranch: branchName, artifactType: "tasks" },
    { enabled: activeTab === "tasks" || activeTab === "implement" }
  )

  // Parse tasks for Implement tab
  const { tasks: parsedTasks, phaseInfoMap } = useMemo(() => {
    if (!tasksData?.content) return { tasks: [], phaseInfoMap: new Map() }
    return parseTasksForImplement(tasksData.content)
  }, [tasksData?.content])

  // Group tasks by phase
  const tasksByPhase = useMemo(() => {
    const grouped: Record<string, ParsedTask[]> = {}
    for (const task of parsedTasks) {
      const phase = task.phase || "Other"
      if (!grouped[phase]) grouped[phase] = []
      grouped[phase].push(task)
    }
    return grouped
  }, [parsedTasks])

  // Open file in editor
  const openInEditorMutation = trpc.speckit.openFileInEditor.useMutation()

  const handleOpenInEditor = (artifactType: "spec" | "plan" | "tasks") => {
    const fileName = `${artifactType}.md`
    const filePath = `${projectPath}/specs/${branchName}/${fileName}`
    openInEditorMutation.mutate({ filePath })
  }

  // Copy task command
  const handleCopyTask = async (taskId: string) => {
    const command = `/speckit.implement ${branchName} ${taskId}`
    try {
      await navigator.clipboard.writeText(command)
      setCopiedTaskId(taskId)
      toast.success("Task command copied", {
        description: `Use "${command}" in a new chat to implement this task`,
      })
      setTimeout(() => setCopiedTaskId(null), 2000)
    } catch {
      toast.error("Failed to copy command")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Branch Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <GitBranch className="w-4 h-4" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">
              {featureNumber}-{featureName}
            </h3>
            <p className="text-xs text-muted-foreground">
              Current branch
            </p>
          </div>
        </div>
      </div>

      {/* Workflow Progress */}
      <WorkflowProgressIndicator
        currentStep={currentStep}
        completedSteps={completedSteps}
      />

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ArtifactTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="specification">Specification</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="implement" disabled={!tasksData?.content}>
            Implement
          </TabsTrigger>
        </TabsList>

        {/* Specification Tab */}
        <TabsContent value="specification" className="mt-4">
          {isLoadingSpec ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading specification...</p>
            </div>
          ) : specData?.content ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenInEditor("spec")}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Editor
                </Button>
              </div>
              <div className="rounded-lg border bg-card p-4 overflow-auto max-h-[600px]">
                <MarkdownView content={specData.content} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <FileText className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No specification found</p>
            </div>
          )}
        </TabsContent>

        {/* Plan Tab */}
        <TabsContent value="plan" className="mt-4">
          {isLoadingPlan ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading plan...</p>
            </div>
          ) : planData?.content ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenInEditor("plan")}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Editor
                </Button>
              </div>
              <div className="rounded-lg border bg-card p-4 overflow-auto max-h-[600px]">
                <MarkdownView content={planData.content} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <FileText className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No plan found</p>
            </div>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          {isLoadingTasks ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading tasks...</p>
            </div>
          ) : tasksData?.content ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenInEditor("tasks")}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Editor
                </Button>
              </div>
              <div className="rounded-lg border bg-card p-4 overflow-auto max-h-[600px]">
                <MarkdownView content={tasksData.content} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <FileText className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No tasks found</p>
            </div>
          )}
        </TabsContent>

        {/* Implement Tab */}
        <TabsContent value="implement" className="mt-4">
          {tasksData?.content && parsedTasks.length > 0 ? (
            <div className="space-y-4">
              {/* Collapsible phases with tasks */}
              {Object.entries(tasksByPhase).map(([phase, phaseTasks]) => {
                const phaseInfo = phaseInfoMap.get(phase)
                const completedTasks = phaseTasks.filter((t) => t.isComplete).length

                return (
                  <PhaseSection
                    key={phase}
                    phaseNumber={phaseInfo?.number || "?"}
                    phaseTitle={phase}
                    branchName={branchName}
                    totalTasks={phaseTasks.length}
                    completedTasks={completedTasks}
                    defaultOpen={false}
                  >
                    <div className="space-y-2">
                      {phaseTasks.map((task) => (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                            task.isComplete
                              ? "bg-muted/30 border-muted"
                              : "bg-background border-border hover:border-primary/30"
                          )}
                        >
                          {/* Checkbox indicator */}
                          <div className="mt-0.5 flex-shrink-0">
                            {task.isComplete ? (
                              <CheckSquare className="h-4 w-4 text-green-500" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>

                          {/* Task content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  "font-mono text-xs px-1.5 py-0.5 rounded",
                                  task.isComplete
                                    ? "bg-green-500/20 text-green-700 dark:text-green-400"
                                    : "bg-primary/10 text-primary"
                                )}
                              >
                                {task.id}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "text-sm mt-1",
                                task.isComplete && "text-muted-foreground line-through"
                              )}
                            >
                              {task.description}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleCopyTask(task.id)}
                                  disabled={copiedTaskId === task.id}
                                >
                                  {copiedTaskId === task.id ? (
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p className="text-xs">Copy command to implement this task</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PhaseSection>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <FileText className="w-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {tasksData?.content ? "No tasks found" : "Complete the tasks step first"}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
})
