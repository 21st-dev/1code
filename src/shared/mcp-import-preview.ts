const REDACTED_VALUE = "<redacted>"
const MAX_DEEP_LINK_LENGTH = 24_000
const MAX_IMPORT_PAYLOAD_LENGTH = 16_000
const MAX_IMPORT_ARGS = 128
const MAX_IMPORT_ARG_LENGTH = 2_000

const SUPPORTED_IMPORT_PROTOCOLS = new Set([
  "locus:",
  "locus-dev:",
  "agent-code-for-me:",
  "agent-code-for-me-dev:",
])

const SENSITIVE_ARG_FLAGS = new Set([
  "access-token",
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "bearer",
  "id-token",
  "id_token",
  "key",
  "password",
  "refresh-token",
  "refresh_token",
  "secret",
  "token",
])

const SENSITIVE_ARG_VALUE_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/,
  /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /bearer\s+[A-Za-z0-9._-]+/i,
  /authorization\s*:\s*basic\s+[A-Za-z0-9+/=_-]+/i,
]

const REQUESTED_ACTION_KEYS = [
  "apply",
  "autoStart",
  "autostart",
  "enable",
  "install",
  "login",
  "start",
  "write",
] as const

const SAFE_ENV_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export type McpImportRuntime = "claude-code" | "codex"
export type McpImportScope = "global" | "project"
export type McpImportTransport = "stdio" | "http" | "sse" | "streamable_http"

export type McpImportRedactedField = {
  key: string
  hasValue: boolean
  redacted: true
  valuePreview: typeof REDACTED_VALUE
  valueSource?: "inline" | "env"
  valueSourceKey?: string
}

export type McpImportPreviewArg = {
  value: string
  redacted: boolean
}

export type McpImportPreview = {
  kind: "mcp-import-preview"
  version: 1
  state: "pending"
  effectiveEnabled: false
  requestedEnabled: boolean | null
  requestedActions: string[]
  runtime: McpImportRuntime
  scope: McpImportScope
  serverName: string
  transport: McpImportTransport
  command?: string
  url?: string
  args: McpImportPreviewArg[]
  cwd?: string
  env: McpImportRedactedField[]
  headers: McpImportRedactedField[]
  oauthFields: McpImportRedactedField[]
  wouldWritePaths: string[]
  warnings: string[]
  source: {
    scheme: string
    host: string
    path: string
    queryKeys: string[]
  }
}

export type McpImportParseResult =
  | { ok: true; preview: McpImportPreview }
  | {
      ok: false
      code:
        | "unsupported-link"
        | "oversized-link"
        | "missing-payload"
        | "oversized-payload"
        | "invalid-payload"
        | "invalid-config"
      message: string
      sanitizedUrl: string
    }

type AnyRecord = Record<string, unknown>

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function isSensitiveKeyName(value: string): boolean {
  return /(?:^|[_-])(api[_-]?key|auth|authorization|bearer|password|secret|token)(?:$|[_-])/i.test(value)
}

function isSafeEnvVarName(value: string | undefined): value is string {
  return Boolean(value && SAFE_ENV_VAR_NAME.test(value))
}

function safeEnvVarName(value: unknown): string | undefined {
  const name = stringValue(value)
  return isSafeEnvVarName(name) ? name : undefined
}

function normalizeRuntime(value: unknown): McpImportRuntime | null {
  const normalized = stringValue(value)?.toLowerCase().replaceAll("_", "-")
  if (normalized === "claude" || normalized === "claude-code") return "claude-code"
  if (normalized === "codex" || normalized === "codex-cli") return "codex"
  return null
}

function normalizeScope(value: unknown): McpImportScope | null {
  const normalized = stringValue(value)?.toLowerCase()
  if (normalized === "global" || normalized === "user") return "global"
  if (normalized === "project" || normalized === "workspace") return "project"
  return null
}

function normalizeTransport(value: unknown): McpImportTransport | null {
  const normalized = stringValue(value)?.toLowerCase().replaceAll("-", "_")
  if (normalized === "stdio") return "stdio"
  if (normalized === "http") return "http"
  if (normalized === "sse") return "sse"
  if (normalized === "streamable_http") return "streamable_http"
  return null
}

function sourceFromUrl(parsed: URL): McpImportPreview["source"] {
  return {
    scheme: parsed.protocol.replace(/:$/, ""),
    host: parsed.host,
    path: parsed.pathname,
    queryKeys: uniqueStrings([...parsed.searchParams.keys()]).sort(),
  }
}

