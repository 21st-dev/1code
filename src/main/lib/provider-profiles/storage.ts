import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import {
  agentProviderDefaults,
  agentProviderProfiles,
  getDatabase,
} from "../db"
import { createId } from "../db/utils"
import {
  providerProfileAuthModes,
  providerProfileDefaultPurposes,
  providerProfileProtocols,
  providerProfileTargets,
  type ProviderProfileAuthMode,
  type ProviderProfileCapabilities,
  type ProviderProfileDefaultPurpose,
  type ProviderProfileMetadata,
  type ProviderProfileProtocol,
  type ProviderProfileTarget,
  type ProviderProfileTestStatus,
} from "../../../shared/provider-profile-types"
import { getActiveClaudeProviderConfig } from "../trpc/routers/claude-provider-config"
import {
  getActiveLocalApiProviderConfig,
  type LocalApiProviderPurpose,
} from "../trpc/routers/local-api-provider-config"

const ZERO_WIDTH_TOKEN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g
const HEADER_SAFE_TOKEN_REGEX = /^[\x21-\x7E]+$/
const LEGACY_CLAUDE_PROFILE_ID = "legacy-claude-provider"

export const providerProfileProtocolSchema = z.enum(providerProfileProtocols)
export const providerProfileAuthModeSchema = z.enum(providerProfileAuthModes)
export const providerProfileTargetSchema = z.enum(providerProfileTargets)
export const providerProfileDefaultPurposeSchema = z.enum(
  providerProfileDefaultPurposes,
)

export const providerProfileCapabilitiesSchema = z.object({
  claude: z.boolean().optional(),
  codex: z.boolean().optional(),
  helpers: z.boolean().optional(),
  local: z.boolean().optional(),
  streaming: z.boolean().optional(),
  tools: z.boolean().optional(),
  vision: z.boolean().optional(),
})

export const providerProfileTestStatusSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string(),
  message: z.string(),
  capabilities: providerProfileCapabilitiesSchema.optional(),
})

export type ProviderProfileRuntimeConfig = {
  id: string
  name: string
  presetId: string | null
  protocol: ProviderProfileProtocol
  baseUrl: string
  defaultModel: string
  authMode: ProviderProfileAuthMode
  token: string | null
  headers: Record<string, string>
  targetRuntimes: ProviderProfileTarget[]
  capabilities: ProviderProfileCapabilities
}

function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[ProviderProfiles] Encryption not available, storing as base64")
    return Buffer.from(token).toString("base64")
  }
  return safeStorage.encryptString(token).toString("base64")
}

function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
}

export function normalizeProviderToken(token: string): string {
  const normalized = token.trim().replace(ZERO_WIDTH_TOKEN_CHARS_REGEX, "")
  if (!normalized) throw new Error("Token is required")
  if (!HEADER_SAFE_TOKEN_REGEX.test(normalized)) {
    throw new Error("Token contains whitespace or unsupported characters")
  }
  return normalized
}

export function normalizeProviderBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = rawKey.trim()
    const value = String(rawValue).trim()
    if (!key || !value) continue
    if (/^(authorization|x-api-key|api-key|anthropic-api-key)$/i.test(key)) {
      continue
    }
    result[key] = value
  }
  return result
}

function parseTestStatus(value: string | null | undefined): ProviderProfileTestStatus | null {
  if (!value) return null
  const parsed = providerProfileTestStatusSchema.safeParse(
    parseJson(value, null),
  )
  return parsed.success ? parsed.data : null
}

function rowToMetadata(
  row: typeof agentProviderProfiles.$inferSelect,
): ProviderProfileMetadata {
  return {
    id: row.id,
    name: row.name,
    presetId: row.presetId,
    protocol: providerProfileProtocolSchema.parse(row.protocol),
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    authMode: providerProfileAuthModeSchema.parse(row.authMode),
    hasToken: Boolean(row.encryptedToken),
    headers: parseJson(row.headersJson, {}),
    targetRuntimes: parseJson(row.targetRuntimesJson, []).filter((target) =>
      providerProfileTargetSchema.safeParse(target).success,
    ),
    capabilities: providerProfileCapabilitiesSchema
      .catch({})
      .parse(parseJson(row.capabilitiesJson, {})),
    lastTestStatus: parseTestStatus(row.lastTestStatusJson),
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }
}

export function listProviderProfiles(): ProviderProfileMetadata[] {
  ensureLegacyProviderProfilesMigrated()
  const db = getDatabase()
  return db
    .select()
    .from(agentProviderProfiles)
    .all()
    .map(rowToMetadata)
}

