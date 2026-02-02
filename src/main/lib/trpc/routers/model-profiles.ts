import { eq } from "drizzle-orm"
import { z } from "zod"
import { publicProcedure, router } from "../index"
import {
  modelProfiles,
  modelProfileSettings,
  getDatabase,
  type NewModelProfile,
} from "../../db"

/**
 * Model Profiles Router
 * Provides CRUD operations for model profiles stored in the database.
 * This allows syncing profiles between desktop and web app.
 */

// Schema for creating/updating a model profile
const modelProfileInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // CustomClaudeConfig structure
  config: z.object({
    model: z.string().optional(),
    token: z.string().optional(), // Token can be empty for proxy configs
    baseUrl: z.string().url("Base URL must be a valid URL"),
    defaultOpusModel: z.string().optional(),
    defaultSonnetModel: z.string().optional(),
    defaultHaikuModel: z.string().optional(),
    subagentModel: z.string().optional(),
  }),
  // ModelMapping array
  models: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
    modelId: z.string(),
    supportsThinking: z.boolean(),
  })).optional(),
  isOffline: z.boolean().optional().default(false),
})

export const modelProfilesRouter = router({
  /**
   * Get all model profiles
   */
  list: publicProcedure.query(async () => {
    const db = getDatabase()
    const profiles = await db.select().from(modelProfiles).orderBy(modelProfiles.createdAt)

    // Parse JSON fields
    return profiles.map((profile) => ({
      ...profile,
      config: JSON.parse(profile.config),
      models: JSON.parse(profile.models),
    }))
  }),

  /**
   * Get a single model profile by ID
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const profile = await db.select().from(modelProfiles).where(eq(modelProfiles.id, input.id)).get()

      if (!profile) {
        throw new Error("Model profile not found")
      }

      return {
        ...profile,
        config: JSON.parse(profile.config),
        models: JSON.parse(profile.models),
      }
    }),

  /**
   * Create a new model profile
   */
  create: publicProcedure
    .input(modelProfileInputSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase()

      const newProfile: NewModelProfile = {
        name: input.name,
        config: JSON.stringify(input.config),
        models: JSON.stringify(input.models || []),
        isOffline: input.isOffline || false,
      }

      const result = await db.insert(modelProfiles).values(newProfile).returning()
      const profile = result[0]

      return {
        ...profile,
        config: JSON.parse(profile.config),
        models: JSON.parse(profile.models),
      }
    }),

  /**
   * Update an existing model profile
   */
  update: publicProcedure
    .input(z.object({
      id: z.string(),
      ...modelProfileInputSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Get existing profile
      const existing = await db.select().from(modelProfiles).where(eq(modelProfiles.id, input.id)).get()
      if (!existing) {
        throw new Error("Model profile not found")
      }

      // Build update object
      const update: Partial<NewModelProfile> = {}
      if (input.name !== undefined) update.name = input.name
      if (input.config !== undefined) update.config = JSON.stringify(input.config)
      if (input.models !== undefined) update.models = JSON.stringify(input.models)
      if (input.isOffline !== undefined) update.isOffline = input.isOffline

      const result = await db.update(modelProfiles)
        .set(update)
        .where(eq(modelProfiles.id, input.id))
        .returning()

      const profile = result[0]
      return {
        ...profile,
        config: JSON.parse(profile.config),
        models: JSON.parse(profile.models),
      }
    }),

  /**
   * Delete a model profile
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      await db.delete(modelProfiles).where(eq(modelProfiles.id, input.id))
      return { success: true }
    }),

  /**
   * Get or create model profile settings (last used profile, etc.)
   */
  getSettings: publicProcedure.query(async () => {
    const db = getDatabase()
    let settings = await db.select().from(modelProfileSettings).where(eq(modelProfileSettings.id, "singleton")).get()

    // Create settings if they don't exist
    if (!settings) {
      const result = await db.insert(modelProfileSettings).values({}).returning()
      settings = result[0]
    }

    return settings
  }),

  /**
   * Update model profile settings (e.g., last used profile ID)
   */
  updateSettings: publicProcedure
    .input(z.object({
      lastUsedProfileId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Update settings
      const result = await db.update(modelProfileSettings)
        .set(input)
        .where(eq(modelProfileSettings.id, "singleton"))
        .returning()

      return result[0]
    }),
})
