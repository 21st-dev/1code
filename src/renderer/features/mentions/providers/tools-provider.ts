/**
 * MCP Servers Mention Provider
 *
 * Provides connected MCP (Model Context Protocol) servers for mentions.
 * When a server is mentioned, Claude is hinted to use tools from that server.
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
 * Data payload for MCP server mentions
 */
export interface ToolData {
  serverName: string
  toolCount: number
}

/**
 * MCP Server info (minimal)
 */
interface MCPServerInfo {
  name: string
  status: "connected" | "connecting" | "disconnected" | "failed"
}

/**
 * Extended search context with MCP info
 */
export interface ToolsSearchContext extends MentionSearchContext {
  mcpTools?: string[]
  mcpServers?: MCPServerInfo[]
}

/**
 * Get connected MCP servers from context with tool counts
 */
function getServersFromContext(context: ToolsSearchContext): ToolData[] {
  if (!context.mcpServers) {
    return []
  }

  const connectedServers = context.mcpServers
    .filter((server) => server.status === "connected")

  // Count tools per server
  const toolCountByServer = new Map<string, number>()
  if (context.mcpTools) {
    for (const tool of context.mcpTools) {
      if (!tool.startsWith("mcp__")) continue
      const parts = tool.split("__")
      if (parts.length < 3) continue
      const serverName = parts[1]
      toolCountByServer.set(serverName, (toolCountByServer.get(serverName) || 0) + 1)
    }
  }

  return connectedServers.map((server) => ({
    serverName: server.name,
    toolCount: toolCountByServer.get(server.name) || 0,
  }))
}

/**
 * MCP Servers provider
 */
export const toolsProvider = createMentionProvider<ToolData>({
  id: "tools",
  name: "MCP",
  category: {
    label: "MCP",
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

    if (context.signal.aborted) {
      return { items: [], hasMore: false, timing: 0 }
    }

    try {
      const servers = getServersFromContext(context as ToolsSearchContext)

      let items: MentionItem<ToolData>[] = servers.map((server) => ({
        id: `${MENTION_PREFIXES.TOOL}${server.serverName}`,
        label: server.serverName,
        description: server.toolCount > 0 ? `${server.toolCount} tools` : "",
        icon: "tool",
        data: server,
        keywords: [server.serverName],
        metadata: {
          type: "tool" as const,
        },
      }))

      if (context.query) {
        items = sortByRelevance(items, context.query)
      }

      const limitedItems = items.slice(0, context.limit)
      const timing = performance.now() - startTime

      return {
        items: limitedItems,
        hasMore: items.length > context.limit,
        totalCount: servers.length,
        timing,
      }
    } catch (error) {
      console.error("[ToolsProvider] Search error:", error)
      return {
        items: [],
        hasMore: false,
        warning: "Failed to load MCP servers",
        timing: performance.now() - startTime,
      }
    }
  },

  serialize(item: MentionItem<ToolData>): string {
    return `@[${item.id}]`
  },

  deserialize(token: string): MentionItem<ToolData> | null {
    try {
      if (!token.startsWith(MENTION_PREFIXES.TOOL)) {
        return null
      }

      const value = token.slice(MENTION_PREFIXES.TOOL.length)
      if (!value) {
        return null
      }

      // Handle both formats: server name or mcp__server__tool
      if (value.startsWith("mcp__")) {
        const parts = value.split("__")
        const serverName = parts[1] || value
        const toolName = parts.length >= 3 ? parts.slice(2).join("__") : value
        const displayName = toolName
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
          .trim()
        return {
          id: token,
          label: displayName,
          description: serverName,
          icon: "tool",
          data: { serverName, toolCount: 0 },
          metadata: { type: "tool" },
        }
      }

      return {
        id: token,
        label: value,
        description: "MCP Server",
        icon: "tool",
        data: { serverName: value, toolCount: 0 },
        metadata: { type: "tool" },
      }
    } catch (error) {
      console.warn(`[ToolsProvider] Failed to deserialize token: ${token}`, error)
      return null
    }
  },

  isAvailable(context) {
    const toolsContext = context as { mcpServers?: MCPServerInfo[] }
    return Array.isArray(toolsContext.mcpServers) && toolsContext.mcpServers.some(s => s.status === "connected")
  },
})

export default toolsProvider
