import { eq } from "drizzle-orm"
import { z } from "zod"
import {
  type ProviderProfileAuthMode,
  type ProviderProfileCapabilities,
  type ProviderProfileDefaultPurpose,
  type ProviderProfileMetadata,
  type ProviderProfileProtocol,
  type ProviderProfileTarget,
  type ProviderProfileTestStatus,
  providerDiagnosticCategories,
  providerDiagnosticCheckIds,
  providerDiagnosticStatuses,
  providerProfileAuthModes,
  providerProfileDefaultPurposes,
  providerProfileProtocols,
  providerProfileTargets,
} from "../../../shared/provider-profile-types"
import { getRuntimeFeatureSettingsSnapshot } from "../agent-runtime/runtime-feature-settings"
import { getActiveClaudeProviderConfig } from "../claude/provider-config-store"
import {
  agentProviderDefaults,
  agentProviderProfiles,
  getDatabase,
} from "../db"
import { createId } from "../db/utils"
import {
  decryptProviderToken,
  encryptProviderToken,
  normalizeProviderBaseUrl,
  normalizeProviderToken,
} from "../provider-token"
import { getActiveLocalApiProviderConfig } from "../trpc/routers/local-api-provider-config"

// Re-exported for existing consumers (e.g. provider-profiles/gateway.ts).
export { normalizeProviderBaseUrl, normalizeProviderToken }

const LEGACY_CLAUDE_PROFILE_ID = "legacy-claude-provider"
const SAFE_METADATA_HEADER_NAMES = new Set([
  "anthropic-beta",
  "anthropic-version",
  "http-referer",
  "openai-organization",
  "openai-project",
  "referer",
  "user-agent",
  "x-title",
])
const SECRET_HEADER_NAME_REGEX =
  /(^|[-_])(authorization|api[-_]?key|auth|bearer|credential|key|password|secret|token)([-_]|$)/i
const SECRET_HEADER_VALUE_REGEX =
  /(sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._~+/=-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token)=\S+)/i

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
  kun: z.boolean().optional(),
  local: z.boolean().optional(),
  streaming: z.boolean().optional(),
  tools: z.boolean().optional(),
  vision: z.boolean().optional(),
})

const providerDiagnosticCheckSchema = z.object({
  id: z.enum(providerDiagnosticCheckIds),
  status: z.enum(providerDiagnosticStatuses),
  message: z.string(),
  category: z.enum(providerDiagnosticCategories).optional(),
})

export const providerProfileTestStatusSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string(),
  message: z.string(),
  capabilities: providerProfileCapabilitiesSchema.optional(),
  diagnosticVersion: z.literal(1).optional(),
  category: z.enum(providerDiagnosticCategories).optional(),
  checks: z.array(providerDiagnosticCheckSchema).optional(),
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

export type SaveProviderProfileOptions = {
  kunRuntimeEnabled?: boolean
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function sanitizeHeaders(
  headers: Record<string, string>,
  options: { strict: boolean },
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = rawKey.trim()
    const value = String(rawValue).trim()
    if (!key || !value) continue

    const normalizedKey = key.toLowerCase()
    const allowed = SAFE_METADATA_HEADER_NAMES.has(normalizedKey)
    const unsafe =
      !allowed ||
      SECRET_HEADER_NAME_REGEX.test(key) ||
      SECRET_HEADER_VALUE_REGEX.test(value)

    if (unsafe) {
      if (options.strict) {
        throw new Error(
          `Provider profile header "${key}" is not allowed. Store credentials in the profile auth mode instead.`,
        )
      }
      continue
    }

    result[key] = value
  }
  return result
}

export function headersForRenderer(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(headers || {}).map((key) => [key, "<redacted>"]),
  )
}

export function providerHeadersJsonForSave(
  headers: Record<string, string> | undefined,
  existingHeadersJson?: string | null,
): string {
  if (headers === undefined) {
    return JSON.stringify(
      sanitizeHeaders(parseJson(existingHeadersJson, {}), {
        strict: false,
      }),
    )
  }
  return JSON.stringify(sanitizeHeaders(headers, { strict: true }))
}

