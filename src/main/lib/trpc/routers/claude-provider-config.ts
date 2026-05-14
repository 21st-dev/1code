import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import { claudeProviderConfig, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

const CONFIG_ID = "default"

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
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[ClaudeProviderConfig] Encryption not available, storing as base64")
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

  return {
    model: row.model,
    baseUrl: row.baseUrl,
    authMode: claudeProviderAuthModeSchema.catch("auth_token").parse(row.authMode),
    token: decryptToken(row.encryptedToken),
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
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    }
  }),

  save: publicProcedure.input(saveInputSchema).mutation(({ input }) => {
    const model = input.model.trim()
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const token = input.token?.trim()
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
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
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
            encryptedToken: encryptToken(input.token.trim()),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run()
      }

      return {
        migrated: !existing,
        reason: existing ? "secure_config_exists" : null,
        encryptionAvailable: safeStorage.isEncryptionAvailable(),
      }
    }),
})
