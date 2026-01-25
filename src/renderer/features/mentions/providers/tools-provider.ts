/**
 * MCP Tools Mention Provider
 *
 * Provides MCP (Model Context Protocol) tools from connected servers.
 * Tools are passed via the search context from the component that has access to sessionInfoAtom.
 */

import {
  createMentionProvider,
  type MentionItem,
  type MentionSearchContext,
  type MentionSearchResult,
  MENTION_PREFIXES,
  sortByRelevance,
} from "../types"

/**
 * Data payload for tool mentions
 */
export interface ToolData {
  fullName: string // mcp__servername__toolname
  toolName: string // toolname
  serverName: string
  displayName: string // Tool Name (formatted)
}

/**
 * MCP Server info (minimal)
 */
interface MCPServerInfo {
  name: string
  status: "connected" | "connecting" | "disconnected" | "failed"
}

/**
 * Extended search context with MCP tools info
 */
export interface ToolsSearchContext extends MentionSearchContext {
  mcpTools?: string[]
  mcpServers?: MCPServerInfo[]
}

/**
 * Format MCP tool name for display
 * Converts snake_case/underscore names to readable format
 * e.g., "get_design_context" -> "Get design context"
 */
function formatToolName(toolName: string): string {
  return toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Get tools from context
 */
function getToolsFromContext(context: ToolsSearchContext): ToolData[] {
  if (!context.mcpTools || !context.mcpServers) {
    return []
  }

  // Get connected MCP server names
  const connectedServers = new Set(
    context.mcpServers
      .filter((server) => server.status === "connected")
      .map((server) => server.name)
  )

  // Filter tools that belong to connected MCP servers
  // Format: mcp__servername__toolname
  const mcpTools = context.mcpTools.filter((tool) => {
    if (!tool.startsWith("mcp__")) return false
    const parts = tool.split("__")
    if (parts.length < 3) return false
    const serverName = parts[1]
    return connectedServers.has(serverName)
  })

  return mcpTools.map((tool) => {
    const parts = tool.split("__")
    const serverName = parts[1] || ""
    const toolName = parts.slice(2).join("__")

    return {
      fullName: tool,
      toolName,
      serverName,
      displayName: formatToolName(toolName),
    }
  })
}

/**
 * MCP Tools provider
 */
export const toolsProvider = createMentionProvider<ToolData>({
  id: "tools",
  name: "MCP Tools",
  category: {
    label: "MCP Tools",
    priority: 60,
  },
  trigger: {
    char: "@",
    position: "standalone",
    allowSpaces: true,
  },
  priority: 60,

  async search(context: MentionSearchContext): Promise<MentionSearchResult<ToolData>> {
    const startTime = performance.now()

    // Check for abort
    if (context.signal.aborted) {
      return { items: [], hasMore: false, timing: 0 }
    }

    try {
      // Get tools from context (must be passed by the calling component)
      const tools = getToolsFromContext(context as ToolsSearchContext)

      // Map to MentionItem format
      let items: MentionItem<ToolData>[] = tools.map((tool) => ({
        id: `${MENTION_PREFIXES.TOOL}${tool.fullName}`,
        label: tool.displayName,
        description: `${tool.serverName} / ${tool.toolName}`,
        icon: "tool",
        data: tool,
        // Search by multiple fields
        keywords: [tool.toolName, tool.serverName, tool.fullName],
        metadata: {
          type: "tool" as const,
        },
      }))

      // Apply relevance sorting if there's a query
      if (context.query) {
        items = sortByRelevance(items, context.query)
      }

      // Apply limit
      const limitedItems = items.slice(0, context.limit)

      const timing = performance.now() - startTime

      return {
        items: limitedItems,
        hasMore: items.length > context.limit,
        totalCount: tools.length,
        timing,
      }
    } catch (error) {
      console.error("[ToolsProvider] Search error:", error)
      return {
        items: [],
        hasMore: false,
        warning: "Failed to load MCP tools",
        timing: performance.now() - startTime,
      }
    }
  },

  serialize(item: MentionItem<ToolData>): string {
    return `@[${item.id}]`
  },

  deserialize(token: string): MentionItem<ToolData> | null {
    try {
      // Check if this token belongs to us
      if (!token.startsWith(MENTION_PREFIXES.TOOL)) {
        return null
      }

      // Parse: tool:mcp__servername__toolname
      const fullName = token.slice(MENTION_PREFIXES.TOOL.length)

      // Parse the full name
      const parts = fullName.split("__")
      if (parts.length < 3 || parts[0] !== "mcp") {
        return null
      }

      const serverName = parts[1] || ""
      const toolName = parts.slice(2).join("__")

      if (!toolName) {
        return null
      }

      return {
        id: token,
        label: formatToolName(toolName),
        description: `${serverName} / ${toolName}`,
        icon: "tool",
        data: {
          fullName,
          toolName,
          serverName,
          displayName: formatToolName(toolName),
        },
        metadata: {
          type: "tool",
        },
      }
    } catch (error) {
      console.warn(`[ToolsProvider] Failed to deserialize token: ${token}`, error)
      return null
    }
  },

  isAvailable(context) {
    // Tools are available when we have MCP tools in context
    const toolsContext = context as { mcpTools?: string[] }
    return Array.isArray(toolsContext.mcpTools) && toolsContext.mcpTools.length > 0
  },
})

export default toolsProvider
