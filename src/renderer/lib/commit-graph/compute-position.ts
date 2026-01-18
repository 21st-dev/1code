// Position computation algorithm adapted from commit-graph package
import type { CommitNode, BranchPathType } from "./types"

function topologicalOrderCommits(
  commits: CommitNode[],
  commitsMap: Map<string, CommitNode>
): string[] {
  const commitsSortByCommitterDate = commits.sort(
    (a, b) => b.commitDate.getTime() - a.commitDate.getTime()
  )

  const sortedCommits: string[] = []
  const seen = new Map<string, boolean>()

  function dfs(commit: CommitNode) {
    const commitHash = commit.hash
    if (seen.get(commitHash)) {
      return
    }
    seen.set(commitHash, true)
    commit.children.forEach((children) => {
      const child = commitsMap.get(children)
      if (child) dfs(child)
    })
    sortedCommits.push(commitHash)
  }

  commitsSortByCommitterDate.forEach((commit) => {
    dfs(commit)
  })

  return sortedCommits
}

function computeColumns(
  orderedCommitHashes: string[],
  commitsMap: Map<string, CommitNode>
) {
  const commitsMapWithPos = new Map<string, CommitNode>()
  orderedCommitHashes.forEach((commitHash, index) => {
    commitsMapWithPos.set(commitHash, {
      ...commitsMap.get(commitHash)!,
      y: index,
    } as CommitNode)
  })

  const columns: BranchPathType[][] = []
  const commitXs: Map<string, number> = new Map()

  function updateColumnEnd(col: number, end: number, endCommitHash: string) {
    columns[col][columns[col].length - 1] = {
      ...columns[col][columns[col].length - 1],
      end,
      endCommitHash,
    }
  }

  let branchOrder = 0

  orderedCommitHashes.forEach((commitHash, index) => {
    const commit = commitsMap.get(commitHash)!

    const branchChildren = commit.children.filter(
      (child) => commitsMap.get(child)?.parents[0] === commit.hash
    )

    const isLastCommitOnBranch = commit.children.length === 0
    const isBranchOutCommit = branchChildren.length > 0

    let commitX = -1

    const isFirstCommit = commit.parents.length === 0
    const end = isFirstCommit ? index : Infinity

    if (isLastCommitOnBranch) {
      columns.push([
        {
          start: index,
          end,
          endCommitHash: commit.hash,
          branchOrder,
        },
      ])
      branchOrder++
      commitX = columns.length - 1
    } else if (isBranchOutCommit) {
      const branchChildrenXs = branchChildren
        .map((childHash) => commitXs.get(childHash))
        .filter((x) => x !== undefined) as number[]

      commitX = Math.min(...branchChildrenXs)
      updateColumnEnd(commitX, end, commit.hash)

      branchChildrenXs
        .filter((childX) => childX !== commitX)
        .forEach((childX) => {
          updateColumnEnd(childX!, index - 1, commit.hash)
        })
    } else {
      let minChildY = Infinity
      let maxChildX = -1

      commit.children.forEach((child) => {
        const childY = commitsMapWithPos.get(child)?.y ?? Infinity
        const childX = commitXs.get(child) ?? -1

        if (childY < minChildY) {
          minChildY = childY
        }
        if (childX > maxChildX) {
          maxChildX = childX
        }
      })

      const colFitAtEnd = columns.slice(maxChildX + 1).findIndex((column) => {
        return minChildY >= column[column.length - 1].end
      })

      const col = colFitAtEnd === -1 ? -1 : maxChildX + 1 + colFitAtEnd

      if (col === -1) {
        columns.push([
          {
            start: minChildY + 1,
            end,
            endCommitHash: commit.hash,
            branchOrder,
          },
        ])
        branchOrder++
        commitX = columns.length - 1
      } else {
        commitX = col
        columns[col].push({
          start: minChildY + 1,
          end,
          endCommitHash: commit.hash,
          branchOrder,
        })
        branchOrder++
      }
    }

    commitXs.set(commitHash, commitX)
    commitsMapWithPos.set(commitHash, {
      ...commit,
      y: index,
      x: commitX,
    })
  })

  return { columns, commitsMapWithPos }
}

export function computePosition(commits: CommitNode[]) {
  const commitsMap = new Map<string, CommitNode>(
    commits.map((commit) => [commit.hash, commit])
  )
  const orderedCommitHashes = topologicalOrderCommits(commits, commitsMap)
  const { columns, commitsMapWithPos } = computeColumns(
    orderedCommitHashes,
    commitsMap
  )

  const columnsWithEndCommit = columns.map((column) => {
    return column.map((branchPath) => {
      return {
        ...branchPath,
        endCommit: commitsMapWithPos.get(branchPath.endCommitHash),
      }
    })
  })
  return { columns: columnsWithEndCommit, commitsMap: commitsMapWithPos }
}
