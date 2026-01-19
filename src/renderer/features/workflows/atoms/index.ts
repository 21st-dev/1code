import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// WORKFOWS SIDEBAR STATE
// ============================================

/**
 * Controls the open/closed state of the workflows sidebar section
 * Persisted to localStorage as "workflows:sidebar-open"
 */
export const workflowsSidebarOpenAtom = atomWithStorage<boolean>(
  "workflows:sidebar-open",
  true,
  undefined,
  { getOnInit: true },
)

// ============================================
// WORKFOWS TREE EXPANSION STATE
// ============================================

/**
 * Storage atom for expanded tree nodes (array-based for JSON serialization)
 * atomWithStorage serializes Set to JSON, so we store as array and convert to Set in the derived atom
 * Storage key: "workflows:expanded-nodes"
 */
const workflowsTreeExpandedNodesStorageAtom = atomWithStorage<string[]>(
  "workflows:expanded-nodes",
  ["agents", "commands", "skills"], // Default: top-level categories expanded (as array)
  undefined,
  { getOnInit: true },
)

/**
 * Read-write atom for expanded nodes set
 * Converts between array (storage) and Set (usage)
 */
export const workflowsTreeExpandedNodesAtom = atom<Set<string>>(
  (get) => new Set(get(workflowsTreeExpandedNodesStorageAtom)),
  (get, set, newSet: Set<string>) => {
    set(workflowsTreeExpandedNodesStorageAtom, Array.from(newSet))
  },
)

/**
 * Toggle a single node's expanded state
 */
export const workflowsToggleNodeAtom = atom(
  null,
  (get, set, nodeKey: string) => {
    const current = get(workflowsTreeExpandedNodesStorageAtom)
    if (current.includes(nodeKey)) {
      set(workflowsTreeExpandedNodesStorageAtom, current.filter((k) => k !== nodeKey))
    } else {
      set(workflowsTreeExpandedNodesStorageAtom, [...current, nodeKey])
    }
  },
)

/**
 * Expand all nodes in a category
 */
export const workflowsExpandCategoryAtom = atom(
  null,
  (get, set, nodeKeys: string[]) => {
    const current = get(workflowsTreeExpandedNodesStorageAtom)
    const combined = [...new Set([...current, ...nodeKeys])] // Dedupe and add
    set(workflowsTreeExpandedNodesStorageAtom, combined)
  },
)

/**
 * Collapse all nodes in a category
 */
export const workflowsCollapseCategoryAtom = atom(
  null,
  (get, set, nodeKeys: string[]) => {
    const current = get(workflowsTreeExpandedNodesStorageAtom)
    const remaining = current.filter((k) => !nodeKeys.includes(k))
    set(workflowsTreeExpandedNodesStorageAtom, remaining)
  },
)

/**
 * Expand all nodes (helper for "Expand All" action)
 */
export const workflowsExpandAllAtom = atom(null, (_get, set, allNodeKeys: string[]) => {
  set(workflowsTreeExpandedNodesStorageAtom, allNodeKeys)
})

/**
 * Collapse all nodes (helper for "Collapse All" action)
 */
export const workflowsCollapseAllAtom = atom(null, (_get, set) => {
  set(workflowsTreeExpandedNodesStorageAtom, [])
})

// ============================================
// WORKFOWS NODE SELECTION
// ============================================

/**
 * Type of a selectable workflow node
 */
export type WorkflowNodeType = "agent" | "command" | "skill" | "tool" | "mcpServer"

/**
 * Represents a selected workflow node for preview
 */
export interface WorkflowNode {
  type: WorkflowNodeType
  id: string
  name: string
  sourcePath: string
}

/**
 * Currently selected workflow node for preview panel
 * null = no node selected
 */
export const selectedWorkflowNodeAtom = atom<WorkflowNode | null>(null)

// ============================================
// WORKFOWS REFRESH TRIGGER
// ============================================

/**
 * Increment to trigger data refresh from workflows router
 * Components can use useEffect with this atom to refetch data
 * Starts at 0, increment with set(workflowsRefreshTriggerAtom, n => n + 1)
 */
export const workflowsRefreshTriggerAtom = atom<number>(0)

// ============================================
// WORKFLOWS PREVIEW PANEL STATE
// ============================================

/**
 * Controls the open/closed state of the workflows preview panel
 * Persisted to localStorage as "workflows:preview-open"
 */
export const workflowsPreviewOpenAtom = atomWithStorage<boolean>(
  "workflows:preview-open",
  false, // Default: closed initially
  undefined,
  { getOnInit: true },
)

/**
 * Width of the workflows preview panel in pixels
 * Persisted to localStorage as "workflows:preview-width"
 */
export const workflowsPreviewWidthAtom = atomWithStorage<number>(
  "workflows:preview-width",
  400, // Default: 400px
  undefined,
  { getOnInit: true },
)

/**
 * The source file path currently displayed in the preview panel
 * null = no file selected
 */
export const workflowContentPathAtom = atom<string | null>(null)
