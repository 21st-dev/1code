export const PROVIDER_PROFILE_SOURCE_PREFIX = "provider-profile:"

export const providerProfileProtocols = [
  "anthropic",
  "openai-chat",
  "openai-responses",
] as const
export type ProviderProfileProtocol = (typeof providerProfileProtocols)[number]

export const providerProfileAuthModes = ["bearer", "x-api-key", "none"] as const
export type ProviderProfileAuthMode = (typeof providerProfileAuthModes)[number]

export const providerProfileTargets = [
  "claude",
  "codex",
  "helpers",
  "local",
] as const
export type ProviderProfileTarget = (typeof providerProfileTargets)[number]

export const providerProfileDefaultPurposes = [
  "claude-main",
  "codex-main",
  "sub_chat_title",
  "commit_message",
] as const
export type ProviderProfileDefaultPurpose =
  (typeof providerProfileDefaultPurposes)[number]

export type ProviderProfileCapabilities = {
  claude?: boolean
  codex?: boolean
  helpers?: boolean
  local?: boolean
  streaming?: boolean
  tools?: boolean
  vision?: boolean
}

export const providerDiagnosticCheckIds = [
  "endpoint",
  "auth",
  "model",
  "protocol",
  "streaming",
  "tools",
  "vision",
  "gateway",
  "runtime",
] as const
export type ProviderDiagnosticCheckId =
  (typeof providerDiagnosticCheckIds)[number]

export const providerDiagnosticStatuses = [
  "ok",
  "failed",
  "unsupported",
  "skipped",
] as const
export type ProviderDiagnosticStatus =
  (typeof providerDiagnosticStatuses)[number]

export const providerDiagnosticCategories = [
  "endpoint_unreachable",
  "auth_failed",
  "model_denied",
  "protocol_mismatch",
  "streaming_unsupported",
  "tools_unsupported",
  "vision_unsupported",
  "gateway_failed",
  "runtime_unavailable",
] as const
export type ProviderDiagnosticCategory =
  (typeof providerDiagnosticCategories)[number]

export type ProviderDiagnosticCheck = {
  id: ProviderDiagnosticCheckId
  status: ProviderDiagnosticStatus
  message: string
  category?: ProviderDiagnosticCategory
}

export type ProviderProfileTestStatus = {
  ok: boolean
  checkedAt: string
  message: string
  capabilities?: ProviderProfileCapabilities
  diagnosticVersion?: 1
  category?: ProviderDiagnosticCategory
  checks?: ProviderDiagnosticCheck[]
}

export type ProviderProfilePreset = {
  id: string
  name: string
  region: "china" | "global" | "local" | "generic"
  protocol: ProviderProfileProtocol
  baseUrl: string
  defaultModel: string
  authMode: ProviderProfileAuthMode
  targetRuntimes: ProviderProfileTarget[]
  capabilities: ProviderProfileCapabilities
  notes?: string
}

export type ProviderProfileMetadata = {
  id: string
  name: string
  presetId: string | null
  protocol: ProviderProfileProtocol
  baseUrl: string
  defaultModel: string
  authMode: ProviderProfileAuthMode
  hasToken: boolean
  headers: Record<string, string>
  targetRuntimes: ProviderProfileTarget[]
  capabilities: ProviderProfileCapabilities
  lastTestStatus: ProviderProfileTestStatus | null
  createdAt: string | null
  updatedAt: string | null
}

export function providerProfileSource(profileId: string): string {
  return `${PROVIDER_PROFILE_SOURCE_PREFIX}${profileId}`
}

export function parseProviderProfileSource(source: string | undefined | null):
  | string
  | null {
  if (!source?.startsWith(PROVIDER_PROFILE_SOURCE_PREFIX)) return null
  const id = source.slice(PROVIDER_PROFILE_SOURCE_PREFIX.length).trim()
  return id || null
}

export function isProviderProfileSource(source: string | undefined | null): boolean {
  return Boolean(parseProviderProfileSource(source))
}
