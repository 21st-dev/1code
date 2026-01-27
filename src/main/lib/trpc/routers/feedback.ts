import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, feedback } from "../../db"
import { eq, desc } from "drizzle-orm"

export const feedbackRouter = router({
  create: publicProcedure
    .input(
      z.object({
        type: z.enum([
          "bug",
          "feature",
          "enhancement",
          "idea",
          "usability",
          "other",
        ]),
        priority: z.enum(["low", "medium", "high", "critical"]),
        description: z.string().min(10).max(2000),
        screenshots: z.array(z.string()).default([]),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .insert(feedback)
        .values({
          ...input,
          screenshots: JSON.stringify(input.screenshots),
        })
        .returning()
        .get()
    }),

  list: publicProcedure
    .input(
      z
        .object({
          resolved: z.boolean().optional(),
          type: z
            .enum([
              "bug",
              "feature",
              "enhancement",
              "idea",
              "usability",
              "other",
            ])
            .optional(),
        })
        .optional(),
    )
    .query(({ input }) => {
      const db = getDatabase()
      let query = db.select().from(feedback)

      if (input?.resolved !== undefined) {
        query = query.where(eq(feedback.resolved, input.resolved))
      }
      if (input?.type) {
        query = query.where(eq(feedback.type, input.type))
      }

      return query.orderBy(desc(feedback.createdAt)).all()
    }),

  resolve: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(feedback)
        .set({ resolved: true, updatedAt: new Date() })
        .where(eq(feedback.id, input.id))
        .returning()
        .get()
    }),
})
