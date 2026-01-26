"use client"

import { memo } from "react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"

interface AgentToolCallProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  tooltipContent?: string
  isPending: boolean
  isError: boolean
  isNested?: boolean
}

export const AgentToolCall = memo(
  function AgentToolCall({
    // icon and isError are part of the interface but currently unused in UI
    // They're kept in props for API consistency with other tool components
    icon: _icon,
    title,
    subtitle,
    tooltipContent,
    isPending,
    isError: _isError,
    isNested,
  }: AgentToolCallProps) {
    void _icon
    void _isError
    // Ensure title and subtitle are strings (copied from canvas)
    const titleStr = String(title)
    const subtitleStr = subtitle ? String(subtitle) : undefined

    // Render subtitle with optional tooltip
    const subtitleElement = subtitleStr ? (
      tooltipContent ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="text-muted-foreground/60 font-normal truncate min-w-0"
              dangerouslySetInnerHTML={{ __html: subtitleStr }}
            />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="px-2 py-1.5 max-w-none flex items-center justify-center"
          >
            <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
              {tooltipContent}
            </span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span
          className="text-muted-foreground/60 font-normal truncate min-w-0"
          dangerouslySetInnerHTML={{ __html: subtitleStr }}
        />
      )
    ) : null

    return (
      <div
        className={`flex items-start gap-1.5 py-0.5 transition-colors duration-150 ${
          isNested ? "px-2.5" : "rounded-md px-2 hover:bg-muted/30"
        }`}
      >
        {/* Icon container - commented out like canvas, uncomment to show icons */}
        {/* <div className="flex-shrink-0 flex text-muted-foreground items-start pt-[1px]">
          <_Icon className="w-3.5 h-3.5" />
        </div> */}

        {/* Content container - matches canvas exactly */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  {titleStr}
                </TextShimmer>
              ) : (
                titleStr
              )}
            </span>
            {subtitleElement}
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization (copied from canvas)
    return (
      prevProps.title === nextProps.title &&
      prevProps.subtitle === nextProps.subtitle &&
      prevProps.tooltipContent === nextProps.tooltipContent &&
      prevProps.isPending === nextProps.isPending &&
      prevProps.isError === nextProps.isError &&
      prevProps.isNested === nextProps.isNested
    )
  },
)
