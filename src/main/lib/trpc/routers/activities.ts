import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, toolActivities } from "../../db"
import { desc, eq, lte } from "drizzle-orm"

const MAX_JSON_SIZE = 50000 // 50KB limit for input/output

/**
 * Truncate JSON string to max size with indicator
 */
function truncateJson(value: unknown): string | null {
  if (value === undefined || value === null) return null
  let json = typeof value === "string" ? value : JSON.stringify(value)
  if (json.length > MAX_JSON_SIZE) {
    json = json.substring(0, MAX_JSON_SIZE) + "\n... (truncated)"
  }
  return json
}

export const activitiesRouter = router({
  /**
   * Get recent activities (limit to 100 most recent)
   */
  getRecent: publicProcedure
    .input(z.object({ limit: z.number().optional().default(100) }))
    .query(({ input }) => {
      const db = getDatabase()
      return db
        .select()
        .from(toolActivities)
        .orderBy(desc(toolActivities.createdAt))
        .limit(input.limit)
        .all()
    }),

  /**
   * Add new activity (when tool starts)
   */
  create: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatName: z.string(),
        toolName: z.string(),
        summary: z.string(),
        state: z.enum(["running", "complete", "error"]),
        input: z.unknown().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const activity = db
        .insert(toolActivities)
        .values({
          subChatId: input.subChatId,
          chatName: input.chatName,
          toolName: input.toolName,
          summary: input.summary,
          state: input.state,
          input: truncateJson(input.input),
        })
        .returning()
        .get()
      return activity
    }),

  /**
   * Update activity state (when tool completes)
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        state: z.enum(["complete", "error"]),
        output: z.unknown().optional(),
        errorText: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const updated = db
        .update(toolActivities)
        .set({
          state: input.state,
          output: truncateJson(input.output),
          errorText: input.errorText,
        })
        .where(eq(toolActivities.id, input.id))
        .returning()
        .get()
      return updated
    }),

  /**
   * Clear all activities
   */
  clear: publicProcedure.mutation(() => {
    const db = getDatabase()
    db.delete(toolActivities).run()
    return { success: true }
  }),

  /**
   * Cleanup old activities (older than 30 days)
   */
  cleanup: publicProcedure.mutation(() => {
    const db = getDatabase()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = db
      .delete(toolActivities)
      .where(lte(toolActivities.createdAt, thirtyDaysAgo))
      .returning()
      .all()
    return { deleted: result.length }
  }),

  /**
   * Toggle pin status for an activity
   */
  togglePin: publicProcedure
    .input(z.object({ id: z.string(), isPinned: z.boolean() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const updated = db
        .update(toolActivities)
        .set({ isPinned: input.isPinned })
        .where(eq(toolActivities.id, input.id))
        .returning()
        .get()
      return updated
    }),
})
