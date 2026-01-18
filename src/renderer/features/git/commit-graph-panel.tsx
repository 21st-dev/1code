"use client"

import { useState, useCallback } from "react"
import { CommitGraph } from "commit-graph"
import { trpc } from "../../lib/trpc"
import { RefreshCw, History } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible"
import { ChevronDown, ChevronRight } from "lucide-react"

interface CommitGraphPanelProps {
  worktreePath: string | null
}

export function CommitGraphPanel({ worktreePath }: CommitGraphPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 50

  const { data, isLoading, isFetching } = trpc.changes.getCommitLog.useQuery(
    { worktreePath: worktreePath || "", limit, offset },
    {
      enabled: !!worktreePath,
      staleTime: 30000, // Cache for 30 seconds
    }
  )

  const loadMore = useCallback(() => {
    if (data?.hasMore) {
      setOffset((prev) => prev + limit)
    }
  }, [data?.hasMore, limit])

  if (!worktreePath) {
    return null
  }

  const commitCount = data?.totalCount ?? 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1 hover:bg-muted/50 text-sm">
        <div className="flex items-center gap-1">
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <History className="h-3.5 w-3.5 mr-1" />
          <span className="font-medium">History</span>
          {commitCount > 0 && (
            <span className="text-muted-foreground ml-1 text-xs">
              ({commitCount})
            </span>
          )}
        </div>
        {(isLoading || isFetching) && (
          <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-2 py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Loading history...
            </div>
          ) : data?.commits && data.commits.length > 0 ? (
            <div className="commit-graph-container">
              <CommitGraph
                commits={data.commits}
                branchHeads={data.branches}
                graphStyle={{
                  commitSpacing: 40,
                  branchSpacing: 20,
                  branchColors: [
                    "#3b82f6", // blue
                    "#22c55e", // green
                    "#eab308", // yellow
                    "#ef4444", // red
                    "#a855f7", // purple
                    "#06b6d4", // cyan
                  ],
                  nodeRadius: 4,
                }}
                onCommitClick={(commit) => {
                  console.log("[CommitGraph] Clicked commit:", commit.sha)
                }}
              />
              {data.hasMore && (
                <button
                  onClick={loadMore}
                  disabled={isFetching}
                  className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
                >
                  {isFetching ? "Loading..." : "Load more commits"}
                </button>
              )}
            </div>
          ) : (
            <div className="px-4 py-8 text-xs text-muted-foreground text-center">
              No commit history
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
