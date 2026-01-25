import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { devCredentials, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

/**
 * Check if secure storage is available
 */
function ensureEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Secure storage is not available. Credentials cannot be stored securely on this system.",
    })
  }
}

/**
 * Encrypt password using Electron's safeStorage
 * Throws if encryption is not available - we never store passwords insecurely
 */
function encryptPassword(password: string): string {
  ensureEncryptionAvailable()
  return safeStorage.encryptString(password).toString("base64")
}

/**
 * Decrypt password using Electron's safeStorage
 * Throws if encryption is not available
 */
function decryptPassword(encrypted: string): string {
  ensureEncryptionAvailable()
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Dev Credentials router
 * Manages encrypted credentials for auto-filling login forms in preview
 */
export const devCredentialsRouter = router({
  /**
   * Check if secure storage is available on this system
   * UI should check this before offering credential storage
   */
  isAvailable: publicProcedure.query(() => {
    return {
      available: safeStorage.isEncryptionAvailable(),
    }
  }),

  /**
   * List all credentials (without passwords)
   */
  list: publicProcedure.query(() => {
    const db = getDatabase()
    const creds = db.select().from(devCredentials).all()

    return creds.map((cred) => ({
      id: cred.id,
      label: cred.label,
      email: cred.email,
      domain: cred.domain,
      createdAt: cred.createdAt?.toISOString() ?? null,
      updatedAt: cred.updatedAt?.toISOString() ?? null,
    }))
  }),

  /**
   * Get a credential with decrypted password (for filling forms)
   * Uses mutation instead of query since it's called imperatively and returns sensitive data
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const cred = db
        .select()
        .from(devCredentials)
        .where(eq(devCredentials.id, input.id))
        .get()

      if (!cred) {
        return null
      }

      try {
        const password = decryptPassword(cred.encryptedPassword)
        return {
          id: cred.id,
          label: cred.label,
          email: cred.email,
          password,
          domain: cred.domain,
        }
      } catch (error) {
        console.error("[DevCredentials] Decrypt error:", error)
        return null
      }
    }),

  /**
   * Create a new credential
   */
  create: publicProcedure
    .input(
      z.object({
        label: z.string().min(1),
        email: z.string().min(1),
        password: z.string().min(1),
        domain: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const encryptedPassword = encryptPassword(input.password)

      const result = db
        .insert(devCredentials)
        .values({
          label: input.label,
          email: input.email,
          encryptedPassword,
          domain: input.domain ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .get()

      return {
        id: result.id,
        label: result.label,
        email: result.email,
        domain: result.domain,
      }
    }),

  /**
   * Update a credential
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().min(1).optional(),
        email: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
        domain: z.string().optional().nullable(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      }

      if (input.label !== undefined) updates.label = input.label
      if (input.email !== undefined) updates.email = input.email
      if (input.password !== undefined) {
        updates.encryptedPassword = encryptPassword(input.password)
      }
      if (input.domain !== undefined) updates.domain = input.domain

      db.update(devCredentials)
        .set(updates)
        .where(eq(devCredentials.id, input.id))
        .run()

      return { success: true }
    }),

  /**
   * Delete a credential
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      db.delete(devCredentials).where(eq(devCredentials.id, input.id)).run()
      return { success: true }
    }),
})
