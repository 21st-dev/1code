import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { z } from "zod"
import { getDatabase, modelUsage, projects, chats, subChats } from "../../db"
import { publicProcedure, router } from "../index"

// Date range schema for filtering
const dateRangeSchema = z.object({
  startDate: z.string().optional(), // ISO date string, e.g., "2024-01-01"
  endDate: z.string().optional(),
})

export const usageRouter = router({
  /**
   * Record a single usage entry (called internally by claude.ts)
   */
  record: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        projectId: z.string(),
        model: z.string(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        totalTokens: z.number(),
        costUsd: z.number().optional(),
        sessionId: z.string().optional(),
        messageUuid: z.string().optional(),
        mode: z.enum(["plan", "agent"]).optional(),
        durationMs: z.number().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      // Check for duplicate by messageUuid
      if (input.messageUuid) {
        const existing = db
          .select()
          .from(modelUsage)
          .where(eq(modelUsage.messageUuid, input.messageUuid))
          .get()

        if (existing) {
          console.log(`[Usage] Skipping duplicate record: ${input.messageUuid}`)
          return existing
        }
      }

      return db
        .insert(modelUsage)
        .values({
          subChatId: input.subChatId,
          chatId: input.chatId,
          projectId: input.projectId,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          totalTokens: input.totalTokens,
          costUsd: input.costUsd?.toFixed(6),
          sessionId: input.sessionId,
          messageUuid: input.messageUuid,
          mode: input.mode,
          durationMs: input.durationMs,
        })
        .returning()
        .get()
    }),

  /**
   * Get usage summary (for settings page quick view)
   */
  getSummary: publicProcedure.query(() => {
    const db = getDatabase()
    const now = new Date()

    // Today start
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    // Week start (Monday)
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    // Month start
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Today usage
    const todayUsage = db
      .select({
        totalInputTokens: sql<number>`coalesce(sum(${modelUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${modelUsage.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${modelUsage.totalTokens}), 0)`,
        totalCostUsd: sql<number>`coalesce(sum(cast(${modelUsage.costUsd} as real)), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(modelUsage)
      .where(gte(modelUsage.createdAt, todayStart))
      .get()

    // Week usage
    const weekUsage = db
      .select({
        totalInputTokens: sql<number>`coalesce(sum(${modelUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${modelUsage.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${modelUsage.totalTokens}), 0)`,
        totalCostUsd: sql<number>`coalesce(sum(cast(${modelUsage.costUsd} as real)), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(modelUsage)
      .where(gte(modelUsage.createdAt, weekStart))
      .get()

    // Month usage
    const monthUsage = db
      .select({
        totalInputTokens: sql<number>`coalesce(sum(${modelUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${modelUsage.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${modelUsage.totalTokens}), 0)`,
        totalCostUsd: sql<number>`coalesce(sum(cast(${modelUsage.costUsd} as real)), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(modelUsage)
      .where(gte(modelUsage.createdAt, monthStart))
      .get()

    // Total usage
    const totalUsage = db
      .select({
        totalInputTokens: sql<number>`coalesce(sum(${modelUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${modelUsage.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${modelUsage.totalTokens}), 0)`,
        totalCostUsd: sql<number>`coalesce(sum(cast(${modelUsage.costUsd} as real)), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(modelUsage)
      .get()

    return {
      today: todayUsage,
      week: weekUsage,
      month: monthUsage,
      total: totalUsage,
    }
  }),

  /**
   * Get daily activity for heatmap (last 365 days)
   * Returns array of { date, count, totalTokens } for contribution graph
   */
  getDailyActivity: publicProcedure.query(() => {
    const db = getDatabase()
    const now = new Date()
    const yearAgo = new Date(now)
    yearAgo.setFullYear(yearAgo.getFullYear() - 1)

    return db
      .select({
        date: sql<string>`date(${modelUsage.createdAt}, 'unixepoch')`.as("date"),
        count: sql<number>`count(*)`,
        totalTokens: sql<number>`sum(${modelUsage.totalTokens})`,
      })
      .from(modelUsage)
      .where(gte(modelUsage.createdAt, yearAgo))
      .groupBy(sql`date(${modelUsage.createdAt}, 'unixepoch')`)
      .orderBy(sql`date`)
      .all()
  }),

  /**
   * Get usage grouped by date
   */
  getByDate: publicProcedure.input(dateRangeSchema).query(({ input }) => {
    const db = getDatabase()

    const conditions = []
    if (input.startDate) {
      conditions.push(gte(modelUsage.createdAt, new Date(input.startDate)))
    }
    if (input.endDate) {
      const endDate = new Date(input.endDate)
      endDate.setDate(endDate.getDate() + 1)
      conditions.push(lte(modelUsage.createdAt, endDate))
    }

    const baseQuery = db
      .select({
        date: sql<string>`date(${modelUsage.createdAt}, 'unixepoch')`.as(
          "date",
        ),
        totalInputTokens: sql<number>`sum(${modelUsage.inputTokens})`,
        totalOutputTokens: sql<number>`sum(${modelUsage.outputTokens})`,
        totalTokens: sql<number>`sum(${modelUsage.totalTokens})`,
        totalCostUsd: sql<number>`sum(cast(${modelUsage.costUsd} as real))`,
        count: sql<number>`count(*)`,
      })
      .from(modelUsage)

    const query =
      conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery

    return query
      .groupBy(sql`date(${modelUsage.createdAt}, 'unixepoch')`)
      .orderBy(desc(sql`date`))
      .all()
  }),

  /**
   * Get usage grouped by model
   */
  getByModel: publicProcedure.input(dateRangeSchema).query(({ input }) => {
    const db = getDatabase()

    const conditions = []
    if (input.startDate) {
      conditions.push(gte(modelUsage.createdAt, new Date(input.startDate)))
    }
    if (input.endDate) {
      const endDate = new Date(input.endDate)
      endDate.setDate(endDate.getDate() + 1)
      conditions.push(lte(modelUsage.createdAt, endDate))
    }

    const baseQuery = db
      .select({
        model: modelUsage.model,
        totalInputTokens: sql<number>`sum(${modelUsage.inputTokens})`,
        totalOutputTokens: sql<number>`sum(${modelUsage.outputTokens})`,
        totalTokens: sql<number>`sum(${modelUsage.totalTokens})`,
        totalCostUsd: sql<number>`sum(cast(${modelUsage.costUsd} as real))`,
        count: sql<number>`count(*)`,
      })
      .from(modelUsage)

    const query =
      conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery

    return query
      .groupBy(modelUsage.model)
      .orderBy(desc(sql`sum(${modelUsage.totalTokens})`))
      .all()
  }),

  /**
   * Get usage grouped by project
   */
  getByProject: publicProcedure.input(dateRangeSchema).query(({ input }) => {
    const db = getDatabase()

    const conditions = []
    if (input.startDate) {
      conditions.push(gte(modelUsage.createdAt, new Date(input.startDate)))
    }
    if (input.endDate) {
      const endDate = new Date(input.endDate)
      endDate.setDate(endDate.getDate() + 1)
      conditions.push(lte(modelUsage.createdAt, endDate))
    }

    const baseQuery = db
      .select({
        projectId: modelUsage.projectId,
        projectName: projects.name,
        totalInputTokens: sql<number>`sum(${modelUsage.inputTokens})`,
        totalOutputTokens: sql<number>`sum(${modelUsage.outputTokens})`,
        totalTokens: sql<number>`sum(${modelUsage.totalTokens})`,
        totalCostUsd: sql<number>`sum(cast(${modelUsage.costUsd} as real))`,
        count: sql<number>`count(*)`,
      })
      .from(modelUsage)
      .leftJoin(projects, eq(modelUsage.projectId, projects.id))

    const query =
      conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery

    return query
      .groupBy(modelUsage.projectId)
      .orderBy(desc(sql`sum(${modelUsage.totalTokens})`))
      .all()
  }),

  /**
   * Get usage grouped by subchat
   */
  getBySubChat: publicProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        chatId: z.string().optional(),
        ...dateRangeSchema.shape,
      }),
    )
    .query(({ input }) => {
      const db = getDatabase()

      const conditions = []
      if (input.projectId) {
        conditions.push(eq(modelUsage.projectId, input.projectId))
      }
      if (input.chatId) {
        conditions.push(eq(modelUsage.chatId, input.chatId))
      }
      if (input.startDate) {
        conditions.push(gte(modelUsage.createdAt, new Date(input.startDate)))
      }
      if (input.endDate) {
        const endDate = new Date(input.endDate)
        endDate.setDate(endDate.getDate() + 1)
        conditions.push(lte(modelUsage.createdAt, endDate))
      }

      const baseQuery = db
        .select({
          subChatId: modelUsage.subChatId,
          subChatName: subChats.name,
          chatId: modelUsage.chatId,
          chatName: chats.name,
          projectName: projects.name,
          totalInputTokens: sql<number>`sum(${modelUsage.inputTokens})`,
          totalOutputTokens: sql<number>`sum(${modelUsage.outputTokens})`,
          totalTokens: sql<number>`sum(${modelUsage.totalTokens})`,
          totalCostUsd: sql<number>`sum(cast(${modelUsage.costUsd} as real))`,
          count: sql<number>`count(*)`,
        })
        .from(modelUsage)
        .leftJoin(subChats, eq(modelUsage.subChatId, subChats.id))
        .leftJoin(chats, eq(modelUsage.chatId, chats.id))
        .leftJoin(projects, eq(modelUsage.projectId, projects.id))

      const query =
        conditions.length > 0
          ? baseQuery.where(and(...conditions))
          : baseQuery

      return query
        .groupBy(modelUsage.subChatId)
        .orderBy(desc(sql`sum(${modelUsage.totalTokens})`))
        .all()
    }),

  /**
   * Get recent usage records (paginated)
   */
  getRecent: publicProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      }),
    )
    .query(({ input }) => {
      const db = getDatabase()

      return db
        .select({
          id: modelUsage.id,
          model: modelUsage.model,
          inputTokens: modelUsage.inputTokens,
          outputTokens: modelUsage.outputTokens,
          totalTokens: modelUsage.totalTokens,
          costUsd: modelUsage.costUsd,
          mode: modelUsage.mode,
          durationMs: modelUsage.durationMs,
          createdAt: modelUsage.createdAt,
          subChatName: subChats.name,
          chatName: chats.name,
          projectName: projects.name,
        })
        .from(modelUsage)
        .leftJoin(subChats, eq(modelUsage.subChatId, subChats.id))
        .leftJoin(chats, eq(modelUsage.chatId, chats.id))
        .leftJoin(projects, eq(modelUsage.projectId, projects.id))
        .orderBy(desc(modelUsage.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all()
    }),
})
