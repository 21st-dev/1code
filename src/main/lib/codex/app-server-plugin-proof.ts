export interface CodexAppServerPluginProtocolObservation {
  method: string
  ok: boolean
  resultKeys: string[]
  marketplaceCount?: number
  pluginCount?: number
  installedPluginCount?: number
  enabledPluginCount?: number
  featuredPluginCount?: number
  skillRootCount?: number
  skillCount?: number
  hookRootCount?: number
  hookCount?: number
  sampleNames: string[]
  errorMessage?: string
}

export interface CodexAppServerPluginProtocolAssessment {
  supportsPluginInventory: boolean
  supportsSkillInventory: boolean
  supportsHookInventory: boolean
  exposesGenericThreadSettingsUpdate: boolean
  hasTypedPerRunPluginAllowlist: boolean
  typedPerRunPluginControlMethods: string[]
  observedPluginMethods: string[]
  reasons: string[]
}

export interface CodexAppServerThreadStartObservation {
  method: "thread/start"
  ok: boolean
  resultKeys: string[]
  threadKeys: string[]
  hasThreadId: boolean
  hasSessionId: boolean
  ephemeral?: boolean
  turnCount?: number
  instructionSourceCount?: number
  pluginLikeInstructionSourceCount?: number
  sampleInstructionSources: string[]
  configKeys: string[]
  errorMessage?: string
}

export interface CodexAppServerProtocolLikeResponse {
  result?: unknown
  error?: {
    message?: string
  }
}

interface PluginInventoryCounts {
  marketplaceCount?: number
  pluginCount?: number
  installedPluginCount?: number
  enabledPluginCount?: number
  featuredPluginCount?: number
  sampleNames: string[]
}

interface RuntimeComponentCounts {
  rootCount?: number
  componentCount?: number
  sampleNames: string[]
}

const PER_RUN_PLUGIN_CONTROL_METHOD_PATTERN =
  /(^thread\/.*plugin|^plugin\/.*(allow|disable|enable|filter|settings|thread)|plugin.*allowlist)/i

export function summarizeCodexAppServerThreadStartResponse(input: {
  response: CodexAppServerProtocolLikeResponse
  config?: Record<string, unknown> | null
}): CodexAppServerThreadStartObservation {
  const result = input.response.result
  const thread = isRecord(result) ? result.thread : undefined
  const threadRecord = isRecord(thread) ? thread : undefined
  const instructionSources = isRecord(result)
    ? getArray(result.instructionSources)
    : []
  const sampleInstructionSources = instructionSources
    .map((source) => getInstructionSourceLabel(source))
    .filter(isNonEmptyString)
    .slice(0, 8)
  const threadTurns = threadRecord ? getArray(threadRecord.turns) : []
  const errorMessage = input.response.error?.message

  return {
    method: "thread/start",
    ok: !input.response.error,
    resultKeys: isRecord(result) ? Object.keys(result) : [],
    threadKeys: threadRecord ? Object.keys(threadRecord) : [],
    hasThreadId: isNonEmptyString(threadRecord?.id),
    hasSessionId: isNonEmptyString(threadRecord?.sessionId),
    ephemeral:
      typeof threadRecord?.ephemeral === "boolean"
        ? threadRecord.ephemeral
        : undefined,
    turnCount:
      threadRecord && Array.isArray(threadRecord.turns)
        ? threadTurns.length
        : undefined,
    instructionSourceCount:
      instructionSources.length > 0 ? instructionSources.length : undefined,
    pluginLikeInstructionSourceCount:
      instructionSources.length > 0
        ? sampleInstructionSources.filter(isPluginLikeInstructionSource).length
        : undefined,
    sampleInstructionSources,
    configKeys: input.config ? Object.keys(input.config).sort() : [],
    ...(errorMessage ? { errorMessage } : {}),
  }
}

export function summarizeCodexAppServerPluginProtocolResponse(
  method: string,
  response: CodexAppServerProtocolLikeResponse,
): CodexAppServerPluginProtocolObservation {
  const result = response.result
  const pluginCounts = summarizePluginInventory(result)
  const skills = summarizeRuntimeComponents(result, "skills")
  const hooks = summarizeRuntimeComponents(result, "hooks")
  const errorMessage = response.error?.message

  return {
    method,
    ok: !response.error,
    resultKeys: isRecord(result) ? Object.keys(result) : [],
    marketplaceCount: pluginCounts.marketplaceCount,
    pluginCount: pluginCounts.pluginCount,
    installedPluginCount: pluginCounts.installedPluginCount,
    enabledPluginCount: pluginCounts.enabledPluginCount,
    featuredPluginCount: pluginCounts.featuredPluginCount,
    skillRootCount: skills.rootCount,
    skillCount: skills.componentCount,
    hookRootCount: hooks.rootCount,
    hookCount: hooks.componentCount,
    sampleNames: uniqueStrings([
      ...pluginCounts.sampleNames,
      ...skills.sampleNames,
      ...hooks.sampleNames,
    ]).slice(0, 8),
    ...(errorMessage ? { errorMessage } : {}),
  }
}