export function isMcpImportDeepLink(parsed: URL): boolean {
  if (!SUPPORTED_IMPORT_PROTOCOLS.has(parsed.protocol)) return false
  return (
    (parsed.host === "mcp" && parsed.pathname === "/import") ||
    parsed.pathname === "/mcp/import"
  )
}

export function sanitizeDeepLinkForLog(value: unknown): string {
  const text = typeof value === "string" ? value : String(value)
  try {
    const parsed = new URL(text)
    const keys = uniqueStrings([...parsed.searchParams.keys()]).sort()
    const querySummary = keys.length > 0 ? `?keys=${keys.join(",")}` : ""
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${querySummary}`
  } catch {
    return `[invalid-url length=${text.length}]`
  }
}

export function sanitizeProcessArgForLog(arg: string): string {
  try {
    const parsed = new URL(arg)
    if (SUPPORTED_IMPORT_PROTOCOLS.has(parsed.protocol)) {
      return sanitizeDeepLinkForLog(arg)
    }
  } catch {
    // Not a URL-shaped argv item.
  }
  const equalsIndex = arg.indexOf("=")
  if (equalsIndex > 0) {
    const flag = arg.slice(0, equalsIndex)
    const flagName = flag.replace(/^-+/, "").toLowerCase()
    if (SENSITIVE_ARG_FLAGS.has(flagName)) {
      return `${flag}=${REDACTED_VALUE}`
    }
  }
  if (SENSITIVE_ARG_VALUE_PATTERNS.some((pattern) => pattern.test(arg))) {
    return `[redacted-arg length=${arg.length}]`
  }
  return arg
}

export function sanitizeProcessArgsForLog(args: string[]): string[] {
  let redactNext = false
  return args.map((arg) => {
    if (redactNext) {
      redactNext = false
      return `[redacted-arg length=${arg.length}]`
    }
    const flagName = arg.replace(/^-+/, "").toLowerCase()
    if (SENSITIVE_ARG_FLAGS.has(flagName) && !arg.includes("=")) {
      redactNext = true
      return arg
    }
    return sanitizeProcessArgForLog(arg)
  })
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function parsePayloadJson(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed)
  }

  try {
    return JSON.parse(decodeBase64Url(trimmed))
  } catch {
    return JSON.parse(decodeURIComponent(trimmed))
  }
}

function sensitiveFlagName(arg: string): string | null {
  const match = arg.match(/^--?([A-Za-z0-9_-]+)(?:=.*)?$/)
  if (!match) return null
  const name = match[1]?.toLowerCase()
  return name && SENSITIVE_ARG_FLAGS.has(name) ? name : null
}

function redactHeaderLikeArg(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*Bearer\s+)[^\s,;]+/gi, `$1${REDACTED_VALUE}`)
    .replace(
      /\b((?:x-api-key|api-key|api_key|token|access-token|access_token|refresh-token|refresh_token|secret)\s*[:=]\s*)[^\s,;]+/gi,
      `$1${REDACTED_VALUE}`,
    )
}

function redactSecretLikeText(value: string): { value: string; redacted: boolean } {
  const redacted = value
    .replace(/sk-[A-Za-z0-9_-]+/g, REDACTED_VALUE)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED_VALUE}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED_VALUE)
    .replace(
      /\b((?:access|refresh|id)_?token|api[_-]?key|password|secret|token)\s*=\s*[^\s&#]+/gi,
      (_match, key: string) => `${key}=${REDACTED_VALUE}`,
    )

  return { value: redacted, redacted: redacted !== value }
}

function redactAssignmentArg(value: string): { value: string; redacted: boolean } {
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_-]*)=(.*)$/s)
  if (!match) return redactSecretLikeText(value)

  const [, key, raw] = match
  if (!key) return redactSecretLikeText(value)
  const secretLike = redactSecretLikeText(raw ?? "")
  if (isSensitiveKeyName(key) || secretLike.redacted) {
    return { value: `${key}=${REDACTED_VALUE}`, redacted: true }
  }

  return { value, redacted: false }
}

function redactEnvFlagValue(value: string): { value: string; redacted: boolean } {
  const assignment = value.match(/^([A-Za-z_][A-Za-z0-9_-]*)=(.*)$/s)
  if (assignment?.[1]) {
    return { value: `${assignment[1]}=${REDACTED_VALUE}`, redacted: true }
  }
  return { value: REDACTED_VALUE, redacted: true }
}

export function sanitizeMcpCommandArgs(args: unknown): McpImportPreviewArg[] {
  const values = stringArray(args).slice(0, MAX_IMPORT_ARGS)
  const sanitized: McpImportPreviewArg[] = []
  let redactNext = false
  let redactNextAsEnv = false

  for (const raw of values) {
    const bounded = raw.slice(0, MAX_IMPORT_ARG_LENGTH)
    const flag = sensitiveFlagName(bounded)
    const envFlagWithValue = bounded.match(/^--?env=(.*)$/s)
    const isHeaderValue = /^(authorization|x-api-key|api-key|api_key|token|secret)\s*[:=]/i.test(bounded)
    const containsBearer = /\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(bounded)

    if (redactNextAsEnv) {
      sanitized.push(redactEnvFlagValue(bounded))
      redactNextAsEnv = false
      continue
    }

    if (redactNext) {
      sanitized.push({ value: REDACTED_VALUE, redacted: true })
      redactNext = false
      continue
    }

    if (envFlagWithValue?.[1]) {
      const redacted = redactEnvFlagValue(envFlagWithValue[1])
      sanitized.push({
        value: `--env=${redacted.value}`,
        redacted: true,
      })
      continue
    }

    if (/^--?env$/i.test(bounded)) {
      sanitized.push({ value: bounded, redacted: false })
      redactNextAsEnv = true
      continue
    }

    if (flag && bounded.includes("=")) {
      sanitized.push({
        value: bounded.replace(/=(.*)$/s, `=${REDACTED_VALUE}`),
        redacted: true,
      })
      continue
    }

    if (flag) {
      sanitized.push({ value: bounded, redacted: false })
      redactNext = true
      continue
    }

    if (isHeaderValue || containsBearer) {
      sanitized.push({ value: redactHeaderLikeArg(bounded), redacted: true })
      continue
    }

    sanitized.push(redactAssignmentArg(bounded))
  }

  return sanitized
}

export function sanitizeMcpUrlForPreview(value: unknown): string | undefined {
  const raw = stringValue(value)
  if (!raw) return undefined
  try {
    const parsed = new URL(raw)
    const query = [...parsed.searchParams.keys()]
      .map((key) => `${encodeURIComponent(key)}=${REDACTED_VALUE}`)
      .join("&")
    const hash = parsed.hash ? `#${REDACTED_VALUE}` : ""
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${query ? `?${query}` : ""}${hash}`
  } catch {
    return redactSecretLikeText(raw).value
  }
}

function isSupportedMcpPreviewUrl(value: unknown): boolean {
  const raw = stringValue(value)
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function redactedRecordFields(
  value: unknown,
  valueSource: "inline" | "env" = "inline",
): McpImportRedactedField[] {
  if (!isRecord(value)) return []
  return Object.entries(value)
    .filter(([key]) => Boolean(key.trim()))
    .map(([key, rawValue]) => ({
      key,
      hasValue: rawValue !== undefined && rawValue !== null && String(rawValue).length > 0,
      redacted: true,
      valuePreview: REDACTED_VALUE,
      valueSource,
      ...(valueSource === "env" && safeEnvVarName(rawValue)
        ? { valueSourceKey: safeEnvVarName(rawValue) }
        : {}),
    }))
}

function redactedArrayFields(value: unknown): McpImportRedactedField[] {
  return stringArray(value).map((key) => ({
    key: isSafeEnvVarName(key) ? key : REDACTED_VALUE,
    hasValue: false,
    redacted: true,
    valuePreview: REDACTED_VALUE,
    valueSource: "env",
    ...(isSafeEnvVarName(key) ? { valueSourceKey: key } : {}),
  }))
}

function mergeFields(fields: McpImportRedactedField[]): McpImportRedactedField[] {
  const byKey = new Map<string, McpImportRedactedField>()
  for (const field of fields) {
    const existing = byKey.get(field.key)
    byKey.set(field.key, {
      ...field,
      hasValue: field.hasValue || existing?.hasValue || false,
      valueSource: field.valueSource ?? existing?.valueSource,
      valueSourceKey: field.valueSourceKey ?? existing?.valueSourceKey,
    })
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function requestedActionsFromPayload(payload: AnyRecord): string[] {
  return REQUESTED_ACTION_KEYS.filter((key) => payload[key] === true)
}

function requestedEnabledFromPayload(payload: AnyRecord): boolean | null {
  if (typeof payload.enabled === "boolean") return payload.enabled
  if (typeof payload.disabled === "boolean") return !payload.disabled
  return null
}

function wouldWritePaths(runtime: McpImportRuntime, scope: McpImportScope): string[] {
  if (runtime === "codex") {
    return scope === "global"
      ? ["~/.codex/config.toml"]
      : ["Codex project MCP config (future explicit apply target)"]
  }

  return scope === "global"
    ? ["~/.claude.json", "~/.claude/mcp.json"]
    : ["<project>/.mcp.json", "~/.claude.json projects[project]"]
}

function unsupportedFields(payload: AnyRecord): string[] {
  const allowed = new Set([
    "_oauth",
    "args",
    "autoStart",
    "autostart",
    "bearerTokenEnvVar",
    "bearer_token_env_var",
    "command",
    "cwd",
    "disabled",
    "enable",
    "enabled",
    "env",
    "envHttpHeaders",
    "envVars",
    "env_http_headers",
    "env_vars",
    "headers",
    "http_headers",
    "install",
    "login",
    "name",
    "runtime",
    "scope",
    "server",
    "serverName",
    "start",
    "transport",
    "type",
    "url",
    "version",
    "write",
  ])
  return Object.keys(payload).filter((key) => !allowed.has(key)).sort()
}

function buildPreview(parsed: URL, payload: AnyRecord): McpImportParseResult {
  const nestedServer = isRecord(payload.server) ? payload.server : {}
  const serverName =
    stringValue(payload.serverName) ||
    stringValue(payload.name) ||
    stringValue(nestedServer.name)
  if (!serverName) {
    return {
      ok: false,
      code: "invalid-config",
      message: "MCP import payload is missing a server name.",
      sanitizedUrl: sanitizeDeepLinkForLog(parsed.toString()),
    }
  }

  const runtime = normalizeRuntime(payload.runtime)
  if (!runtime) {
    return {
      ok: false,
      code: "invalid-config",
      message: "MCP import payload has an unsupported runtime.",
      sanitizedUrl: sanitizeDeepLinkForLog(parsed.toString()),
    }
  }

  const scope = normalizeScope(payload.scope)
  if (!scope) {
    return {
      ok: false,
      code: "invalid-config",
      message: "MCP import payload has an unsupported scope.",
      sanitizedUrl: sanitizeDeepLinkForLog(parsed.toString()),
    }
  }

  const transport = normalizeTransport(payload.transport ?? payload.type)
  if (!transport) {
    return {
      ok: false,
      code: "invalid-config",
      message: "MCP import payload has an unsupported transport.",
      sanitizedUrl: sanitizeDeepLinkForLog(parsed.toString()),
    }
  }

  const command = stringValue(payload.command)
  const url = sanitizeMcpUrlForPreview(payload.url)
  if (transport === "stdio" && (!command || url)) {
    return {
      ok: false,
      code: "invalid-config",
      message: "stdio MCP imports must include command and must not include url.",
      sanitizedUrl: sanitizeDeepLinkForLog(parsed.toString()),
    }
  }
  if (transport !== "stdio" && (!url || !isSupportedMcpPreviewUrl(payload.url) || command)) {
    return {
      ok: false,
      code: "invalid-config",
      message: "HTTP MCP imports must include url and must not include command.",
      sanitizedUrl: sanitizeDeepLinkForLog(parsed.toString()),
    }
  }

  const requestedEnabled = requestedEnabledFromPayload(payload)
  const requestedActions = requestedActionsFromPayload(payload)
  const warnings: string[] = []
  if (requestedEnabled === true || requestedActions.length > 0) {
    warnings.push("Requested activation is ignored; preview remains pending and disabled.")
  }
  const unknownFields = unsupportedFields(payload)
  if (unknownFields.length > 0) {
    warnings.push(`Unsupported fields ignored: ${unknownFields.join(", ")}`)
  }

  const env = mergeFields([
    ...redactedRecordFields(payload.env),
    ...redactedArrayFields(payload.envVars),
    ...redactedArrayFields(payload.env_vars),
  ])
  const headers = mergeFields([
    ...redactedRecordFields(payload.headers),
    ...redactedRecordFields(payload.http_headers),
    ...redactedRecordFields(payload.envHttpHeaders, "env"),
    ...redactedRecordFields(payload.env_http_headers, "env"),
    ...(stringValue(payload.bearerTokenEnvVar) || stringValue(payload.bearer_token_env_var)
      ? [{
          key: "Authorization",
          hasValue: false,
          redacted: true as const,
          valuePreview: REDACTED_VALUE as typeof REDACTED_VALUE,
          valueSource: "env" as const,
          ...(safeEnvVarName(payload.bearerTokenEnvVar) ||
          safeEnvVarName(payload.bearer_token_env_var)
            ? {
                valueSourceKey:
                  safeEnvVarName(payload.bearerTokenEnvVar) ||
                  safeEnvVarName(payload.bearer_token_env_var),
              }
            : {}),
        }]
      : []),
  ])
  const oauthFields = redactedRecordFields(payload._oauth)

  return {
    ok: true,
    preview: {
      kind: "mcp-import-preview",
      version: 1,
      state: "pending",
      effectiveEnabled: false,
      requestedEnabled,
      requestedActions,
      runtime,
      scope,
      serverName,
      transport,
      ...(command ? { command } : {}),
      ...(url ? { url } : {}),
      args: sanitizeMcpCommandArgs(payload.args),
      ...(stringValue(payload.cwd) ? { cwd: stringValue(payload.cwd) } : {}),
      env,
      headers,
      oauthFields,
      wouldWritePaths: wouldWritePaths(runtime, scope),
      warnings,
      source: sourceFromUrl(parsed),
    },
  }
}

export function parseMcpImportLink(rawUrl: string): McpImportParseResult {
  if (rawUrl.length > MAX_DEEP_LINK_LENGTH) {
    return {
      ok: false,
      code: "oversized-link",
      message: "MCP import link is too large.",
      sanitizedUrl: `[oversized-url length=${rawUrl.length}]`,
    }
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return {
      ok: false,
      code: "unsupported-link",
      message: "MCP import link is not a valid URL.",
      sanitizedUrl: sanitizeDeepLinkForLog(rawUrl),
    }
  }

  if (!isMcpImportDeepLink(parsed)) {
    return {
      ok: false,
      code: "unsupported-link",
      message: "Unsupported MCP import link.",
      sanitizedUrl: sanitizeDeepLinkForLog(rawUrl),
    }
  }

  const payloadParam = parsed.searchParams.get("payload")
  if (!payloadParam) {
    return {
      ok: false,
      code: "missing-payload",
      message: "MCP import link is missing a payload.",
      sanitizedUrl: sanitizeDeepLinkForLog(rawUrl),
    }
  }

  if (payloadParam.length > MAX_IMPORT_PAYLOAD_LENGTH) {
    return {
      ok: false,
      code: "oversized-payload",
      message: "MCP import payload is too large.",
      sanitizedUrl: sanitizeDeepLinkForLog(rawUrl),
    }
  }

  let payload: unknown
  try {
    payload = parsePayloadJson(payloadParam)
  } catch {
    return {
      ok: false,
      code: "invalid-payload",
      message: "MCP import payload is not valid JSON.",
      sanitizedUrl: sanitizeDeepLinkForLog(rawUrl),
    }
  }

  if (!isRecord(payload)) {
    return {
      ok: false,
      code: "invalid-payload",
      message: "MCP import payload must be a JSON object.",
      sanitizedUrl: sanitizeDeepLinkForLog(rawUrl),
    }
  }

  return buildPreview(parsed, payload)
}

function redactedObject(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const redacted = Object.fromEntries(
    Object.keys(value)
      .filter(Boolean)
      .sort()
      .map((key) => [key, REDACTED_VALUE]),
  )
  return Object.keys(redacted).length > 0 ? redacted : undefined
}

export function sanitizeMcpConfigForRenderer(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {}

  const copyString = (key: string, outputKey = key) => {
    const value = stringValue(config[key])
    if (value) safe[outputKey] = value
  }
  const copyBoolean = (key: string) => {
    if (typeof config[key] === "boolean") safe[key] = config[key]
  }
  const copyStringArray = (key: string) => {
    const values = stringArray(config[key])
    if (values.length > 0) safe[key] = values
  }

  copyString("transportType")
  copyString("authStatus")
  copyString("authType")
  copyString("disabledReason")
  copyString("command")
  copyString("cwd")
  copyString("bearerTokenEnvVar")
  copyBoolean("enabled")
  copyBoolean("disabled")
  copyBoolean("_hasUrl")

  const url = sanitizeMcpUrlForPreview(config.url)
  if (url) safe.url = url

  const args = sanitizeMcpCommandArgs(config.args)
  if (args.length > 0) safe.args = args.map((arg) => arg.value)

  copyStringArray("envVars")
  const env = redactedObject(config.env)
  if (env) safe.env = env

  const headers = redactedObject(config.headers)
  if (headers) safe.headers = headers

  if (isRecord(config.envHttpHeaders)) {
    safe.envHttpHeaders = Object.fromEntries(
      Object.entries(config.envHttpHeaders)
        .filter(([key, value]) => key && typeof value === "string" && value.trim())
        .sort(([a], [b]) => a.localeCompare(b)),
    )
  }

  if (isRecord(config._oauth)) {
    safe.oauthFields = Object.keys(config._oauth)
      .filter(Boolean)
      .sort()
  }

  return safe
}
