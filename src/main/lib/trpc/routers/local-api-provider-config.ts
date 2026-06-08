import { eq } from "drizzle-orm"
import { z } from "zod"
import { getDatabase, localApiProviderConfigs } from "../../db"
import { isSecureStorageAvailable } from "../../secure-storage"
import {
  decryptProviderToken,
  encryptProviderToken,
  normalizeProviderBaseUrl,
  normalizeProviderToken,
} from "../../provider-token"
import { publicProcedure, router } from "../index"

export const localApiProviderPurposeSchema = z.enum([
  "sub_chat_title",
  "commit_message",
  "voice_transcription",
])
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


export function getLocalApiProviderTokenRequirement(input: {
  baseUrl: string
  token?: string | null
  existingEncryptedToken?: string | null
  existingBaseUrl?: string | null
}): "none" | "missing" | "destination_changed" {
  if (input.token?.trim()) return "none"

  const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
  const destinationChanged = Boolean(
    input.existingEncryptedToken && input.existingBaseUrl !== baseUrl,
  )

  if (destinationChanged) return "destination_changed"
  if (!input.existingEncryptedToken) return "missing"
  return "none"
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

  const token = decryptProviderToken(row.encryptedToken)
  if (!token) return undefined

  return {
    purpose,
    model: row.model,
    baseUrl: row.baseUrl,
    token: normalizeProviderToken(token),
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
      encryptionAvailable: Boolean(row?.encryptedToken) && isSecureStorageAvailable(),
    }
  }),

  save: publicProcedure.input(saveInputSchema).mutation(({ input }) => {
    const model = input.model.trim()
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const token = input.token ? normalizeProviderToken(input.token) : undefined
    const existing = getStoredProviderRow(input.purpose)

    if (!model || !baseUrl) {
      throw new Error("Model and base URL are required")
    }

    const tokenRequirement = getLocalApiProviderTokenRequirement({
      baseUrl,
      token,
      existingEncryptedToken: existing?.encryptedToken,
      existingBaseUrl: existing?.baseUrl,
    })

    if (tokenRequirement !== "none") {
      throw new Error(
        tokenRequirement === "destination_changed"
          ? "Token is required when changing provider endpoint"
          : "Token is required for a new provider config",
      )
    }

    const encryptedToken = token
      ? encryptProviderToken(token)
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
      encryptionAvailable: isSecureStorageAvailable(),
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
