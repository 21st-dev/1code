"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAtomValue } from "jotai"
import { Button } from "../../../components/ui/button"
import { IconDoubleChevronRight, IconSpinner, PlanIcon, MarkdownIcon, CodeIcon } from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { CopyButton } from "./message-action-buttons"
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
  // View mode: rendered markdown or plaintext
  const [viewMode, setViewMode] = useState<"rendered" | "plaintext">("rendered")

  // Toggle view mode
  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "rendered" ? "plaintext" : "rendered"))
  }, [])

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
          {/* View mode toggle */}
          {planContent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleViewMode}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
                  aria-label={viewMode === "rendered" ? "Show raw markdown" : "Show rendered"}
                >
                  <div className="relative w-4 h-4">
                    <MarkdownIcon
                      className={cn(
                        "absolute inset-0 w-4 h-4 transition-[opacity,transform] duration-200 ease-out",
                        viewMode === "rendered" ? "opacity-100 scale-100" : "opacity-0 scale-75",
                      )}
                    />
                    <CodeIcon
                      className={cn(
                        "absolute inset-0 w-4 h-4 transition-[opacity,transform] duration-200 ease-out",
                        viewMode === "plaintext" ? "opacity-100 scale-100" : "opacity-0 scale-75",
                      )}
                    />
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" showArrow={false}>
                {viewMode === "rendered" ? "View raw markdown" : "View rendered"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Copy button */}
          {planContent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <CopyButton text={planContent} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" showArrow={false}>
                Copy plan
              </TooltipContent>
            </Tooltip>
          )}

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
            <IconSpinner className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Loading plan...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="text-muted-foreground mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-50"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Failed to load plan
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-[300px]">
              {error.message || "The plan file could not be read"}
            </p>
          </div>
        ) : !planPath ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="text-muted-foreground mb-4">
              <PlanIcon className="h-12 w-12 opacity-50" />
            </div>
            <p className="text-sm text-muted-foreground mb-2">
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
            {viewMode === "rendered" ? (
              <ChatMarkdownRenderer
                content={planContent || ""}
                size="sm"
              />
            ) : (
              <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">
                {planContent || ""}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
