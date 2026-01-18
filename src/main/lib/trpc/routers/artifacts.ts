import { z } from "zod"
import { eq } from "drizzle-orm"
import { router, publicProcedure } from "../index"
import { getDatabase, subChats } from "../../db"

/**
 * Artifact type representing a tool execution
 */
interface Artifact {
  id: string
  type: string
  toolName: string
  input: Record<string, unknown>
  result?: unknown
  state?: string
  // Extracted key fields for display
  filePath?: string
  command?: string
  pattern?: string
}

/**
 * Artifacts router - query tool execution history from chat messages
 * Extracts tool parts from existing messages (no DB schema changes needed)
 */
export const artifactsRouter = router({
  /**
   * Get tool history for a sub-chat
   */
  list: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        toolName: z.string().optional(),
      }),
    )
    .query(({ input }) => {
      const db = getDatabase()
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get()

      if (!subChat) return { artifacts: [] }

      const messages = JSON.parse(subChat.messages || "[]")
      const artifacts: Artifact[] = []

      for (const msg of messages) {
        if (msg.role !== "assistant") continue
        for (const part of msg.parts || []) {
          if (!part.type?.startsWith("tool-")) continue
          if (input.toolName && part.toolName !== input.toolName) continue

          artifacts.push({
            id: part.toolCallId || `${msg.id}-${artifacts.length}`,
            type: part.type.replace("tool-", ""),
            toolName: part.toolName || "unknown",
            input: part.input || {},
            result: part.result,
            state: part.state,
            // Extract key fields for display
            filePath: part.input?.file_path,
            command: part.input?.command?.substring(0, 100),
            pattern: part.input?.pattern,
          })
        }
      }

      return { artifacts }
    }),

  /**
   * Search across all sub-chats for matching artifacts
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string(),
        chatId: z.string().optional(),
      }),
    )
    .query(({ input }) => {
      const db = getDatabase()
      const allSubChats = input.chatId
        ? db
            .select()
            .from(subChats)
            .where(eq(subChats.chatId, input.chatId))
            .all()
        : db.select().from(subChats).all()

      const results: Array<{
        subChatId: string
        chatId: string
        artifact: {
          id: string
          toolName: string
          filePath?: string
          command?: string
        }
      }> = []

      const queryLower = input.query.toLowerCase()

      for (const subChat of allSubChats) {
        const messages = JSON.parse(subChat.messages || "[]")
        for (const msg of messages) {
          if (msg.role !== "assistant") continue
          for (const part of msg.parts || []) {
            if (!part.type?.startsWith("tool-")) continue

            const searchable = JSON.stringify(part.input).toLowerCase()
            if (searchable.includes(queryLower)) {
              results.push({
                subChatId: subChat.id,
                chatId: subChat.chatId,
                artifact: {
                  id: part.toolCallId || `${msg.id}-${results.length}`,
                  toolName: part.toolName || "unknown",
                  filePath: part.input?.file_path,
                  command: part.input?.command?.substring(0, 50),
                },
              })
            }
          }
        }
      }

      // Limit results to prevent performance issues
      return { results: results.slice(0, 50) }
    }),

  /**
   * Get summary of tool usage for a sub-chat
   */
  summary: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get()

      if (!subChat) return { summary: {} }

      const messages = JSON.parse(subChat.messages || "[]")
      const summary: Record<string, number> = {}

      for (const msg of messages) {
        if (msg.role !== "assistant") continue
        for (const part of msg.parts || []) {
          if (!part.type?.startsWith("tool-")) continue
          const toolName = part.toolName || "unknown"
          summary[toolName] = (summary[toolName] || 0) + 1
        }
      }

      return { summary }
    }),
})
