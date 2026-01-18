"use client"

import { useState, useMemo } from "react"
import { trpc } from "../../lib/trpc"
import { RefreshCw, History, ChevronDown, ChevronRight, Cloud, CloudOff } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import {
  formatCommits,
  setBranchAndCommitColor,
  defaultStyle,
  getCommitDotPosition,
} from "../../lib/commit-graph"
import { computePosition } from "../../lib/commit-graph/compute-position"
import { Branches, Curves, CommitDot } from "../../lib/commit-graph/svg-components"
import type { CommitNode, Branch } from "../../lib/commit-graph/types"

interface CommitGraphPanelProps {
  worktreePath: string | null
}

const graphStyle = {
  ...defaultStyle,
  commitSpacing: 28,
  branchSpacing: 12, // Tighter spacing for narrow column
  nodeRadius: 3,
}

const GRAPH_WIDTH = 40 // Fixed narrow width for graph column

export function CommitGraphPanel({ worktreePath }: CommitGraphPanelProps) {
  const [isOpen, setIsOpen] = useState(true)

  const { data, isLoading, isFetching } = trpc.changes.getCommitLog.useQuery(
    { worktreePath: worktreePath || "", limit: 50, offset: 0 },
    {
      enabled: !!worktreePath,
      staleTime: 30000,
    }
  )

  // Process commits for graph rendering
  const graphData = useMemo(() => {
    if (!data?.commits || data.commits.length === 0) return null

    const commitNodes = formatCommits(data.commits)
    const { columns, commitsMap } = computePosition(commitNodes)
    setBranchAndCommitColor(columns, graphStyle.branchColors, commitsMap)

    const commitsArray = Array.from(commitsMap.values())
    const height = commitsMap.size
      ? Math.max(...commitsArray.map((c) => c.y)) * graphStyle.commitSpacing + graphStyle.nodeRadius * 8 + 20
      : 0

    return {
      columns,
      commitsMap,
      commitsArray,
      height,
      branches: data.branches,
      remoteShas: new Set(data.remoteShas),
    }
  }, [data])

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
        <div className="px-1 py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Loading history...
            </div>
          ) : graphData && graphData.commitsArray.length > 0 ? (
            <div className="relative" style={{ height: graphData.height }}>
              {/* SVG Graph - narrow fixed width, overlaid behind text */}
              <svg
                width={GRAPH_WIDTH}
                height={graphData.height}
                className="absolute left-0 top-0"
                style={{ zIndex: 0 }}
              >
                <Branches
                  columns={graphData.columns}
                  commitsMap={graphData.commitsMap}
                  commitSpacing={graphStyle.commitSpacing}
                  branchSpacing={graphStyle.branchSpacing}
                  nodeRadius={graphStyle.nodeRadius}
                  branchColors={graphStyle.branchColors}
                />
                <Curves
                  commitsMap={graphData.commitsMap}
                  commits={graphData.commitsArray}
                  commitSpacing={graphStyle.commitSpacing}
                  branchSpacing={graphStyle.branchSpacing}
                  nodeRadius={graphStyle.nodeRadius}
                />
                {graphData.commitsArray.map((commit) => (
                  <CommitDot
                    key={`${commit.hash}-dot`}
                    commit={commit}
                    commitSpacing={graphStyle.commitSpacing}
                    branchSpacing={graphStyle.branchSpacing}
                    nodeRadius={graphStyle.nodeRadius}
                  />
                ))}
              </svg>

              {/* Commit Rows (our UI) - overlaid on top of graph */}
              <div className="relative" style={{ zIndex: 1, paddingLeft: GRAPH_WIDTH }}>
                {graphData.commitsArray.map((commit) => (
                  <CommitRow
                    key={commit.hash}
                    commit={commit}
                    branches={graphData.branches}
                    isLocal={!graphData.remoteShas.has(commit.hash)}
                    graphStyle={graphStyle}
                  />
                ))}
              </div>
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

// Our custom commit row component
function CommitRow({
  commit,
  branches,
  isLocal,
  graphStyle,
}: {
  commit: CommitNode
  branches: Branch[]
  isLocal: boolean
  graphStyle: typeof defaultStyle
}) {
  const { y } = getCommitDotPosition(
    graphStyle.branchSpacing,
    graphStyle.commitSpacing,
    graphStyle.nodeRadius,
    commit
  )

  // Find branch labels for this commit
  const commitBranches = branches.filter((b) => b.commit.sha === commit.hash)
  const shortHash = commit.hash.slice(0, 7)

  return (
    <div
      className="flex items-center gap-1.5 pr-2 text-xs"
      style={{
        height: graphStyle.commitSpacing,
      }}
    >
      {/* Commit message */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-foreground truncate max-w-[200px] cursor-default">
            {commit.message}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[300px]">
          <p className="font-medium">{commit.message}</p>
          <p className="text-muted-foreground text-xs mt-1">
            {commit.committer} · {shortHash}
          </p>
        </TooltipContent>
      </Tooltip>

      {/* Branch labels - smaller, inline badges with truncation */}
      {commitBranches.map((branch) => (
        <Tooltip key={branch.name}>
          <TooltipTrigger asChild>
            <span
              className="px-1 py-0 rounded text-[9px] font-medium leading-tight inline-block truncate max-w-[60px]"
              style={{
                backgroundColor: commit.commitColor + "15",
                color: commit.commitColor,
                border: `1px solid ${commit.commitColor}40`,
              }}
            >
              {branch.name}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{branch.name}</p>
          </TooltipContent>
        </Tooltip>
      ))}

      {/* Spacer to push hash and icon to the right */}
      <div className="flex-1 min-w-[8px]" />

      {/* Short hash - right aligned */}
      <span className="text-muted-foreground font-mono text-[10px]">{shortHash}</span>

      {/* Sync status */}
      {isLocal ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <CloudOff className="h-3 w-3 text-yellow-500 flex-shrink-0" />
          </TooltipTrigger>
          <TooltipContent>Not pushed to remote</TooltipContent>
        </Tooltip>
      ) : (
        <Cloud className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
      )}
    </div>
  )
}
