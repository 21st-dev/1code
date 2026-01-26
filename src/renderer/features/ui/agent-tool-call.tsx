import { memo } from "react"
import DOMPurify from "dompurify"
import { TextShimmer } from "../../components/ui/text-shimmer"

interface AgentToolCallProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  isPending: boolean
  isError: boolean
  isNested?: boolean
}

export const AgentToolCall = memo(
  function AgentToolCall({
    icon: _Icon,
    title,
    subtitle,
    isPending,
    isError: _isError,
    isNested,
  }: AgentToolCallProps) {
    // Ensure title and subtitle are strings (copied from canvas)
    const titleStr = String(title)
    const subtitleStr = subtitle ? String(subtitle) : undefined

    return (
      <div
        className={`flex items-start gap-1.5 py-0.5 ${
          isNested ? "px-2.5" : "rounded-md px-2"
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
            {subtitleStr && (
              <span
                className="text-muted-foreground/60 font-normal truncate min-w-0"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(subtitleStr) }}
              />
            )}
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
      prevProps.isPending === nextProps.isPending &&
      prevProps.isError === nextProps.isError &&
      prevProps.isNested === nextProps.isNested
    )
  },
)