export function getProviderProfileMetadata(
  id: string,
): ProviderProfileMetadata | null {
  ensureLegacyProviderProfilesMigrated()
  const db = getDatabase()
  const row = db
    .select()
    .from(agentProviderProfiles)
    .where(eq(agentProviderProfiles.id, id))
    .get()
  return row ? rowToMetadata(row) : null
}

export function getProviderProfileRuntimeConfig(
  id: string,
): ProviderProfileRuntimeConfig | null {
  ensureLegacyProviderProfilesMigrated()
  const db = getDatabase()
  const row = db
    .select()
    .from(agentProviderProfiles)
    .where(eq(agentProviderProfiles.id, id))
    .get()
  if (!row) return null

  const authMode = providerProfileAuthModeSchema.parse(row.authMode)
  const encryptedToken = row.encryptedToken
  const token = encryptedToken ? normalizeProviderToken(decryptToken(encryptedToken)) : null
  if (authMode !== "none" && !token) {
    throw new Error("Provider profile token is missing")
  }

  return {
    id: row.id,
    name: row.name,
    presetId: row.presetId,
    protocol: providerProfileProtocolSchema.parse(row.protocol),
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    authMode,
    token,
    headers: parseJson(row.headersJson, {}),
    targetRuntimes: parseJson(row.targetRuntimesJson, []).filter((target) =>
      providerProfileTargetSchema.safeParse(target).success,
    ),
    capabilities: providerProfileCapabilitiesSchema
      .catch({})
      .parse(parseJson(row.capabilitiesJson, {})),
  }
}

export function getLegacyClaudeProviderProfileId(): string | null {
  ensureLegacyProviderProfilesMigrated()
  return getProviderProfileMetadata(LEGACY_CLAUDE_PROFILE_ID)?.id ?? null
}

export function saveProviderProfile(input: {
  id?: string
  name: string
  presetId?: string | null
  protocol: ProviderProfileProtocol
  baseUrl: string
  defaultModel: string
  authMode: ProviderProfileAuthMode
  token?: string
  headers?: Record<string, string>
  targetRuntimes: ProviderProfileTarget[]
  capabilities?: ProviderProfileCapabilities
  lastTestStatus?: ProviderProfileTestStatus | null
}): ProviderProfileMetadata {
  const db = getDatabase()
  const id = input.id?.trim() || createId()
  const existing = id
    ? db
        .select()
        .from(agentProviderProfiles)
        .where(eq(agentProviderProfiles.id, id))
        .get()
    : undefined
  const authMode = providerProfileAuthModeSchema.parse(input.authMode)
  const token =
    input.token && input.token.trim() ? normalizeProviderToken(input.token) : undefined

  if (authMode !== "none" && !token && !existing?.encryptedToken) {
    throw new Error("Token is required for this provider")
  }

  const encryptedToken = token
    ? encryptToken(token)
    : authMode === "none"
      ? null
      : existing?.encryptedToken

  const values = {
    id,
    name: input.name.trim(),
    presetId: input.presetId || null,
    protocol: providerProfileProtocolSchema.parse(input.protocol),
    baseUrl: normalizeProviderBaseUrl(input.baseUrl),
    defaultModel: input.defaultModel.trim(),
    authMode,
    encryptedToken,
    headersJson: JSON.stringify(sanitizeHeaders(input.headers || {})),
    targetRuntimesJson: JSON.stringify(
      input.targetRuntimes.filter((target) =>
        providerProfileTargetSchema.safeParse(target).success,
      ),
    ),
    capabilitiesJson: JSON.stringify(input.capabilities || {}),
    lastTestStatusJson:
      input.lastTestStatus === undefined
        ? existing?.lastTestStatusJson ?? null
        : input.lastTestStatus
          ? JSON.stringify(input.lastTestStatus)
          : null,
    createdAt: existing?.createdAt ?? new Date(),
    updatedAt: new Date(),
  }

  if (existing) {
    db.update(agentProviderProfiles)
      .set(values)
      .where(eq(agentProviderProfiles.id, id))
      .run()
  } else {
    db.insert(agentProviderProfiles)
      .values(values)
      .run()
  }

  const saved = getProviderProfileMetadata(id)
  if (!saved) throw new Error("Failed to read saved provider profile")
  return saved
}

export function deleteProviderProfile(id: string): void {
  const db = getDatabase()
  db.update(agentProviderDefaults)
    .set({
      profileId: null,
      modelOverride: null,
      updatedAt: new Date(),
    })
    .where(eq(agentProviderDefaults.profileId, id))
    .run()
  db.delete(agentProviderProfiles)
    .where(eq(agentProviderProfiles.id, id))
    .run()
}

