"use client"

import { useAtom } from "jotai"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChatMarkdownRenderer } from "@/components/chat-markdown-renderer"
import { Button } from "@/components/ui/button"
import {
  CodeIcon,
  IconSpinner,
  MarkdownIcon,
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import { useI18n } from "@/lib/i18n"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"
import type { AgentMode } from "../../agents/atoms"
import { CopyButton } from "../../agents/ui/message-action-buttons"
import { planContentCacheAtomFamily } from "../atoms"

interface PlanSectionProps {
  chatId: string
  projectPath: string | null
  planPath: string | null
  refetchTrigger?: number
  isExpanded?: boolean
  mode?: AgentMode
  onApprovePlan?: () => void
}

/**
 * Plan Section for Details Sidebar
 * Memoized to prevent re-renders when parent updates
 * Uses caching to show content instantly when switching workspaces
 */
export const PlanSection = memo(function PlanSection({
  chatId,
  projectPath,
  planPath,
  refetchTrigger,
  isExpanded = false,
  mode = "agent",
  onApprovePlan,
}: PlanSectionProps) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<"rendered" | "plaintext">("rendered")
  // Refs for scroll gradients (avoid re-renders)
  const contentRef = useRef<HTMLDivElement>(null)
  const topGradientRef = useRef<HTMLDivElement>(null)
  const bottomGradientRef = useRef<HTMLDivElement>(null)

  // Plan content cache to avoid flashing loading state
  const [planCache, setPlanCache] = useAtom(planContentCacheAtomFamily(chatId))

  // Fetch plan file content using tRPC
  const {
    data: planContent,
    isLoading,
    error,
    refetch,
  } = trpc.files.readFile.useQuery(
    { filePath: planPath ?? "", projectPath: projectPath ?? "" },
    { enabled: !!planPath && !!projectPath },
  )

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

  // Clear cache when plan path changes to a different file
  useEffect(() => {
    if (planPath && planCache && planCache.planPath !== planPath) {
      // Don't clear immediately - let new content load first
      // This prevents flashing empty state
    }
  }, [planPath, planCache])

  // Refetch when trigger changes
  useEffect(() => {
    if (refetchTrigger && planPath) {
      refetch()
    }
  }, [refetchTrigger, planPath, refetch])

  // Update scroll gradients via DOM (no state, no re-renders)
  const updateScrollGradients = useCallback(() => {
    const content = contentRef.current
    const topGradient = topGradientRef.current
    const bottomGradient = bottomGradientRef.current
    if (!content || !topGradient || !bottomGradient) return

    const { scrollTop, scrollHeight, clientHeight } = content
    const isScrollable = scrollHeight > clientHeight
    const isAtTop = scrollTop <= 1
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

    // Show top gradient when scrolled down
    topGradient.style.opacity = isScrollable && !isAtTop ? "1" : "0"
    // Show bottom gradient when not at bottom
    bottomGradient.style.opacity = isScrollable && !isAtBottom ? "1" : "0"
  }, [])

  // Update gradients on scroll
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    content.addEventListener("scroll", updateScrollGradients)
    // Initial check
    updateScrollGradients()

    return () => content.removeEventListener("scroll", updateScrollGradients)
  }, [updateScrollGradients])

  // Also update gradients when content changes
  useEffect(() => {
    updateScrollGradients()
  }, [planContent, updateScrollGradients])

  // Use cached content while loading new content to prevent flashing
  // Show cached content if: loading new content OR error occurred but we have cache
  const displayContent = useMemo(() => {
    // If we have fresh content, use it
    if (planContent) return planContent
    // If loading or error, use cached content (same plan path)
    if (planCache?.isReady && planCache.planPath === planPath) {
      return planCache.content
    }
    return null
  }, [planContent, planCache, planPath])

  // Only show loading if we have no content to display at all
  const showLoading = isLoading && !displayContent

  // Only show error if we have no content to display at all
  const showError = error && !displayContent

  // Extract plan title from markdown (first H1)
  const planTitle = useMemo(() => {
    if (!displayContent) return t("details.plan")
    const match = displayContent.match(/^#\s+(.+)$/m)
    return match ? match[1] : t("details.plan")
  }, [displayContent, t])

  const handleToggleViewMode = useCallback(() => {
    setViewMode((current) =>
      current === "rendered" ? "plaintext" : "rendered",
    )
  }, [])

  // No plan path - don't render anything (parent should hide the widget)
  if (!planPath) {
    return null
  }

  // Show loading only if we have no cached content
  if (showLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconSpinner className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }

  // Show error only if we have no cached content
  if (showError) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-muted-foreground">Failed to load plan</p>
      </div>
    )
  }

  // No content at all (shouldn't happen if planPath is set)
  if (!displayContent) {
    return null
  }

  return (
    <div className="flex flex-col">
      {isExpanded && (
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
          <div className="min-w-0 text-sm font-medium truncate">
            {planTitle}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleViewMode}
              className="h-6 w-6 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
              aria-label={
                viewMode === "rendered"
                  ? t("agent.plan.showRawMarkdown")
                  : t("agent.plan.showRendered")
              }
            >
              <div className="relative h-4 w-4">
                <MarkdownIcon
                  className={cn(
                    "absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-200 ease-out",
                    viewMode === "rendered"
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-75",
                  )}
                />
                <CodeIcon
                  className={cn(
                    "absolute inset-0 h-4 w-4 transition-[opacity,transform] duration-200 ease-out",
                    viewMode === "plaintext"
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-75",
                  )}
                />
              </div>
            </Button>
            <CopyButton text={displayContent} />
            {mode === "plan" && onApprovePlan && (
              <Button
                size="sm"
                className="h-6 px-3 text-xs font-medium rounded-md transition-transform duration-150 active:scale-[0.97]"
                onClick={onApprovePlan}
              >
                {t("agent.plan.approve")}
                <Kbd className="ml-1.5 text-primary-foreground/70">⌘↵</Kbd>
              </Button>
            )}
          </div>
        </div>
      )}
      {/* Plan content with scroll gradients */}
      <div className="relative">
        {/* Top scroll gradient - matches header bg (muted/30) */}
        <div
          ref={topGradientRef}
          className="absolute top-0 left-0 right-0 h-6 pointer-events-none z-10 transition-opacity duration-150"
          style={{
            opacity: 0,
            background:
              "linear-gradient(to bottom, color-mix(in srgb, hsl(var(--muted)) 30%, hsl(var(--background))) 0%, transparent 100%)",
          }}
        />

        <div
          ref={contentRef}
          className={`px-2 py-2 overflow-y-auto allow-text-selection ${isExpanded ? "" : "max-h-64"}`}
          data-plan-path={planPath}
        >
          {viewMode === "rendered" ? (
            <ChatMarkdownRenderer content={displayContent} size="sm" />
          ) : (
            <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">
              {displayContent}
            </pre>
          )}
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
    </div>
  )
})
