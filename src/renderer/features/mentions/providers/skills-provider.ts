/**
 * Skills Mention Provider
 *
 * Wraps the existing tRPC skills.listEnabled endpoint as a mention provider.
 * Provides skill search with descriptions and source indicators.
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
 * Data payload for skill mentions
 */
export interface SkillData {
  name: string
  description: string
  source: "user" | "project"
  path: string
}

/**
 * Skills provider
 */
export const skillsProvider = createMentionProvider<SkillData>({
  id: "skills",
  name: "Skills",
  category: {
    label: "Skills",
    priority: 80,
  },
  trigger: {
    char: "@",
    position: "standalone",
    allowSpaces: true,
  },
  priority: 80,

  async search(context: MentionSearchContext): Promise<MentionSearchResult<SkillData>> {
    const startTime = performance.now()

    // Check for abort
    if (context.signal.aborted) {
      return { items: [], hasMore: false, timing: 0 }
    }

    try {
      // Use tRPC to list skills
      const skills = await trpcClient.skills.listEnabled.query({
        cwd: context.projectPath,
      })

      // Map to MentionItem format
      let items: MentionItem<SkillData>[] = skills.map((skill) => ({
        id: `${MENTION_PREFIXES.SKILL}${skill.name}`,
        label: skill.name,
        description: skill.description || skill.path,
        icon: "skill",
        data: {
          name: skill.name,
          description: skill.description,
          source: skill.source,
          path: skill.path,
        },
        // Project skills have higher priority
        priority: skill.source === "project" ? 10 : 0,
        metadata: {
          type: "skill" as const,
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
        totalCount: skills.length,
        timing,
      }
    } catch (error) {
      console.error("[SkillsProvider] Search error:", error)
      return {
        items: [],
        hasMore: false,
        warning: "Failed to load skills",
        timing: performance.now() - startTime,
      }
    }
  },

  serialize(item: MentionItem<SkillData>): string {
    return `@[${item.id}]`
  },

  deserialize(token: string): MentionItem<SkillData> | null {
    try {
      // Check if this token belongs to us
      if (!token.startsWith(MENTION_PREFIXES.SKILL)) {
        return null
      }

      // Parse: skill:name
      const name = token.slice(MENTION_PREFIXES.SKILL.length)

      if (!name) {
        return null
      }

      return {
        id: token,
        label: name,
        description: "", // Will be resolved later if needed
        icon: "skill",
        data: {
          name,
          description: "",
          source: "user", // Default, will be resolved
          path: "",
        },
        metadata: {
          type: "skill",
        },
      }
    } catch (error) {
      console.warn(`[SkillsProvider] Failed to deserialize token: ${token}`, error)
      return null
    }
  },

  // Skills are always available
  isAvailable() {
    return true
  },
})

export default skillsProvider
