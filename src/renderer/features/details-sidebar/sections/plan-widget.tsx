"use client"

import { memo, useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { PlanIcon, ExpandIcon, CollapseIcon, IconSpinner } from "@/components/ui/icons"
import { ChatMarkdownRenderer } from "@/components/chat-markdown-renderer"
import { trpc } from "@/lib/trpc"
import { planContentCacheAtomFamily } from "../atoms"
import type { AgentMode } from "../../agents/atoms"

interface PlanWidgetProps {
  /** Chat ID for cache */
  chatId: string
  /** Active sub-chat ID for plan fetching */
  activeSubChatId?: string | null
  /** Path to the plan file */
  planPath: string | null
  /** Plan refetch trigger */
  refetchTrigger?: number
  /** Current agent mode (plan or agent) */
  mode?: AgentMode
  /** Callback when "Approve" is clicked */
  onApprovePlan?: () => void
  /** Callback when "View plan" is clicked - opens plan sidebar */
  onExpandPlan?: () => void
}

/**
 * Plan Widget for Details Sidebar
 * Shows plan content with expand/collapse functionality
 * Keeps original header buttons (View plan, Approve) and adds expand/collapse icon
 * Memoized to prevent re-renders when parent updates
 */
export const PlanWidget = memo(function PlanWidget({
  chatId,
  activeSubChatId,
  planPath,
  refetchTrigger,
  mode = "agent",
  onApprovePlan,
  onExpandPlan,
}: PlanWidgetProps) {
  // Use activeSubChatId for fetching if available
  const effectiveChatId = activeSubChatId || chatId

  // Expanded/collapsed state
  const [isExpanded, setIsExpanded] = useState(false)

  // Refs for scroll gradients
  const contentRef = useRef<HTMLDivElement>(null)
  const bottomGradientRef = useRef<HTMLDivElement>(null)

  // Plan content cache to avoid flashing loading state
  const [planCache, setPlanCache] = useAtom(planContentCacheAtomFamily(effectiveChatId))

  // Fetch plan file content using tRPC
  const {
    data: planContent,
    isLoading,
    error,
    refetch,
  } = trpc.files.readFile.useQuery({ filePath: planPath! }, { enabled: !!planPath })

  // Update cache when content loads successfully
  useEffect(() => {
    if (planContent && planPath) {
      setPlanCache({
        content: planContent,
        planPath,
        isReady: true,
      })
    }
  }, [planContent, planPath, setPlanCache])

  // Refetch when trigger changes
  useEffect(() => {
    if (refetchTrigger && planPath) {
      refetch()
    }
  }, [refetchTrigger, planPath, refetch])

  // Use cached content while loading new content to prevent flashing
  const displayContent = useMemo(() => {
    if (planContent) return planContent
    if (planCache?.isReady && planCache.planPath === planPath) {
      return planCache.content
    }
    return null
  }, [planContent, planCache, planPath])

  // Only show loading if we have no content to display
  const showLoading = isLoading && !displayContent

  // Only show error if we have no content to display
  const showError = error && !displayContent

  // Toggle expand state
  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded((prev) => !prev)
  }, [])

  // Update scroll gradient via DOM (no state, no re-renders)
  const updateScrollGradient = useCallback(() => {
    const content = contentRef.current
    const bottomGradient = bottomGradientRef.current
    if (!content || !bottomGradient) return

    const { scrollTop, scrollHeight, clientHeight } = content
    const isScrollable = scrollHeight > clientHeight
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

    bottomGradient.style.opacity = isScrollable && !isAtBottom ? "1" : "0"
  }, [])

  // Update gradient on scroll and content changes
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    content.addEventListener("scroll", updateScrollGradient)
    updateScrollGradient()

    return () => content.removeEventListener("scroll", updateScrollGradient)
  }, [updateScrollGradient, isExpanded])

  useEffect(() => {
    updateScrollGradient()
  }, [displayContent, updateScrollGradient])

  // No plan path - don't render anything
  if (!planPath) {
    return null
  }

  return (
    <div className="mx-2 mb-2">
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {/* Header - same as original WidgetCard but with expand button added */}
        <div className="flex items-center gap-2 px-2 h-8 select-none group bg-muted/30">
          <PlanIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground flex-1">Plan</span>

          {/* Original buttons: View plan + Approve */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onExpandPlan?.()
              }}
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              View plan
            </Button>
            {mode === "plan" && onApprovePlan && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onApprovePlan()
                }}
                className="h-5 px-2 mx-0.5 text-[10px] font-medium rounded transition-transform duration-150 active:scale-[0.97]"
              >
                Approve
                <Kbd className="ml-1 text-primary-foreground/70">⌘↵</Kbd>
              </Button>
            )}

            {/* Expand/Collapse button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleExpand}
              className="h-5 w-5 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-md transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0"
              aria-label={isExpanded ? "Collapse plan" : "Expand plan"}
            >
              <div className="relative w-3.5 h-3.5">
                <ExpandIcon
                  className={cn(
                    "absolute inset-0 w-3.5 h-3.5 transition-[opacity,transform] duration-200 ease-out",
                    isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
                  )}
                />
                <CollapseIcon
                  className={cn(
                    "absolute inset-0 w-3.5 h-3.5 transition-[opacity,transform] duration-200 ease-out",
                    isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
                  )}
                />
              </div>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div>
          {showLoading ? (
            <div className="flex items-center justify-center py-8">
              <IconSpinner className="h-5 w-5 text-muted-foreground" />
            </div>
          ) : showError ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">Failed to load plan</p>
            </div>
          ) : !displayContent ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">No plan content</p>
            </div>
          ) : (
            <div className="relative">
              <div
                ref={contentRef}
                className={cn(
                  "px-2 py-2 allow-text-selection",
                  isExpanded ? "" : "max-h-64 overflow-hidden"
                )}
              >
                <ChatMarkdownRenderer content={displayContent} size="sm" />
              </div>

              {/* Bottom scroll gradient */}
              <div
                ref={bottomGradientRef}
                className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none z-10 transition-opacity duration-150"
                style={{
                  opacity: 1,
                  background:
                    "linear-gradient(to top, hsl(var(--background)) 0%, transparent 100%)",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
