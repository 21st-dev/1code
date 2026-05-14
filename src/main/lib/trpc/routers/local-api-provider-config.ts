import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import { getDatabase, localApiProviderConfigs } from "../../db"
import { publicProcedure, router } from "../index"

export const localApiProviderPurposeSchema = z.enum(["sub_chat_title"])
export type LocalApiProviderPurpose = z.infer<
  typeof localApiProviderPurposeSchema
>

export type LocalApiProviderRuntimeConfig = {
  purpose: LocalApiProviderPurpose
  model: string
  baseUrl: string
  token: string
}

type LocalApiProviderMetadata = {
  purpose: LocalApiProviderPurpose
  model: string
  baseUrl: string
  hasToken: boolean
  createdAt: string | null
  updatedAt: string | null
}

const ZERO_WIDTH_TOKEN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g
const HEADER_SAFE_TOKEN_REGEX = /^[\x21-\x7E]+$/

function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[LocalApiProviderConfig] Encryption not available, storing as base64")
    return Buffer.from(token).toString("base64")
  }

  return safeStorage.encryptString(token).toString("base64")
}

function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }

  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

function normalizeProviderToken(token: string): string {
  const normalized = token
    .trim()
    .replace(ZERO_WIDTH_TOKEN_CHARS_REGEX, "")

  if (!normalized) {
    throw new Error("Token is required")
  }

  if (!HEADER_SAFE_TOKEN_REGEX.test(normalized)) {
    throw new Error("Token contains whitespace or unsupported characters")
  }

  return normalized
}

function getStoredProviderRow(purpose: LocalApiProviderPurpose) {
  const db = getDatabase()
  return db
    .select()
    .from(localApiProviderConfigs)
    .where(eq(localApiProviderConfigs.id, purpose))
    .get()
}

function rowToMetadata(
  row: typeof localApiProviderConfigs.$inferSelect,
): LocalApiProviderMetadata {
  return {
    purpose: localApiProviderPurposeSchema.parse(row.id),
    model: row.model,
    baseUrl: row.baseUrl,
    hasToken: Boolean(row.encryptedToken),
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }
}

export function getActiveLocalApiProviderConfig(
  purpose: LocalApiProviderPurpose,
): LocalApiProviderRuntimeConfig | undefined {
  const row = getStoredProviderRow(purpose)
  if (!row?.encryptedToken || !row.model || !row.baseUrl) {
    return undefined
  }

  return {
    purpose,
    model: row.model,
    baseUrl: row.baseUrl,
    token: normalizeProviderToken(decryptToken(row.encryptedToken)),
  }
}

const providerPurposeInputSchema = z.object({
  purpose: localApiProviderPurposeSchema,
})

const saveInputSchema = providerPurposeInputSchema.extend({
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  token: z.string().optional(),
})

export const localApiProviderConfigRouter = router({
  get: publicProcedure.input(providerPurposeInputSchema).query(({ input }) => {
    const row = getStoredProviderRow(input.purpose)

    return {
      config: row ? rowToMetadata(row) : null,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    }
  }),

  save: publicProcedure.input(saveInputSchema).mutation(({ input }) => {
    const model = input.model.trim()
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const token = input.token ? normalizeProviderToken(input.token) : undefined
    const existing = getStoredProviderRow(input.purpose)

    if (!model || !baseUrl) {
      throw new Error("Model and base URL are required")
    }

    if (!token && !existing?.encryptedToken) {
      throw new Error("Token is required for a new provider config")
    }

    const encryptedToken = token
      ? encryptToken(token)
      : existing?.encryptedToken

    if (!encryptedToken) {
      throw new Error("Token is required for a new provider config")
    }

    const db = getDatabase()
    db.insert(localApiProviderConfigs)
      .values({
        id: input.purpose,
        model,
        baseUrl,
        encryptedToken,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: localApiProviderConfigs.id,
        set: {
          model,
          baseUrl,
          encryptedToken,
          updatedAt: new Date(),
        },
      })
      .run()

    const row = getStoredProviderRow(input.purpose)
    return {
      config: row ? rowToMetadata(row) : null,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    }
  }),

  clear: publicProcedure
    .input(providerPurposeInputSchema)
    .mutation(({ input }) => {
      const db = getDatabase()
      db.delete(localApiProviderConfigs)
        .where(eq(localApiProviderConfigs.id, input.purpose))
        .run()

      return { success: true }
    }),
})
