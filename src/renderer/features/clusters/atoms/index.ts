import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// CLUSTERS SIDEBAR STATE
// ============================================

/**
 * Selected clusters category in sidebar
 * null = show chat view, "clusters" = show clusters view
 */
export const selectedClustersCategoryAtom = atom<"clusters" | null>(null)

// ============================================
// CLUSTER SELECTION
// ============================================

/**
 * Currently selected cluster name for detail view
 * Persisted to localStorage to remember selection across sessions
 */
export const selectedClusterIdAtom = atomWithStorage<string | null>(
  "clusters:selected-cluster-id",
  null,
  undefined,
  { getOnInit: true }
)

// ============================================
// CLUSTERS SEARCH STATE
// ============================================

/**
 * Search query for filtering clusters
 */
export const clusterSearchAtom = atom<string>("")

// ============================================
// NAMESPACE SELECTION
// ============================================

/**
 * Currently selected namespace for viewing pods/resources
 * null = use default namespace from settings
 */
export const selectedNamespaceAtom = atom<string | null>(null)
