"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { Button } from "../../../components/ui/button"
import { CheckIcon, CollapseIcon, CopyIcon, ExpandIcon, PlanIcon } from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import {
  currentPlanPathAtomFamily,
  pendingBuildPlanSubChatIdAtom,
  planSidebarOpenAtomFamily,
  subChatModeAtomFamily,
} from "../atoms"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import { getToolStatus } from "./agent-tool-registry"
import { areToolPropsEqual } from "./agent-tool-utils"

interface AgentPlanFileToolProps {
  part: {
    type: string // "tool-Write" | "tool-Edit"
    state?: string
    input?: {
      file_path?: string
      content?: string
      new_string?: string
    }
  }
  chatStatus?: string
  subChatId: string
  isEdit?: boolean // Whether this represents an edit operation (for messaging)
}

/**
 * AgentPlanFileTool - Unified component for plan files.
 * Shows plan content during streaming and after completion.
 * Features: expand/collapse, View plan (sidebar), Build button.
 */
export const AgentPlanFileTool = memo(function AgentPlanFileTool({
  part,
  chatStatus,
  subChatId,
  isEdit = false,
}: AgentPlanFileToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const { isPending } = getToolStatus(part, chatStatus)
  const isWrite = part.type === "tool-Write"
  // Get mode from per-subChat atomFamily
  const subChatModeAtom = useMemo(() => subChatModeAtomFamily(subChatId), [subChatId])
  const subChatMode = useAtomValue(subChatModeAtom)
  const setPendingBuildPlanSubChatId = useSetAtom(pendingBuildPlanSubChatIdAtom)

  // Refs for scroll gradients (avoid re-renders)
  const contentRef = useRef<HTMLDivElement>(null)
  const topGradientRef = useRef<HTMLDivElement>(null)
  const bottomGradientRef = useRef<HTMLDivElement>(null)

  // Plan sidebar atoms - per subChat
  const planSidebarOpenAtom = useMemo(
    () => planSidebarOpenAtomFamily(subChatId),
    [subChatId],
  )
  const currentPlanPathAtom = useMemo(
    () => currentPlanPathAtomFamily(subChatId),
    [subChatId],
  )
  const [, setIsPlanSidebarOpen] = useAtom(planSidebarOpenAtom)
  const [, setCurrentPlanPath] = useAtom(currentPlanPathAtom)

  // Only consider streaming if chat is actively streaming
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isInputStreaming = part.state === "input-streaming" && isActivelyStreaming

  // Get plan content - for Write mode it's in input.content, for Edit it's in new_string
  const planContent = isWrite ? (part.input?.content || "") : (part.input?.new_string || "")
  const filePath = part.input?.file_path || ""

  // Show shimmer during streaming/pending
  const shouldShowShimmer = isPending || isInputStreaming

  // View plan button enabled when there's content
  const viewPlanEnabled = planContent.length > 0

  // Build button disabled during streaming
  const buildDisabled = shouldShowShimmer

  // Check if we have content to show
  const hasVisibleContent = planContent.length > 0

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

  // Update gradients on scroll and expand state change
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    content.addEventListener("scroll", updateScrollGradients)
    // Initial check
    updateScrollGradients()

    return () => content.removeEventListener("scroll", updateScrollGradients)
  }, [updateScrollGradients, isExpanded])

  // Also update gradients when content changes
  useEffect(() => {
    updateScrollGradients()
  }, [planContent, updateScrollGradients])

  // Auto-set current plan path when plan file appears (so Details sidebar can show it immediately)
  useEffect(() => {
    if (filePath && hasVisibleContent) {
      setCurrentPlanPath(filePath)
    }
  }, [filePath, hasVisibleContent, setCurrentPlanPath])

  // Handle expand/collapse
  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  // Handle opening plan sidebar
  const handleOpenSidebar = useCallback(() => {
    if (filePath) {
      setCurrentPlanPath(filePath)
      setIsPlanSidebarOpen(true)
    }
  }, [filePath, setCurrentPlanPath, setIsPlanSidebarOpen])

  // Handle build plan - triggers via atom, consumed by ChatViewInner
  const handleBuildPlan = useCallback(() => {
    const activeSubChatId = useAgentSubChatStore.getState().activeSubChatId
    if (activeSubChatId) {
      setPendingBuildPlanSubChatId(activeSubChatId)
    }
  }, [setPendingBuildPlanSubChatId])

  // Handle copy plan
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(planContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [planContent])

  // If no content yet, show minimal view with shimmer (no icon during shimmer)
  if (!hasVisibleContent) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        {!shouldShowShimmer && (
          <PlanIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground">
          {shouldShowShimmer ? (
            <TextShimmer as="span" duration={1.2}>
              {isEdit ? "Updating plan..." : "Creating plan..."}
            </TextShimmer>
          ) : (
            "Plan"
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - title + expand/collapse button */}
      <div
        onClick={handleToggleExpand}
        className="flex items-center justify-between pl-2.5 pr-0.5 h-7 cursor-pointer hover:bg-muted/50 transition-colors duration-150"
      >
        <div className="flex items-center gap-1.5 text-xs truncate flex-1 min-w-0">
          <PlanIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
          {shouldShowShimmer ? (
            <TextShimmer as="span" duration={1.2} className="truncate">
              {isEdit ? "Updating plan..." : "Creating plan..."}
            </TextShimmer>
          ) : (
            <span className="truncate text-foreground font-medium">Plan</span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Copy button */}
          {hasVisibleContent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy()
                  }}
                  className="group p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
                >
                  <div className="relative w-3.5 h-3.5">
                    <CopyIcon
                      className={cn(
                        "absolute inset-0 w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-[opacity,transform,color] duration-200 ease-out",
                        copied ? "opacity-0 scale-50" : "opacity-100 scale-100",
                      )}
                    />
                    <CheckIcon
                      className={cn(
                        "absolute inset-0 w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-[opacity,transform,color] duration-200 ease-out",
                        copied ? "opacity-100 scale-100" : "opacity-0 scale-50",
                      )}
                    />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" showArrow={false}>
                Copy plan
              </TooltipContent>
            </Tooltip>
          )}

          {/* Expand/Collapse button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleToggleExpand()
            }}
            className="group p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
          >
            <div className="relative w-4 h-4">
              <ExpandIcon
                className={cn(
                  "absolute inset-0 w-4 h-4 text-muted-foreground group-hover:text-foreground transition-[opacity,transform,color] duration-200 ease-out",
                  isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
                )}
              />
              <CollapseIcon
                className={cn(
                  "absolute inset-0 w-4 h-4 text-muted-foreground group-hover:text-foreground transition-[opacity,transform,color] duration-200 ease-out",
                  isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
                )}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Content - markdown preview with scroll gradients */}
      <div className="relative">
        {/* Top scroll gradient - matches card background (muted/30) */}
        <div
          ref={topGradientRef}
          className="absolute top-0 left-0 right-0 h-6 pointer-events-none z-10 transition-opacity duration-150"
          style={{ opacity: 0, background: "linear-gradient(to bottom, color-mix(in srgb, hsl(var(--muted)) 30%, hsl(var(--background))) 0%, transparent 100%)" }}
        />

        <div
          ref={contentRef}
          onClick={() => !isExpanded && setIsExpanded(true)}
          className={cn(
            "text-xs overflow-hidden transition-all duration-200",
            isExpanded
              ? "max-h-[300px] overflow-y-auto"
              : "h-[72px] cursor-pointer hover:bg-muted/50",
          )}
        >
          <div className="px-3 py-2">
            <ChatMarkdownRenderer content={planContent} size="sm" />
          </div>
        </div>

        {/* Bottom scroll gradient - matches card background (muted/30) */}
        <div
          ref={bottomGradientRef}
          className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none z-10 transition-opacity duration-150"
          style={{ opacity: 1, background: "linear-gradient(to top, color-mix(in srgb, hsl(var(--muted)) 30%, hsl(var(--background))) 0%, transparent 100%)" }}
        />
      </div>

      {/* Footer - action buttons */}
      <div className="flex items-center justify-between p-1.5">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenSidebar}
            disabled={!viewPlanEnabled}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            View plan
          </Button>
        </div>

        {subChatMode === "plan" && (
          <Button
            size="sm"
            onClick={handleBuildPlan}
            disabled={buildDisabled}
            className="h-6 px-3 text-xs font-medium rounded-md transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
          >
            Approve
            <Kbd className="ml-1.5 text-primary-foreground/70">⌘↵</Kbd>
          </Button>
        )}
      </div>
    </div>
  )
}, areToolPropsEqual)
