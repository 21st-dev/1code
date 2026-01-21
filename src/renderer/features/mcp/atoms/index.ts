import { atom } from "jotai"

// ============================================
// MCP SIDEBAR STATE
// ============================================

/**
 * Selected MCP category in sidebar
 * null = show chat view, "mcp" = show MCP servers view
 */
export const selectedMcpCategoryAtom = atom<"mcp" | null>(null)

// ============================================
// MCP SERVER SELECTION
// ============================================

/**
 * Currently selected MCP server ID for detail view
 * null = no server selected
 */
export const selectedMcpServerAtom = atom<string | null>(null)

// ============================================
// MCP AUTH MODAL STATE
// ============================================

/**
 * Controls the open/closed state of the MCP auth modal
 */
export const mcpAuthModalOpenAtom = atom<boolean>(false)

/**
 * The server ID for which the auth modal is open
 * null = no server (modal closed)
 */
export const mcpAuthModalServerIdAtom = atom<string | null>(null)

// ============================================
// MCP SEARCH STATE
// ============================================

/**
 * Search query for filtering MCP servers
 */
export const mcpServerSearchAtom = atom<string>("")
