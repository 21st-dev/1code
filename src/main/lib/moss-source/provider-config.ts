import * as crypto from "node:crypto"
import * as fs from "fs/promises"
import { createRequire } from "node:module"
import { AGENT_ENGINE_IDS, type AgentEngineId } from "../agent-runtime/types"
import { ensureMossSource } from "./bootstrap"
import { getMossSourceLayout } from "./layout"

const require = createRequire(import.meta.url)
const yaml = require("js-yaml") as {
  load(source: string): unknown
  dump(value: unknown, options?: Record<string, unknown>): string
}

export interface MossProviderCredentialPolicy {
  singleUserConfiguration?: boolean
  allowCustomBaseUrl?: boolean
  allowCustomApiKey?: boolean
  shareAcrossEngines?: boolean
}

export interface MossProviderEngineConfig {
  model?: string
  baseUrl?: string
  baseUrlEnv?: string
  apiKey?: string
  apiKeyEnv?: string
  authMethod?: string
  env?: Record<string, string>
}

export interface MossProviderDefinition extends MossProviderEngineConfig {
  id: string
  label?: string
  mode?: string
  runtime?: string
  models?: Record<string, string>
  engines?: Partial<Record<AgentEngineId, MossProviderEngineConfig>>
}

export interface MossProviderConfig {
  version: number
  defaultProvider?: string
  credentialPolicy?: MossProviderCredentialPolicy
  providers: Record<string, MossProviderDefinition>
}

export interface MossProviderReadResult {
  status: "found" | "missing" | "parse-error"
  sourcePath: string
  config?: MossProviderConfig
  error?: string
}

export interface MossProviderReadOptions {
  createIfMissing?: boolean
}

export interface MossProviderSecretResolver {
  getSecret(providerId: string): Promise<{
    apiKey?: string
  }>
}

export type MossProviderValueSource = "inline" | "env" | "stored"

export interface MossProviderSummary {
  status: MossProviderReadResult["status"]
  sourcePath: string
  defaultProvider?: string
  credentialPolicy?: MossProviderCredentialPolicy
  providers: Array<{
    id: string
    label?: string
    mode?: string
    runtime?: string
    engines: AgentEngineId[]
    hasInlineApiKey: boolean
    hasStoredApiKey?: boolean
    apiKeyEnv?: string
    baseUrl?: string
    baseUrlEnv?: string
  }>
  error?: string
}

export interface ResolvedMossProvider {
  status: "resolved" | "missing" | "unconfigured" | "parse-error"
  sourcePath: string
  providerId?: string
  label?: string
  mode?: string
  runtime?: string
  model?: string
  baseUrl?: string
  baseUrlSource?: MossProviderValueSource
  baseUrlEnv?: string
  apiKey?: string
  apiKeySource?: MossProviderValueSource
  apiKeyEnv?: string
  hasStoredApiKey?: boolean
  authMethod?: string
  env: Record<string, string>
  warnings: string[]
  reason?: string
  error?: string
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const result: Record<string, string> = {}
  for (const [key, entryValue] of Object.entries(record)) {
    if (typeof entryValue === "string") {
      result[key] = entryValue
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function mergeStringRecord(
  ...records: Array<Record<string, string> | undefined>
): Record<string, string> {
  return Object.assign({}, ...records.filter(Boolean))
}

function normalizeCredentialPolicy(
  value: unknown,
): MossProviderCredentialPolicy | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  return {
    singleUserConfiguration: asBoolean(record.singleUserConfiguration),
    allowCustomBaseUrl: asBoolean(record.allowCustomBaseUrl),
    allowCustomApiKey: asBoolean(record.allowCustomApiKey),
    shareAcrossEngines: asBoolean(record.shareAcrossEngines),
  }
}

function normalizeEngineConfig(
  value: unknown,
): MossProviderEngineConfig | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  return {
    model: asString(record.model),
    baseUrl: asString(record.baseUrl),
    baseUrlEnv: asString(record.baseUrlEnv),
    apiKey: asString(record.apiKey),
    apiKeyEnv: asString(record.apiKeyEnv),
    authMethod: asString(record.authMethod),
    env: asStringRecord(record.env),
  }
}

function normalizeEngineConfigs(
  value: unknown,
): Partial<Record<AgentEngineId, MossProviderEngineConfig>> | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const engines: Partial<Record<AgentEngineId, MossProviderEngineConfig>> = {}
  for (const engineId of AGENT_ENGINE_IDS) {
    const config = normalizeEngineConfig(record[engineId])
    if (config) engines[engineId] = config
  }

