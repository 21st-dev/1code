import { eq } from "drizzle-orm"
import { z } from "zod"
import { claudeProviderConfig, getDatabase } from "../../db"
import {
  decryptStringFromStorage,
  encryptStringForStorage,
  isSecureStorageAvailable,
} from "../../secure-storage"
import { publicProcedure, router } from "../index"

const CONFIG_ID = "default"
const ZERO_WIDTH_TOKEN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g
const HEADER_SAFE_TOKEN_REGEX = /^[\x21-\x7E]+$/

export const claudeProviderAuthModeSchema = z.enum(["api_key", "auth_token"])
export type ClaudeProviderAuthMode = z.infer<typeof claudeProviderAuthModeSchema>

export type ClaudeProviderRuntimeConfig = {
  model: string
  baseUrl: string
  token: string
  authMode: ClaudeProviderAuthMode
}

type ClaudeProviderMetadata = {
  id: string
  model: string
  baseUrl: string
  authMode: ClaudeProviderAuthMode
  hasToken: boolean
  createdAt: string | null
  updatedAt: string | null
}

function encryptToken(token: string): string {
  return encryptStringForStorage(token)
}

function decryptToken(encrypted: string): string | null {
  return decryptStringFromStorage(encrypted)
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

function rowToMetadata(
  row: typeof claudeProviderConfig.$inferSelect,
): ClaudeProviderMetadata {
  return {
    id: row.id,
    model: row.model,
    baseUrl: row.baseUrl,
    authMode: claudeProviderAuthModeSchema.catch("auth_token").parse(row.authMode),
    hasToken: Boolean(row.encryptedToken),
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }
}

function getStoredProviderRow() {
  const db = getDatabase()
  return db
    .select()
    .from(claudeProviderConfig)
    .where(eq(claudeProviderConfig.id, CONFIG_ID))
    .get()
}

export function getActiveClaudeProviderConfig():
  | ClaudeProviderRuntimeConfig
  | undefined {
  const row = getStoredProviderRow()
  if (!row?.encryptedToken || !row.model || !row.baseUrl) {
    return undefined
  }

  const token = decryptToken(row.encryptedToken)
  if (!token) return undefined

  return {
    model: row.model,
    baseUrl: row.baseUrl,
    authMode: claudeProviderAuthModeSchema.catch("auth_token").parse(row.authMode),
    token: normalizeProviderToken(token),
  }
}

export function buildClaudeProviderEnv(
  config: ClaudeProviderRuntimeConfig,
): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: config.baseUrl,
  }

  if (config.authMode === "api_key") {
    env.ANTHROPIC_API_KEY = config.token
    env.ANTHROPIC_AUTH_TOKEN = ""
  } else {
    env.ANTHROPIC_AUTH_TOKEN = config.token
    env.ANTHROPIC_API_KEY = ""
  }

  return env
}

const saveInputSchema = z.object({
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  authMode: claudeProviderAuthModeSchema,
  token: z.string().optional(),
})

export const claudeProviderConfigRouter = router({
  get: publicProcedure.query(() => {
    const row = getStoredProviderRow()

    return {
      config: row ? rowToMetadata(row) : null,
      encryptionAvailable: Boolean(row?.encryptedToken) && isSecureStorageAvailable(),
    }
  }),

  save: publicProcedure.input(saveInputSchema).mutation(({ input }) => {
    const model = input.model.trim()
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const token = input.token ? normalizeProviderToken(input.token) : undefined
    const existing = getStoredProviderRow()

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
    db.insert(claudeProviderConfig)
      .values({
        id: CONFIG_ID,
        model,
        baseUrl,
        authMode: input.authMode,
        encryptedToken,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: claudeProviderConfig.id,
        set: {
          model,
          baseUrl,
          authMode: input.authMode,
          encryptedToken,
          updatedAt: new Date(),
        },
      })
      .run()

    const row = getStoredProviderRow()
    return {
      config: row ? rowToMetadata(row) : null,
      encryptionAvailable: isSecureStorageAvailable(),
    }
  }),

  clear: publicProcedure.mutation(() => {
    const db = getDatabase()
    db.delete(claudeProviderConfig)
      .where(eq(claudeProviderConfig.id, CONFIG_ID))
      .run()

    return { success: true }
  }),

  importLegacy: publicProcedure
    .input(saveInputSchema.extend({ token: z.string().min(1) }))
    .mutation(({ input }) => {
      const existing = getStoredProviderRow()
      if (!existing) {
        const db = getDatabase()
        db.insert(claudeProviderConfig)
          .values({
            id: CONFIG_ID,
            model: input.model.trim(),
            baseUrl: normalizeBaseUrl(input.baseUrl),
            authMode: input.authMode,
            encryptedToken: encryptToken(normalizeProviderToken(input.token)),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run()
      }

      return {
        migrated: !existing,
        reason: existing ? "secure_config_exists" : null,
        encryptionAvailable: isSecureStorageAvailable(),
      }
    }),
})