export function setProviderDefault(input: {
  purpose: ProviderProfileDefaultPurpose
  profileId: string | null
  modelOverride?: string | null
}): void {
  const db = getDatabase()
  const existing = db
    .select()
    .from(agentProviderDefaults)
    .where(eq(agentProviderDefaults.purpose, input.purpose))
    .get()

  const values = {
    purpose: providerProfileDefaultPurposeSchema.parse(input.purpose),
    profileId: input.profileId,
    modelOverride: input.modelOverride?.trim() || null,
    updatedAt: new Date(),
  }

  if (existing) {
    db.update(agentProviderDefaults)
      .set(values)
      .where(eq(agentProviderDefaults.purpose, input.purpose))
      .run()
  } else {
    db.insert(agentProviderDefaults).values(values).run()
  }
}

export function getProviderDefaults(): Record<
  ProviderProfileDefaultPurpose,
  { profileId: string | null; modelOverride: string | null }
> {
  const db = getDatabase()
  const rows = db.select().from(agentProviderDefaults).all()
  const defaults = Object.fromEntries(
    providerProfileDefaultPurposes.map((purpose) => [
      purpose,
      { profileId: null, modelOverride: null },
    ]),
  ) as Record<
    ProviderProfileDefaultPurpose,
    { profileId: string | null; modelOverride: string | null }
  >

  for (const row of rows) {
    const parsed = providerProfileDefaultPurposeSchema.safeParse(row.purpose)
    if (!parsed.success) continue
    defaults[parsed.data] = {
      profileId: row.profileId,
      modelOverride: row.modelOverride,
    }
  }
  return defaults
}

export function getProviderDefaultRuntimeConfig(
  purpose: ProviderProfileDefaultPurpose,
): (ProviderProfileRuntimeConfig & { modelOverride: string | null }) | null {
  const defaults = getProviderDefaults()
  const binding = defaults[purpose]
  if (!binding.profileId) return null
  const profile = getProviderProfileRuntimeConfig(binding.profileId)
  return profile ? { ...profile, modelOverride: binding.modelOverride } : null
}

function insertLegacyProfile(input: {
  id: string
  name: string
  presetId: string
  protocol: ProviderProfileProtocol
  baseUrl: string
  model: string
  authMode: ProviderProfileAuthMode
  token: string
  targets: ProviderProfileTarget[]
}): void {
  const db = getDatabase()
  const existing = db
    .select()
    .from(agentProviderProfiles)
    .where(eq(agentProviderProfiles.id, input.id))
    .get()
  if (existing) return

  db.insert(agentProviderProfiles)
    .values({
      id: input.id,
      name: input.name,
      presetId: input.presetId,
      protocol: input.protocol,
      baseUrl: normalizeProviderBaseUrl(input.baseUrl),
      defaultModel: input.model,
      authMode: input.authMode,
      encryptedToken: encryptToken(input.token),
      headersJson: "{}",
      targetRuntimesJson: JSON.stringify(input.targets),
      capabilitiesJson: JSON.stringify({
        claude: input.targets.includes("claude"),
        helpers: input.targets.includes("helpers"),
        streaming: true,
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()
}

let legacyMigrationAttempted = false

export function ensureLegacyProviderProfilesMigrated(): void {
  if (legacyMigrationAttempted) return
  legacyMigrationAttempted = true

  try {
    const claude = getActiveClaudeProviderConfig()
    if (claude) {
      insertLegacyProfile({
        id: LEGACY_CLAUDE_PROFILE_ID,
        name: "Legacy Claude-compatible Provider",
        presetId: "legacy-claude-provider",
        protocol: "anthropic",
        baseUrl: claude.baseUrl,
        model: claude.model,
        authMode: claude.authMode === "api_key" ? "x-api-key" : "bearer",
        token: claude.token,
        targets: ["claude"],
      })
    }

    for (const purpose of ["sub_chat_title", "commit_message"] as LocalApiProviderPurpose[]) {
      const helper = getActiveLocalApiProviderConfig(purpose)
      if (!helper) continue
      insertLegacyProfile({
        id: `legacy-${purpose}`,
        name:
          purpose === "sub_chat_title"
            ? "Legacy Sub-chat Title Provider"
            : "Legacy Commit Message Provider",
        presetId: "legacy-helper-provider",
        protocol: "openai-chat",
        baseUrl: helper.baseUrl,
        model: helper.model,
        authMode: "bearer",
        token: helper.token,
        targets: ["helpers"],
      })
      setProviderDefault({
        purpose,
        profileId: `legacy-${purpose}`,
      })
    }
  } catch (error) {
    console.warn("[ProviderProfiles] Legacy migration skipped:", error)
  }
}