  return Object.keys(engines).length > 0 ? engines : undefined
}

function normalizeProvider(
  id: string,
  value: unknown,
): MossProviderDefinition | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  return {
    id,
    label: asString(record.label),
    mode: asString(record.mode),
    runtime: asString(record.runtime),
    model: asString(record.model),
    baseUrl: asString(record.baseUrl),
    baseUrlEnv: asString(record.baseUrlEnv),
    apiKey: asString(record.apiKey),
    apiKeyEnv: asString(record.apiKeyEnv),
    authMethod: asString(record.authMethod),
    env: asStringRecord(record.env),
    models: asStringRecord(record.models),
    engines: normalizeEngineConfigs(record.engines),
  }
}

function normalizeProviderConfig(parsed: unknown): MossProviderConfig {
  const record = asRecord(parsed)
  if (!record) {
    throw new Error("providers.yaml must be a YAML object.")
  }

  const providersRecord = asRecord(record.providers)
  if (!providersRecord) {
    throw new Error("providers.yaml must contain a providers object.")
  }

  const providers: Record<string, MossProviderDefinition> = {}
  for (const [id, providerValue] of Object.entries(providersRecord)) {
    const provider = normalizeProvider(id, providerValue)
    if (provider) providers[id] = provider
  }

  return {
    version:
      typeof record.version === "number" && Number.isFinite(record.version)
        ? record.version
        : 1,
    defaultProvider:
      asString(record.defaultProvider) || asString(record.default),
    credentialPolicy: normalizeCredentialPolicy(record.credentialPolicy),
    providers,
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readMossProviderConfig(
  projectPath: string,
  options: MossProviderReadOptions = {},
): Promise<MossProviderReadResult> {
  const sourcePath = getMossSourceLayout(projectPath).providersConfig
  if (options.createIfMissing && !(await fileExists(sourcePath))) {
    await ensureMossSource({ projectPath })
  }

  if (!(await fileExists(sourcePath))) {
    return { status: "missing", sourcePath }
  }

  try {
    const raw = await fs.readFile(sourcePath, "utf-8")
    const parsed = yaml.load(raw)
    return {
      status: "found",
      sourcePath,
      config: normalizeProviderConfig(parsed),
    }
  } catch (error) {
    return {
      status: "parse-error",
      sourcePath,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function writeMossProviderConfig(
  projectPath: string,
  config: MossProviderConfig,
): Promise<MossProviderReadResult> {
  await ensureMossSource({ projectPath })
  const sourcePath = getMossSourceLayout(projectPath).providersConfig
  const yamlText = yaml.dump(config, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  })
  await fs.writeFile(sourcePath, yamlText, "utf-8")
  return readMossProviderConfig(projectPath)
}

function providerSupportsEngine(
  provider: MossProviderDefinition,
  engineId: AgentEngineId,
): boolean {
  if (provider.engines?.[engineId]) return true
  if (provider.runtime === "any") return true
  if (provider.runtime === engineId) return true
  if (provider.runtime === "claude" && engineId === "claude-code") return true
  if (provider.runtime === "openai" && engineId === "codex") return true

  // Moss managed quota is a product-level provider. It can front any engine
  // once the service-side router is wired, even if the current local runtime
  // still needs an engine-specific adapter.
  return provider.mode === "bundled-quota"
}

function pickProvider(
  config: MossProviderConfig,
  engineId: AgentEngineId,
): MossProviderDefinition | undefined {
  const requestedProviderId = asString(process.env.MOSS_PROVIDER)
  const preferredProviderId = requestedProviderId || config.defaultProvider
  const preferred = preferredProviderId
    ? config.providers[preferredProviderId]
    : undefined

  if (preferred && providerSupportsEngine(preferred, engineId)) {
    return preferred
  }

  return Object.values(config.providers).find((provider) =>
    providerSupportsEngine(provider, engineId),
  )
}

function readEnvReference(name: string | undefined): string | undefined {
  if (!name) return undefined
  return asString(process.env[name])
}

function pickFirst(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0)
}

function resolveProviderValue(params: {
  provider: MossProviderDefinition
  engineConfig?: MossProviderEngineConfig
  key: "apiKey" | "baseUrl"
  envKey: "apiKeyEnv" | "baseUrlEnv"
  storedValue?: string
}): {
  value?: string
  envName?: string
  source?: MossProviderValueSource
} {
  if (params.storedValue) {
    return { value: params.storedValue, source: "stored" }
  }

  const envName = pickFirst(
    params.engineConfig?.[params.envKey],
    params.provider[params.envKey],
  )
  const envValue = readEnvReference(envName)
  if (envValue) {
    return { value: envValue, envName, source: "env" }
  }

  const inlineValue = pickFirst(
    params.engineConfig?.[params.key],
    params.provider[params.key],
  )
  if (inlineValue) {
    return { value: inlineValue, envName, source: "inline" }
  }

  return { envName }
}

function resolveModel(params: {
  provider: MossProviderDefinition
  engineId: AgentEngineId
  engineConfig?: MossProviderEngineConfig
  requestedModelId?: string
}): string | undefined {
  return pickFirst(
    params.engineConfig?.model,
    params.provider.models?.[params.engineId],
    params.provider.model,
    params.requestedModelId,
  )
}

function buildEngineEnv(params: {
  engineId: AgentEngineId
  provider: MossProviderDefinition
  model?: string
  baseUrl?: string
  apiKey?: string
  authMethod?: string
}): Record<string, string> {
  const env: Record<string, string> = {
    MOSS_PROVIDER_ID: params.provider.id,
  }
  if (params.provider.mode) env.MOSS_PROVIDER_MODE = params.provider.mode
  if (params.provider.label) env.MOSS_PROVIDER_LABEL = params.provider.label
  if (params.model) env.MOSS_MODEL = params.model
  if (params.baseUrl) env.MOSS_BASE_URL = params.baseUrl
  if (params.apiKey) env.MOSS_API_KEY = params.apiKey

  if (params.engineId === "claude-code") {
    if (params.model) env.ANTHROPIC_MODEL = params.model
    if (params.baseUrl) env.ANTHROPIC_BASE_URL = params.baseUrl
    if (params.apiKey) env.ANTHROPIC_AUTH_TOKEN = params.apiKey
  } else if (params.engineId === "codex") {
    if (params.model) env.CODEX_MODEL = params.model
    if (params.baseUrl) {
      env.CODEX_BASE_URL = params.baseUrl
      env.OPENAI_BASE_URL = params.baseUrl
    }
    if (params.apiKey) {
      if (params.authMethod === "openai-api-key") {
        env.OPENAI_API_KEY = params.apiKey
      } else {
        env.CODEX_API_KEY = params.apiKey
      }
    }
  } else if (params.engineId === "hermes") {
    if (params.model) env.HERMES_MODEL = params.model
    if (params.baseUrl) env.HERMES_BASE_URL = params.baseUrl
    if (params.apiKey) env.HERMES_API_KEY = params.apiKey
  } else if (params.engineId === "custom-acp") {
    if (params.model) env.MOSS_CUSTOM_ACP_MODEL = params.model
    if (params.baseUrl) env.MOSS_CUSTOM_ACP_BASE_URL = params.baseUrl
    if (params.apiKey) env.MOSS_CUSTOM_ACP_API_KEY = params.apiKey
  }

  return env
}

export async function resolveMossProviderForEngine(params: {
  projectPath: string
  engineId: AgentEngineId
  requestedModelId?: string
  createIfMissing?: boolean
  secretResolver?: MossProviderSecretResolver
}): Promise<ResolvedMossProvider> {
  const readResult = await readMossProviderConfig(params.projectPath, {
    createIfMissing: params.createIfMissing,
  })
  if (readResult.status === "missing") {
    return {
      status: "missing",
      sourcePath: readResult.sourcePath,
      env: {},
      warnings: [],
      reason: "No .moss/providers.yaml found.",
    }
  }
  if (readResult.status === "parse-error" || !readResult.config) {
    return {
      status: "parse-error",
      sourcePath: readResult.sourcePath,
      env: {},
      warnings: [],
      error: readResult.error,
    }
  }

  const provider = pickProvider(readResult.config, params.engineId)
  if (!provider) {
    return {
      status: "unconfigured",
      sourcePath: readResult.sourcePath,
      env: {},
      warnings: [
        `No Moss provider is configured for ${params.engineId}.`,
      ],
      reason: `No provider supports ${params.engineId}.`,
    }
  }

  const engineConfig = provider.engines?.[params.engineId]
  const storedSecret = params.secretResolver
    ? await params.secretResolver.getSecret(provider.id)
    : undefined
  const model = resolveModel({
    provider,
    engineId: params.engineId,
    engineConfig,
    requestedModelId: params.requestedModelId,
  })
  const baseUrl = resolveProviderValue({
    provider,
    engineConfig,
    key: "baseUrl",
    envKey: "baseUrlEnv",
  })
  const apiKey = resolveProviderValue({
    provider,
    engineConfig,
    key: "apiKey",
    envKey: "apiKeyEnv",
    storedValue: storedSecret?.apiKey,
  })
  const authMethod = pickFirst(engineConfig?.authMethod, provider.authMethod)
  const env = mergeStringRecord(
    provider.env,
    engineConfig?.env,
    buildEngineEnv({
      engineId: params.engineId,
      provider,
      model,
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      authMethod,
    }),
  )
  const warnings: string[] = []

  if (apiKey.envName && !apiKey.value) {
    warnings.push(`Provider ${provider.id} references unset ${apiKey.envName}.`)
  }
  if (baseUrl.envName && !baseUrl.value) {
    warnings.push(`Provider ${provider.id} references unset ${baseUrl.envName}.`)
  }

  return {
    status: "resolved",
    sourcePath: readResult.sourcePath,
    providerId: provider.id,
    label: provider.label,
    mode: provider.mode,
    runtime: provider.runtime,
    model,
    baseUrl: baseUrl.value,
    baseUrlSource: baseUrl.source,
    baseUrlEnv: baseUrl.envName,
    apiKey: apiKey.value,
    apiKeySource: apiKey.source,
    apiKeyEnv: apiKey.envName,
    hasStoredApiKey: Boolean(storedSecret?.apiKey),
    authMethod,
    env,
    warnings,
  }
}

export function getMossProviderFingerprint(
  provider: ResolvedMossProvider | null | undefined,
): string | null {
  if (!provider || provider.status !== "resolved") return null
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        providerId: provider.providerId,
        mode: provider.mode,
        model: provider.model,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        authMethod: provider.authMethod,
      }),
    )
    .digest("hex")
}

export function summarizeMossProviderReadResult(
  readResult: MossProviderReadResult,
  storedSecrets: Record<string, { hasApiKey?: boolean }> = {},
): MossProviderSummary {
  const config = readResult.config
  return {
    status: readResult.status,
    sourcePath: readResult.sourcePath,
    defaultProvider: config?.defaultProvider,
    credentialPolicy: config?.credentialPolicy,
    providers: Object.values(config?.providers ?? {}).map((provider) => ({
      id: provider.id,
      label: provider.label,
      mode: provider.mode,
      runtime: provider.runtime,
      engines: Object.keys(provider.engines ?? {}) as AgentEngineId[],
      hasInlineApiKey: Boolean(provider.apiKey),
      apiKeyEnv: provider.apiKeyEnv,
      hasStoredApiKey: Boolean(storedSecrets[provider.id]?.hasApiKey),
      baseUrl: provider.baseUrl,
      baseUrlEnv: provider.baseUrlEnv,
    })),
    error: readResult.error,
  }
}
