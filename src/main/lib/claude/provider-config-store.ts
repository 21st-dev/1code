import { eq } from "drizzle-orm"
import { z } from "zod"
import { claudeProviderConfig, getDatabase } from "../db"
import { isSecureStorageAvailable } from "../secure-storage"
import {
  decryptProviderToken,
  encryptProviderToken,
  normalizeProviderBaseUrl,
  normalizeProviderToken,
} from "../provider-token"
import type {
  ClaudeProviderAuthMode,
  ClaudeProviderRuntimeConfig,
} from "./provider-runtime-config"

const CONFIG_ID = "default"

export const claudeProviderAuthModeSchema = z.enum(["api_key", "auth_token"])
export type { ClaudeProviderAuthMode, ClaudeProviderRuntimeConfig }

export type ClaudeProviderMetadata = {
  id: string
  model: string
  baseUrl: string
  authMode: ClaudeProviderAuthMode
  hasToken: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type ClaudeProviderConfigResponse = {
  config: ClaudeProviderMetadata | null
  encryptionAvailable: boolean
}

export type SaveClaudeProviderConfigInput = {
  model: string
  baseUrl: string
  authMode: ClaudeProviderAuthMode
  token?: string
}

export type ImportLegacyClaudeProviderConfigResult = {
  migrated: boolean
  reason: "secure_config_exists" | null
  encryptionAvailable: boolean
}

function rowToMetadata(
  row: typeof claudeProviderConfig.$inferSelect,
): ClaudeProviderMetadata {
  return {
    id: row.id,
    model: row.model,
    baseUrl: row.baseUrl,
    authMode: claudeProviderAuthModeSchema
      .catch("auth_token")
      .parse(row.authMode),
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

export function getClaudeProviderConfigMetadata(): ClaudeProviderConfigResponse {
  const row = getStoredProviderRow()
  return {
    config: row ? rowToMetadata(row) : null,
    encryptionAvailable:
      Boolean(row?.encryptedToken) && isSecureStorageAvailable(),
  }
}

export function getActiveClaudeProviderConfig():
  | ClaudeProviderRuntimeConfig
  | undefined {
  const row = getStoredProviderRow()
  if (!row?.encryptedToken || !row.model || !row.baseUrl) {
    return undefined
  }

  const token = decryptProviderToken(row.encryptedToken)
  if (!token) return undefined

  return {
    model: row.model,
    baseUrl: row.baseUrl,
    authMode: claudeProviderAuthModeSchema
      .catch("auth_token")
      .parse(row.authMode),
    token: normalizeProviderToken(token),
  }
}

export function saveClaudeProviderConfig(
  input: SaveClaudeProviderConfigInput,
): ClaudeProviderConfigResponse {
  const model = input.model.trim()
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
  const token = input.token ? normalizeProviderToken(input.token) : undefined
  const existing = getStoredProviderRow()

  if (!model || !baseUrl) {
    throw new Error("Model and base URL are required")
  }

  if (!token && !existing?.encryptedToken) {
    throw new Error("Token is required for a new provider config")
  }

  const encryptedToken = token ? encryptProviderToken(token) : existing?.encryptedToken

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
}

export function clearClaudeProviderConfig(): { success: true } {
  const db = getDatabase()
  db.delete(claudeProviderConfig)
    .where(eq(claudeProviderConfig.id, CONFIG_ID))
    .run()

  return { success: true }
}

export function importLegacyClaudeProviderConfig(
  input: SaveClaudeProviderConfigInput & { token: string },
): ImportLegacyClaudeProviderConfigResult {
  const existing = getStoredProviderRow()
  if (!existing) {
    const db = getDatabase()
    db.insert(claudeProviderConfig)
      .values({
        id: CONFIG_ID,
        model: input.model.trim(),
        baseUrl: normalizeProviderBaseUrl(input.baseUrl),
        authMode: input.authMode,
        encryptedToken: encryptProviderToken(normalizeProviderToken(input.token)),
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
}