function parseTestStatus(
  value: string | null | undefined,
): ProviderProfileTestStatus | null {
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
    headers: headersForRenderer(parseJson(row.headersJson, {})),
    targetRuntimes: parseJson(row.targetRuntimesJson, []).filter(
      (target) => providerProfileTargetSchema.safeParse(target).success,
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
  return db.select().from(agentProviderProfiles).all().map(rowToMetadata)
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
  const decryptedToken = encryptedToken
    ? decryptProviderToken(encryptedToken)
    : null
  const token = decryptedToken ? normalizeProviderToken(decryptedToken) : null
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
    targetRuntimes: parseJson(row.targetRuntimesJson, []).filter(
      (target) => providerProfileTargetSchema.safeParse(target).success,
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

export function getProviderProfileTokenRequirement(input: {
  authMode: ProviderProfileAuthMode
  protocol: ProviderProfileProtocol
  baseUrl: string
  token?: string | null
  existingEncryptedToken?: string | null
  existingBaseUrl?: string | null
  existingProtocol?: string | null
  existingAuthMode?: string | null
}): "none" | "missing" | "destination_changed" {
  const authMode = providerProfileAuthModeSchema.parse(input.authMode)
  if (authMode === "none") return "none"
  if (input.token?.trim()) return "none"

  const protocol = providerProfileProtocolSchema.parse(input.protocol)
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
  const destinationChanged = Boolean(
    input.existingEncryptedToken &&
      (input.existingBaseUrl !== baseUrl ||
        input.existingProtocol !== protocol ||
        input.existingAuthMode !== authMode),
  )

  if (destinationChanged) return "destination_changed"
  if (!input.existingEncryptedToken) return "missing"
  return "none"
}

function resolveKunRuntimeEnabledForSave(
  options: SaveProviderProfileOptions,
): boolean {
  if (typeof options.kunRuntimeEnabled === "boolean") {
    return options.kunRuntimeEnabled
  }

  try {
    return getRuntimeFeatureSettingsSnapshot({
      env: process.env,
    }).resolved.kunRuntimeEnabled
  } catch {
    return true
  }
}

export function normalizeProviderProfileTargetsForKunRuntimeGate(input: {
  targetRuntimes: ProviderProfileTarget[]
  capabilities?: ProviderProfileCapabilities
  existingTargetRuntimes?: ProviderProfileTarget[]
  kunRuntimeEnabled: boolean
}): {
  targetRuntimes: ProviderProfileTarget[]
  capabilities?: ProviderProfileCapabilities
} {
  if (input.kunRuntimeEnabled) {
    return {
      targetRuntimes: input.targetRuntimes,
      capabilities: input.capabilities,
    }
  }

  const preserveExistingKun =
    input.existingTargetRuntimes?.includes("kun") ?? false
  const targetRuntimes: ProviderProfileTarget[] = input.targetRuntimes.filter(
    (target) => target !== "kun",
  )
  if (preserveExistingKun) targetRuntimes.push("kun")
  return {
    targetRuntimes,
    capabilities: {
      ...(input.capabilities ?? {}),
      kun: preserveExistingKun,
    },
  }
}

export function saveProviderProfile(
  input: {
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
  },
  options: SaveProviderProfileOptions = {},
): ProviderProfileMetadata {
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
  const protocol = providerProfileProtocolSchema.parse(input.protocol)
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
  const token = input.token?.trim()
    ? normalizeProviderToken(input.token)
    : undefined
  const tokenRequirement = getProviderProfileTokenRequirement({
    authMode,
    protocol,
    baseUrl,
    token,
    existingEncryptedToken: existing?.encryptedToken,
    existingBaseUrl: existing?.baseUrl,
    existingProtocol: existing?.protocol,
    existingAuthMode: existing?.authMode,
  })

  if (tokenRequirement !== "none") {
    throw new Error(
      tokenRequirement === "destination_changed"
        ? "Token is required when changing provider endpoint, protocol, or auth mode"
        : "Token is required for this provider",
    )
  }

  const encryptedToken = token
    ? encryptProviderToken(token)
    : authMode === "none"
      ? null
      : existing?.encryptedToken
  const normalizedTargets = normalizeProviderProfileTargetsForKunRuntimeGate({
    targetRuntimes: input.targetRuntimes,
    capabilities: input.capabilities,
    existingTargetRuntimes: existing
      ? rowToMetadata(existing).targetRuntimes
      : undefined,
    kunRuntimeEnabled: resolveKunRuntimeEnabledForSave(options),
  })
  if (normalizedTargets.targetRuntimes.length === 0) {
    throw new Error("Kun runtime is disabled. Select another provider target.")
  }

  const values = {
    id,
    name: input.name.trim(),
    presetId: input.presetId || null,
    protocol,
    baseUrl,
    defaultModel: input.defaultModel.trim(),
    authMode,
    encryptedToken,
    headersJson: providerHeadersJsonForSave(
      input.headers,
      existing?.headersJson,
    ),
    targetRuntimesJson: JSON.stringify(
      normalizedTargets.targetRuntimes.filter(
        (target) => providerProfileTargetSchema.safeParse(target).success,
      ),
    ),
    capabilitiesJson: JSON.stringify(normalizedTargets.capabilities || {}),
    lastTestStatusJson:
      input.lastTestStatus === undefined
        ? (existing?.lastTestStatusJson ?? null)
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
    db.insert(agentProviderProfiles).values(values).run()
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
  db.delete(agentProviderProfiles).where(eq(agentProviderProfiles.id, id)).run()
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
      encryptedToken: encryptProviderToken(input.token),
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

    for (const purpose of ["sub_chat_title", "commit_message"] as const) {
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
