// Utility functions adapted from commit-graph package
import type { Commit, CommitNode, BranchPathType } from "./types"

export const defaultStyle = {
  commitSpacing: 28,
  branchSpacing: 16,
  nodeRadius: 3,
  branchColors: [
    "#3b82f6", // blue-500
    "#22c55e", // green-500
    "#eab308", // yellow-500
    "#ef4444", // red-500
    "#a855f7", // purple-500
    "#06b6d4", // cyan-500
  ],
}

export function formatCommits(commits: Commit[]): CommitNode[] {
  const childrenMap: Map<string, Array<string>> = new Map()
  commits.forEach((commit) => {
    commit.parents.forEach((parent) => {
      if (childrenMap.get(parent.sha)) {
        childrenMap.get(parent.sha)?.push(commit.sha)
      } else {
        childrenMap.set(parent.sha, [commit.sha])
      }
    })
  })
  return commits.map((commit) => {
    return {
      hash: commit.sha,
      parents: commit.parents.map((p) => p.sha),
      children: childrenMap.get(commit.sha) ?? [],
      committer: commit.commit.author.name,
      message: commit.commit.message,
      commitDate: new Date(commit.commit.author.date),
      commitColor: "",
      x: -1,
      y: -1,
    }
  })
}

export function convertColorToMatrixVariant(color: string): string {
  if (color.startsWith("#")) {
    const r = parseInt(color.substring(1, 3), 16) / 255
    const g = parseInt(color.substring(3, 5), 16) / 255
    const b = parseInt(color.substring(5, 7), 16) / 255
    return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 0.5 0`
  }
  const [r, g, b] = color
    .toLowerCase()
    .replace("rgb(", "")
    .replace(")", "")
    .split(",")
    .map((x) => parseInt(x) / 255)
  return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 0.5 0`
}

export function setCommitNodeColor(
  branch: BranchPathType,
  columnNumber: number,
  commitsMap: Map<string, CommitNode>,
  branchColor: string
) {
  commitsMap.forEach((commit) => {
    if (
      commit.x === columnNumber &&
      branch.start <= commit.y &&
      branch.end >= commit.y
    ) {
      commit.commitColor = branchColor
    }
  })
}

export function setBranchAndCommitColor(
  columns: BranchPathType[][],
  branchColors: string[],
  commitsMap: Map<string, CommitNode>
) {
  columns.map((column, i) => {
    column.map((c) => {
      const branchColor = branchColors[c.branchOrder % branchColors.length]
      c.color = branchColor
      setCommitNodeColor(c, i, commitsMap, branchColor)
    })
  })
}

export function getCommitDotPosition(
  branchSpacing: number,
  commitSpacing: number,
  nodeRadius: number,
  commit: CommitNode
) {
  const x = branchSpacing * commit.x + nodeRadius * 4
  const y = commitSpacing * commit.y + nodeRadius * 4
  return { x, y }
}
