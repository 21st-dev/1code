import { z } from "zod"
import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { getDatabase, aiProviders } from "../../db"
import { publicProcedure, router } from "../index"

/**
 * Encrypt token using Electron's safeStorage
 */
function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[Providers] Encryption not available, storing as base64")
    return Buffer.from(token).toString("base64")
  }
  return safeStorage.encryptString(token).toString("base64")
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Providers router for managing AI provider profiles
 */
export const providersRouter = router({
  /**
   * List all providers (without sensitive data)
   */
  list: publicProcedure.query(() => {
    const db = getDatabase()
    const providers = db.select().from(aiProviders).all()

    // Return without sensitive data (oauthToken, apiKey)
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      model: p.model,
      providerType: p.providerType,
      baseUrl: p.baseUrl,
      isActive: p.isActive,
      createdAt: p.createdAt?.toISOString() ?? null,
      updatedAt: p.updatedAt?.toISOString() ?? null,
      userId: p.userId,
    }))
  }),

  /**
   * Get active provider (with decrypted credentials for internal use)
   */
  getActive: publicProcedure.query(() => {
    const db = getDatabase()
    const provider = db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.isActive, true))
      .get()

    if (!provider) {
      return null
    }

    // Return with decrypted credentials (for internal use)
    return {
      id: provider.id,
      name: provider.name,
      model: provider.model,
      providerType: provider.providerType,
      oauthToken: provider.oauthToken ? decryptToken(provider.oauthToken) : null,
      apiKey: provider.apiKey ? decryptToken(provider.apiKey) : null,
      baseUrl: provider.baseUrl,
      isActive: provider.isActive,
    }
  }),

  /**
   * Create API Key provider
   */
  createAPIKeyProvider: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        model: z.string().min(1, "Model is required"),
        apiKey: z.string().min(1, "API key is required"),
        baseUrl: z.string().url("Must be a valid URL"),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const encryptedKey = encryptToken(input.apiKey)

      const provider = db
        .insert(aiProviders)
        .values({
          name: input.name,
          model: input.model,
          providerType: "api_key",
          apiKey: encryptedKey,
          baseUrl: input.baseUrl,
          isActive: false,
        })
        .returning()
        .get()

      console.log("[Providers] Created API key provider:", provider.name)
      return provider
    }),

  /**
   * Create OAuth provider
   */
  createOAuthProvider: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        model: z.string().min(1, "Model is required"),
        oauthToken: z.string().min(1, "OAuth token is required"),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const encryptedToken = encryptToken(input.oauthToken)

      const provider = db
        .insert(aiProviders)
        .values({
          name: input.name,
          model: input.model,
          providerType: "oauth",
          oauthToken: encryptedToken,
          isActive: false,
        })
        .returning()
        .get()

      console.log("[Providers] Created OAuth provider:", provider.name)
      return provider
    }),

  /**
   * Set active provider (deactivates all others)
   */
  setActive: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      // Deactivate all providers
      db.update(aiProviders).set({ isActive: false, updatedAt: new Date() }).run()

      // Activate selected provider
      const provider = db
        .update(aiProviders)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(aiProviders.id, input.id))
        .returning()
        .get()

      if (!provider) {
        throw new Error("Provider not found")
      }

      console.log("[Providers] Set active provider:", provider.name)
      return provider
    }),

  /**
   * Delete provider (cannot delete active)
   */
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      const provider = db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.id, input.id))
        .get()

      if (!provider) {
        throw new Error("Provider not found")
      }

      // Prevent deleting active provider
      if (provider.isActive) {
        throw new Error("Cannot delete active provider. Switch to another provider first.")
      }

      db.delete(aiProviders).where(eq(aiProviders.id, input.id)).run()

      console.log("[Providers] Deleted provider:", provider.name)
      return { success: true }
    }),
})
