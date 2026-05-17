/**
 * Agents Mention Provider
 *
 * Wraps the appAgents endpoint as a mention provider.
 * Provides App Agent search with descriptions and tool guidance.
 */

import { trpcClient } from "../../../lib/trpc"
import {
  createMentionProvider,
  type MentionItem,
  type MentionSearchContext,
  type MentionSearchResult,
  MENTION_PREFIXES,
  sortByRelevance,
} from "../types"

/**
 * Data payload for agent mentions
 */
export interface AgentData {
  name: string
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  source: "app"
  path: string
}

/**
 * Agents provider
 */
export const agentsProvider = createMentionProvider<AgentData>({
  id: "agents",
  name: "Agents",
  category: {
    label: "Agents",
    priority: 70,
  },
  trigger: {
    char: "@",
    position: "standalone",
    allowSpaces: true,
  },
  priority: 70,

  async search(context: MentionSearchContext): Promise<MentionSearchResult<AgentData>> {
    const startTime = performance.now()

    // Check for abort
    if (context.signal.aborted) {
      return { items: [], hasMore: false, timing: 0 }
    }

    try {
      // Use tRPC to list App Agents
      const agents = await trpcClient.appAgents.list.query()

      // Map to MentionItem format
      let items: MentionItem<AgentData>[] = agents.map((agent) => ({
        id: `${MENTION_PREFIXES.AGENT}${agent.name}`,
        label: agent.name,
        description: agent.description || "",
        icon: "agent",
        data: {
          name: agent.name,
          description: agent.description,
          prompt: agent.prompt,
          tools: agent.tools,
          disallowedTools: agent.disallowedTools,
          source: agent.source,
          path: agent.path,
        },
        priority: 0,
        keywords: agent.tools, // Also search by tool names
        metadata: {
          type: "agent" as const,
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
        totalCount: agents.length,
        timing,
      }
    } catch (error) {
      console.error("[AgentsProvider] Search error:", error)
      return {
        items: [],
        hasMore: false,
        warning: "Failed to load agents",
        timing: performance.now() - startTime,
      }
    }
  },

  serialize(item: MentionItem<AgentData>): string {
    return `@[${item.id}]`
  },

  deserialize(token: string): MentionItem<AgentData> | null {
    try {
      // Check if this token belongs to us
      if (!token.startsWith(MENTION_PREFIXES.AGENT)) {
        return null
      }

      // Parse: agent:name
      const name = token.slice(MENTION_PREFIXES.AGENT.length)

      if (!name) {
        return null
      }

      return {
        id: token,
        label: name,
        description: "",
        icon: "agent",
        data: {
          name,
          description: "",
          prompt: "",
          source: "app",
          path: "App Agents",
        },
        metadata: {
          type: "agent",
        },
      }
    } catch (error) {
      console.warn(`[AgentsProvider] Failed to deserialize token: ${token}`, error)
      return null
    }
  },

  // Agents are always available
  isAvailable() {
    return true
  },
})

export default agentsProvider