export function extractAcceptedCodexAppServerClientMethods(
  errorMessage: string,
): string[] {
  const expectedIndex = errorMessage.indexOf("expected one of")
  if (expectedIndex < 0) return []

  const expectedMethods = errorMessage.slice(expectedIndex)
  const methods: string[] = []
  for (const match of expectedMethods.matchAll(/`([^`]+)`/g)) {
    methods.push(match[1])
  }
  return uniqueStrings(methods)
}

export function assessCodexAppServerPluginProtocol(input: {
  observations: CodexAppServerPluginProtocolObservation[]
  acceptedClientMethods?: string[]
}): CodexAppServerPluginProtocolAssessment {
  const acceptedClientMethods = input.acceptedClientMethods ?? []
  const observedPluginMethods = uniqueStrings(
    acceptedClientMethods.filter(
      (method) =>
        method.startsWith("plugin/") || method.startsWith("marketplace/"),
    ),
  )
  const typedPerRunPluginControlMethods = uniqueStrings(
    acceptedClientMethods.filter((method) =>
      PER_RUN_PLUGIN_CONTROL_METHOD_PATTERN.test(method),
    ),
  )
  const supportsPluginInventory = input.observations.some(
    (observation) =>
      observation.ok &&
      (observation.method === "plugin/list" ||
        observation.method === "plugin/installed"),
  )
  const supportsSkillInventory = input.observations.some(
    (observation) =>
      observation.ok &&
      observation.method === "skills/list" &&
      typeof observation.skillCount === "number",
  )
  const supportsHookInventory = input.observations.some(
    (observation) =>
      observation.ok &&
      observation.method === "hooks/list" &&
      typeof observation.hookCount === "number",
  )
  const exposesGenericThreadSettingsUpdate = acceptedClientMethods.includes(
    "thread/settings/update",
  )
  const hasTypedPerRunPluginAllowlist =
    typedPerRunPluginControlMethods.length > 0

  const reasons: string[] = []
  if (supportsPluginInventory) {
    reasons.push("app-server exposes global plugin inventory methods")
  } else {
    reasons.push("app-server plugin inventory methods were not observed")
  }
  if (exposesGenericThreadSettingsUpdate) {
    reasons.push(
      "thread/settings/update is generic and is not proof of plugin allowlist enforcement",
    )
  }
  if (!hasTypedPerRunPluginAllowlist) {
    reasons.push("no typed per-run plugin allowlist method was observed")
  }

  return {
    supportsPluginInventory,
    supportsSkillInventory,
    supportsHookInventory,
    exposesGenericThreadSettingsUpdate,
    hasTypedPerRunPluginAllowlist,
    typedPerRunPluginControlMethods,
    observedPluginMethods,
    reasons,
  }
}

function summarizePluginInventory(result: unknown): PluginInventoryCounts {
  if (!isRecord(result)) return { sampleNames: [] }

  const marketplaces = getArray(result.marketplaces)
  const featuredPluginIds = getArray(result.featuredPluginIds)
  const directPlugins = [
    ...getArray(result.plugins),
    ...getArray(result.installed),
    ...getArray(result.installedPlugins),
  ]
  const marketplacePlugins = marketplaces.flatMap((marketplace) =>
    isRecord(marketplace) ? getArray(marketplace.plugins) : [],
  )
  const plugins = [...directPlugins, ...marketplacePlugins]
  const pluginRecords = plugins.filter(isRecord)
  const sampleNames = pluginRecords
    .map((plugin) => getDisplayName(plugin))
    .filter(isNonEmptyString)

  return {
    marketplaceCount: marketplaces.length > 0 ? marketplaces.length : undefined,
    pluginCount: plugins.length > 0 ? plugins.length : undefined,
    installedPluginCount:
      pluginRecords.length > 0
        ? pluginRecords.filter((plugin) => plugin.installed === true).length
        : undefined,
    enabledPluginCount:
      pluginRecords.length > 0
        ? pluginRecords.filter((plugin) => plugin.enabled === true).length
        : undefined,
    featuredPluginCount:
      featuredPluginIds.length > 0 ? featuredPluginIds.length : undefined,
    sampleNames: uniqueStrings(sampleNames).slice(0, 8),
  }
}

function summarizeRuntimeComponents(
  result: unknown,
  componentKey: "skills" | "hooks",
): RuntimeComponentCounts {
  if (!isRecord(result)) return { sampleNames: [] }

  const data = getArray(result.data)
  const dataWithComponents = data.filter(
    (entry) => isRecord(entry) && Array.isArray(entry[componentKey]),
  )
  const directComponents = getArray(result[componentKey])
  const nestedComponents = dataWithComponents.flatMap((entry) =>
    isRecord(entry) ? getArray(entry[componentKey]) : [],
  )
  const components = [...directComponents, ...nestedComponents]
  const sampleNames = components
    .filter(isRecord)
    .map((component) => getDisplayName(component))
    .filter(isNonEmptyString)

  return {
    rootCount:
      dataWithComponents.length > 0 ? dataWithComponents.length : undefined,
    componentCount:
      dataWithComponents.length > 0 || directComponents.length > 0
        ? components.length
        : undefined,
    sampleNames: uniqueStrings(sampleNames).slice(0, 8),
  }
}

function getDisplayName(record: Record<string, unknown>): string | undefined {
  for (const key of [
    "id",
    "name",
    "displayName",
    "title",
    "pluginName",
    "path",
  ]) {
    const value = record[key]
    if (isNonEmptyString(value)) return value
  }

  const nestedInterface = record.interface
  if (
    isRecord(nestedInterface) &&
    isNonEmptyString(nestedInterface.displayName)
  ) {
    return nestedInterface.displayName
  }
  return undefined
}

function getInstructionSourceLabel(source: unknown): string | undefined {
  if (isNonEmptyString(source)) return source
  if (!isRecord(source)) return undefined
  return getDisplayName(source)
}

function isPluginLikeInstructionSource(source: string): boolean {
  const normalized = source.toLowerCase()
  return (
    normalized.includes("/plugins/") ||
    normalized.includes(".agents/plugins") ||
    normalized.startsWith("plugin:")
  )
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}
