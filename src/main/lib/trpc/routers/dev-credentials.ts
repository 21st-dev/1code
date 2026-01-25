import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import { devCredentials, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

/**
 * Encrypt password using Electron's safeStorage
 */
function encryptPassword(password: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[DevCredentials] Encryption not available, storing as base64")
    return Buffer.from(password).toString("base64")
  }
  return safeStorage.encryptString(password).toString("base64")
}

/**
 * Decrypt password using Electron's safeStorage
 */
function decryptPassword(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Dev Credentials router
 * Manages encrypted credentials for auto-filling login forms in preview
 */
export const devCredentialsRouter = router({
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
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
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
