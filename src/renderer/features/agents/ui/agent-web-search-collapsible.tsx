"use client"

import { memo, useState, useMemo } from "react"
import { ChevronRight } from "lucide-react"
import { ExternalLinkIcon } from "../../../components/ui/icons"
import { areToolPropsEqual } from "./agent-tool-utils"
import { cn } from "../../../lib/utils"

interface SearchResult {
  title: string
  url: string
}

interface AgentWebSearchCollapsibleProps {
  part: any
  chatStatus?: string
}

export const AgentWebSearchCollapsible = memo(
  function AgentWebSearchCollapsible({
    part,
    chatStatus,
  }: AgentWebSearchCollapsibleProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    const isPending =
      part.state !== "output-available" && part.state !== "output-error"
    // Include "submitted" status - this is when request was sent but streaming hasn't started yet
    const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
    const isStreaming = isPending && isActivelyStreaming

    const query = part.input?.query || ""

    // Parse results from output
    const results = useMemo(() => {
      if (!part.output?.results) return []

      const rawResults = part.output.results
      const allResults: SearchResult[] = []

      for (const result of rawResults) {
        if (result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            if (item.title && item.url) {
              allResults.push({ title: item.title, url: item.url })
            }
          }
        } else if (result.title && result.url) {
          allResults.push({ title: result.title, url: result.url })
        }
      }

      return allResults
    }, [part.output?.results])

    const resultCount = results.length
    const hasResults = resultCount > 0

    return (
      <div>
        {/* Header - clickable to toggle */}
        <div
          onClick={() => hasResults && !isPending && setIsExpanded(!isExpanded)}
          className={cn(
            "group flex items-start gap-1.5 py-0.5 px-2",
            hasResults && !isPending && "cursor-pointer",
          )}
        >
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <div className="text-xs flex items-center gap-1.5 min-w-0">
              <span className="font-medium whitespace-nowrap flex-shrink-0 text-muted-foreground">
                {isStreaming ? "Searching web" : "Searched web"}
              </span>
              {/* Query preview when collapsed */}
              <span className="text-muted-foreground/60 truncate">
                {query.length > 40 ? query.slice(0, 37) + "..." : query}
              </span>
              {/* Result count */}
              {!isStreaming && hasResults && (
                <span className="text-muted-foreground/60 whitespace-nowrap flex-shrink-0">
                  · {resultCount} {resultCount === 1 ? "result" : "results"}
                </span>
              )}
              {/* Chevron - rotates when expanded, visible on hover when collapsed */}
              {hasResults && !isPending && (
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out flex-shrink-0",
                    isExpanded && "rotate-90",
                    !isExpanded && "opacity-0 group-hover:opacity-100",
                  )}
                />
              )}
            </div>
          </div>
        </div>

        {/* Results list - only show when expanded */}
        {isExpanded && hasResults && (
          <div className="px-2 pb-1">
            <div className="space-y-1">
              {results.map((result, idx) => (
                <a
                  key={idx}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors group/link"
                >
                  <ExternalLinkIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground group-hover/link:text-foreground transition-colors" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-foreground truncate">
                      {result.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {result.url}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  },
  areToolPropsEqual,
)
