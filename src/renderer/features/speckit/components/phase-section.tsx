/**
 * PhaseSection Component
 *
 * Collapsible section for displaying a phase and its tasks.
 * Includes phase-level copy button for implementing all tasks in a phase.
 *
 * @see specs/001-speckit-ui-integration/tasks.md T169-T175, T181
 */

import { memo, useState, useCallback, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface PhaseSectionProps {
  /** Phase number (e.g., "0", "1", "2") */
  phaseNumber: string
  /** Phase title (e.g., "Submodule Relocation (Infrastructure)") */
  phaseTitle: string
  /** Branch name for copy command */
  branchName: string
  /** Number of tasks in this phase */
  totalTasks: number
  /** Number of completed tasks in this phase */
  completedTasks: number
  /** Children (task list) */
  children: ReactNode
  /** Default open state */
  defaultOpen?: boolean
}

/**
 * PhaseSection - Collapsible phase container with copy functionality
 *
 * Displays:
 * - Phase number and title
 * - Task completion stats
 * - Copy button to implement all tasks in phase
 * - Collapsible task list
 */
export const PhaseSection = memo(function PhaseSection({
  phaseNumber,
  phaseTitle,
  branchName,
  totalTasks,
  completedTasks,
  children,
  defaultOpen = true,
}: PhaseSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isCopied, setIsCopied] = useState(false)

  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const handleCopyPhase = useCallback(async () => {
    const command = `/speckit.implement ${branchName} Phase ${phaseNumber}`

    try {
      await navigator.clipboard.writeText(command)
      setIsCopied(true)
      toast.success("Phase command copied", {
        description: `Use "${command}" in a new chat to implement all tasks in this phase`,
      })

      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      toast.error("Failed to copy command")
    }
  }, [branchName, phaseNumber])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg overflow-hidden">
        {/* Phase Header */}
        <div className="bg-muted/30 border-b">
          <div className="flex items-center justify-between p-3 gap-2">
            {/* Left side: Toggle button + Phase info */}
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                {/* Chevron icon */}
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}

                {/* Phase number badge */}
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-semibold flex-shrink-0">
                  {phaseNumber}
                </div>

                {/* Phase title and stats */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {phaseTitle}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {completedTasks}/{totalTasks} complete
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {progressPercent}%
                    </span>
                  </div>
                </div>
              </button>
            </CollapsibleTrigger>

            {/* Right side: Copy button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={handleCopyPhase}
                  disabled={isCopied}
                >
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-xs">
                  Copy command to implement all tasks in this phase
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className={cn(
                "h-full transition-all duration-300",
                progressPercent === 100 ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Collapsible content */}
        <CollapsibleContent>
          <div className="p-3">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
})

PhaseSection.displayName = "PhaseSection"
