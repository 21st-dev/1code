// SVG rendering components adapted from commit-graph package
import type { CommitNode, BranchPathType } from "./types"
import { convertColorToMatrixVariant, getCommitDotPosition } from "./utils"

// ============ Branch Path ============

type BranchPathProps = {
  start: number
  end: number
  commitSpacing: number
  branchSpacing: number
  branchOrder: number
  branchColor: string
  nodeRadius: number
}

function BranchPath({
  start,
  end,
  commitSpacing,
  branchSpacing,
  branchColor,
  branchOrder,
  nodeRadius,
}: BranchPathProps) {
  const x = nodeRadius * 4 + branchOrder * branchSpacing - 1

  return (
    <line
      x1={x}
      y1={start * commitSpacing + nodeRadius * 2}
      x2={x}
      y2={end * commitSpacing + nodeRadius * 5}
      stroke={branchColor}
      strokeWidth="2"
      strokeLinecap="round"
    />
  )
}

// ============ Branches ============

type BranchesProps = {
  columns: BranchPathType[][]
  commitSpacing: number
  branchSpacing: number
  nodeRadius: number
  commitsMap: Map<string, CommitNode>
  branchColors: string[]
}

export function Branches({
  columns,
  commitsMap,
  commitSpacing,
  branchSpacing,
  nodeRadius,
  branchColors,
}: BranchesProps) {
  return (
    <>
      {columns.map((column, i) => {
        return column.map((c) => {
          // Use the endCommit's actual y position, or fallback to end value
          // This ensures branch lines stop at their actual end commit
          let end = c.end
          if (c.end === Infinity && c.endCommit) {
            end = c.endCommit.y
          } else if (c.end === Infinity) {
            // Fallback: find end commit from map
            const endCommit = commitsMap.get(c.endCommitHash)
            end = endCommit ? endCommit.y : c.start
          }
          return (
            <BranchPath
              key={`branch-path-${i}-${c.start}-${end}`}
              start={c.start}
              end={end}
              commitSpacing={commitSpacing}
              branchSpacing={branchSpacing}
              branchColor={
                c.color || branchColors[c.branchOrder % branchColors.length]
              }
              branchOrder={i}
              nodeRadius={nodeRadius}
            />
          )
        })
      })}
    </>
  )
}

// ============ Curve Path ============

type CurveReturnType = {
  path: string
  stroke: string
  id: string
}

function CurvePath({ curve }: { curve: CurveReturnType }) {
  return (
    <path
      d={curve.path}
      stroke={curve.stroke}
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
  )
}

// ============ Curves ============

function curvePath(start: number[], end: number[]) {
  const cx2 = start[0] * 0.03 + end[0] * 0.97
  const cy2 = start[1] * 0.4 + end[1] * 0.6
  const cx1 = start[0] * 0.1 + end[0] * 0.9
  const cy1 = start[1] * 0.6 + end[1] * 0.4

  return `M ${start[0]} ${start[1]} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end[0]} ${end[1]}`
}

function getPositionsBySpacing(
  branchSpacing: number,
  commitSpacing: number,
  nodeRadius: number,
  x: number,
  y: number
) {
  const realX = branchSpacing * x + nodeRadius * 4
  const realY = commitSpacing * y + nodeRadius * 2
  return [realX, realY]
}

function getMergedFromBranchHeadPositions(
  commit: CommitNode,
  commitsMap: Map<string, CommitNode>,
  branchSpacing: number,
  commitSpacing: number,
  nodeRadius: number
): CurveReturnType[] {
  if (commit.parents.length < 2) {
    return []
  }
  const mergedFromBranchHeadPositions: CurveReturnType[] = []

  for (let i = 1; i < commit.parents.length; i++) {
    const parent = commitsMap.get(commit.parents[i])
    if (parent) {
      const start = getPositionsBySpacing(
        branchSpacing,
        commitSpacing,
        nodeRadius,
        commit.x,
        commit.y
      )
      const endPoint = commit.y + 1 > parent.y ? parent.y : commit.y + 1

      const end = getPositionsBySpacing(
        branchSpacing,
        commitSpacing,
        nodeRadius,
        parent.x,
        endPoint
      )
      mergedFromBranchHeadPositions.push({
        path: curvePath(start, end),
        stroke: parent.commitColor,
        id: `filter_${commit.hash.slice(0, 7)}_curved_path_${parent.hash.slice(0, 7)}`,
      })
    }
  }
  return mergedFromBranchHeadPositions
}

function getNewBranchToPath(
  commit: CommitNode,
  commitsMap: Map<string, CommitNode>,
  branchSpacing: number,
  commitSpacing: number,
  nodeRadius: number
): CurveReturnType[] {
  if (commit.children.length < 2) {
    return []
  }
  const newBranchToPositions: CurveReturnType[] = []
  commit.children.forEach((c) => {
    const child = commitsMap.get(c)
    if (child && child.parents[0] === commit.hash && child.x !== commit.x) {
      const start = getPositionsBySpacing(
        branchSpacing,
        commitSpacing,
        nodeRadius,
        commit.x,
        commit.y
      )

      const endPoint = commit.y - 1 > child.y ? commit.y - 1 : child.y

      const end = getPositionsBySpacing(
        branchSpacing,
        commitSpacing,
        nodeRadius,
        child.x,
        endPoint
      )

      newBranchToPositions.push({
        path: curvePath(start, [end[0], end[1] + nodeRadius * 2]),
        stroke: child.commitColor,
        id: `filter_${commit.hash.slice(0, 7)}_curved_path_${child.hash.slice(0, 7)}`,
      })
    }
  })

  return newBranchToPositions
}

type CurvesProps = {
  commits: CommitNode[]
  commitsMap: Map<string, CommitNode>
  commitSpacing: number
  branchSpacing: number
  nodeRadius: number
}

export function Curves({
  commits,
  commitsMap,
  commitSpacing,
  branchSpacing,
  nodeRadius,
}: CurvesProps) {
  return (
    <>
      {commits.map((commit) => {
        const mergedCurves = getMergedFromBranchHeadPositions(
          commit,
          commitsMap,
          branchSpacing,
          commitSpacing,
          nodeRadius
        )

        const newBranchCurves = getNewBranchToPath(
          commit,
          commitsMap,
          branchSpacing,
          commitSpacing,
          nodeRadius
        )
        return (
          <g key={commit.hash}>
            {newBranchCurves.map((c) => (
              <CurvePath key={c.id} curve={c} />
            ))}
            {mergedCurves.map((curve) => (
              <CurvePath key={curve.id} curve={curve} />
            ))}
          </g>
        )
      })}
    </>
  )
}

// ============ Commit Dot ============

type CommitDotProps = {
  commit: CommitNode
  commitSpacing: number
  branchSpacing: number
  nodeRadius: number
}

export function CommitDot({
  commit,
  commitSpacing,
  branchSpacing,
  nodeRadius,
}: CommitDotProps) {
  const { x, y } = getCommitDotPosition(
    branchSpacing,
    commitSpacing,
    nodeRadius,
    commit
  )

  return (
    <circle
      cx={x}
      cy={y}
      r={nodeRadius * 2}
      fill={commit.commitColor}
      stroke="var(--background)"
      strokeWidth="1.5"
    />
  )
}
