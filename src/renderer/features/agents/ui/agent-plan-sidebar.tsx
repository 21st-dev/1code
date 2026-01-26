"use client"

import { useEffect, useMemo } from "react"
import { useAtomValue } from "jotai"
import { Button } from "../../../components/ui/button"
import { IconDoubleChevronRight, IconSpinner, PlanIcon } from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { trpc } from "../../../lib/trpc"
import type { AgentMode } from "../atoms"

interface AgentPlanSidebarProps {
  chatId: string
  planPath: string | null
  onClose: () => void
  onBuildPlan?: () => void
  /** Timestamp that triggers refetch when changed (e.g., after plan Edit completes) */
  refetchTrigger?: number
  /** Current agent mode (plan or agent) */
  mode?: AgentMode
}

export function AgentPlanSidebar({
  chatId,
  planPath,
  onClose,
  onBuildPlan,
  refetchTrigger,
  mode = "agent",
}: AgentPlanSidebarProps) {

  // Fetch plan file content using tRPC
  const { data: planContent, isLoading, error, refetch } = trpc.files.readFile.useQuery(
    { filePath: planPath! },
    { enabled: !!planPath }
  )

  // Refetch when trigger changes
  useEffect(() => {
    if (refetchTrigger && planPath) {
      refetch()
    }
  }, [refetchTrigger, planPath, refetch])

  // Extract plan title from markdown (first H1)
  const planTitle = useMemo(() => {
    if (!planContent) return "Plan"
    const match = planContent.match(/^#\s+(.+)$/m)
    return match ? match[1] : "Plan"
  }, [planContent])

  return (
    <div className="flex flex-col h-full bg-tl-background">
      {/* Header */}
      <div className="flex items-center justify-between px-2 h-10 bg-tl-background flex-shrink-0 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
            aria-label="Close plan"
          >
            <IconDoubleChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium truncate">{planTitle}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Approve Plan button - only show in plan mode */}
          {mode === "plan" && onBuildPlan && (
            <Button
              size="sm"
              className="h-6 px-3 text-xs font-medium rounded-md transition-transform duration-150 active:scale-[0.97]"
              onClick={onBuildPlan}
            >
              Approve
              <Kbd className="ml-1.5 text-primary-foreground/70">⌘↵</Kbd>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <IconSpinner className="h-8 w-8 text-muted-foreground animate-spin mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">Loading plan...</p>
            <p className="text-xs text-muted-foreground/70">Reading plan file</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="mb-4">
              <svg
                className="w-12 h-12 text-destructive/60 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-destructive mb-1">
              Failed to load plan
            </p>
            <p className="text-xs text-muted-foreground/80 max-w-[300px]">
              {error.message || "The plan file could not be read"}
            </p>
          </div>
        ) : !planPath ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="mb-4">
              <PlanIcon className="h-12 w-12 text-muted-foreground/40 mx-auto" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              No plan selected
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-[250px]">
              Click "View plan" on a plan file to preview it here
            </p>
          </div>
        ) : (
          <div
            className="px-4 py-3 allow-text-selection"
            data-plan-path={planPath}
          >
            <ChatMarkdownRenderer
              content={planContent || ""}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}
