import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, modelProfiles } from "../../db"
import { eq, desc } from "drizzle-orm"

export const modelProfilesRouter = router({
  /**
   * List all model profiles ordered by creation date
   */
  list: publicProcedure.query(() => {
    const db = getDatabase()
    return db
      .select()
      .from(modelProfiles)
      .orderBy(desc(modelProfiles.createdAt))
      .all()
  }),

  /**
   * Get a single model profile by ID
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      return db
        .select()
        .from(modelProfiles)
        .where(eq(modelProfiles.id, input.id))
        .get()
    }),

  /**
   * Create a new model profile
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
        config: z.record(z.string()), // { model, token, baseUrl }
        models: z.array(z.string()).min(1, "At least one model is required"),
        isOffline: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      return db
        .insert(modelProfiles)
        .values({
          name: input.name,
          description: input.description,
          config: JSON.stringify(input.config),
          models: JSON.stringify(input.models),
          isOffline: input.isOffline,
        })
        .returning()
        .get()
    }),

  /**
   * Update an existing model profile
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        config: z.record(z.string()).optional(),
        models: z.array(z.string()).optional(),
        isOffline: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const { id, ...updateData } = input

      const dbUpdate: Record<string, unknown> = {
        updatedAt: new Date(),
      }

      if (updateData.name !== undefined) dbUpdate.name = updateData.name
      if (updateData.description !== undefined) dbUpdate.description = updateData.description
      if (updateData.config !== undefined) dbUpdate.config = JSON.stringify(updateData.config)
      if (updateData.models !== undefined) dbUpdate.models = JSON.stringify(updateData.models)
      if (updateData.isOffline !== undefined) dbUpdate.isOffline = updateData.isOffline

      return db
        .update(modelProfiles)
        .set(dbUpdate)
        .where(eq(modelProfiles.id, id))
        .returning()
        .get()
    }),

  /**
   * Delete a model profile
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .delete(modelProfiles)
        .where(eq(modelProfiles.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Bulk upsert profiles (for syncing localStorage cache to DB)
   */
  bulkUpsert: publicProcedure
    .input(
      z.array(
        z.object({
          id: z.string().optional(), // If provided, will update; if not, will create
          name: z.string().min(1),
          description: z.string().optional(),
          config: z.record(z.string()),
          models: z.array(z.string()),
          isOffline: z.boolean().default(false),
          createdAt: z.number().optional(),
          updatedAt: z.number().optional(),
        }),
      ),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const now = Date.now()

      for (const profile of input) {
        if (profile.id) {
          // Update existing
          await db
            .update(modelProfiles)
            .set({
              name: profile.name,
              description: profile.description,
              config: JSON.stringify(profile.config),
              models: JSON.stringify(profile.models),
              isOffline: profile.isOffline,
              createdAt: profile.createdAt ? new Date(profile.createdAt) : new Date(),
              updatedAt: new Date(now),
            })
            .where(eq(modelProfiles.id, profile.id))
            .run()
        } else {
          // Insert new
          await db
            .insert(modelProfiles)
            .values({
              name: profile.name,
              description: profile.description,
              config: JSON.stringify(profile.config),
              models: JSON.stringify(profile.models),
              isOffline: profile.isOffline,
              createdAt: profile.createdAt ? new Date(profile.createdAt) : new Date(),
              updatedAt: new Date(now),
            })
            .run()
        }
      }

      // Return all profiles after upsert
      return db.select().from(modelProfiles).orderBy(desc(modelProfiles.createdAt)).all()
    }),

  /**
   * Sync localStorage profiles to DB (import)
   */
  importFromLocalStorage: publicProcedure
    .input(
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
          config: z.record(z.string()),
          models: z.array(z.string()),
          isOffline: z.boolean().optional(),
          createdAt: z.number().optional(),
          updatedAt: z.number().optional(),
        }),
      ),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const now = Date.now()

      for (const profile of input) {
        // Check if exists
        const existing = await db
          .select()
          .from(modelProfiles)
          .where(eq(modelProfiles.id, profile.id))
          .get()

        if (existing) {
          // Update
          await db
            .update(modelProfiles)
            .set({
              name: profile.name,
              description: profile.description,
              config: JSON.stringify(profile.config),
              models: JSON.stringify(profile.models),
              isOffline: profile.isOffline,
              createdAt: profile.createdAt ? new Date(profile.createdAt) : new Date(),
              updatedAt: new Date(now),
            })
            .where(eq(modelProfiles.id, profile.id))
            .run()
        } else {
          // Insert
          await db
            .insert(modelProfiles)
            .values({
              id: profile.id,
              name: profile.name,
              description: profile.description,
              config: JSON.stringify(profile.config),
              models: JSON.stringify(profile.models),
              isOffline: profile.isOffline,
              createdAt: profile.createdAt ? new Date(profile.createdAt) : new Date(),
              updatedAt: new Date(now),
            })
            .run()
        }
      }

      return { imported: input.length }
    }),
})
