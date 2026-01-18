/**
 * Transforms a flat list of file entries into a hierarchical tree structure
 */

export interface FileEntry {
  path: string
  type: "file" | "folder"
}

export interface TreeNode {
  name: string
  path: string
  type: "file" | "folder"
  children: TreeNode[]
}

/**
 * Build a tree structure from a flat list of file entries
 */
export function buildFileTree(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const folderMap = new Map<string, TreeNode>()

  // Sort entries so folders come first, then alphabetically
  const sortedEntries = [...entries].sort((a, b) => {
    // Folders before files
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1
    }
    // Alphabetical within same type
    return a.path.localeCompare(b.path)
  })

  for (const entry of sortedEntries) {
    const parts = entry.path.split("/")
    const name = parts[parts.length - 1]

    const node: TreeNode = {
      name,
      path: entry.path,
      type: entry.type,
      children: [],
    }

    if (entry.type === "folder") {
      folderMap.set(entry.path, node)
    }

    // Find parent folder
    if (parts.length === 1) {
      // Root level
      root.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join("/")
      const parent = folderMap.get(parentPath)
      if (parent) {
        parent.children.push(node)
      } else {
        // Parent folder not in the list (shouldn't happen with proper scanning)
        root.push(node)
      }
    }
  }

  // Sort children of each folder: folders first, then files, alphabetically
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortChildren(node.children)
      }
    }
  }

  sortChildren(root)
  return root
}

/**
 * Count total files in a tree (excluding folders)
 */
export function countFiles(nodes: TreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === "file") {
      count++
    } else {
      count += countFiles(node.children)
    }
  }
  return count
}

/**
 * Count total folders in a tree
 */
export function countFolders(nodes: TreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === "folder") {
      count++
      count += countFolders(node.children)
    }
  }
  return count
}

/**
 * Filter tree nodes by search query
 * Returns nodes that match the query or have children that match
 */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) return nodes

  const lowerQuery = query.toLowerCase()

  const filterNode = (node: TreeNode): TreeNode | null => {
    const nameMatches = node.name.toLowerCase().includes(lowerQuery)

    if (node.type === "file") {
      return nameMatches ? node : null
    }

    // For folders, check if any children match
    const filteredChildren = node.children
      .map(filterNode)
      .filter((n): n is TreeNode => n !== null)

    // Include folder if its name matches OR it has matching children
    if (nameMatches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      }
    }

    return null
  }

  return nodes.map(filterNode).filter((n): n is TreeNode => n !== null)
}
