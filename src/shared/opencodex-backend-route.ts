export type OpenCodexBackendProviderFamily =
  | "openai-compatible"
  | "anthropic-compatible"

export type OpenCodexBackendRouteKind =
  | "codex-subscription"
  | "claude-subscription"
  | "openai-compatible-api"
  | "anthropic-compatible-api"
  | "custom-endpoint"

export type OpenCodexBackendRoute =
  | {
      kind: "codex-subscription"
      authSource: "codex-local-auth"
    }
  | {
      kind: "claude-subscription"
      authSource: "claude-local-auth"
    }
  | {
      kind: "openai-compatible-api"
      authSource: "api-key"
      baseUrl: string
      model: string
      apiKey: string
    }
  | {
      kind: "anthropic-compatible-api"
      authSource: "api-key"
      baseUrl: string
      model: string
      apiKey: string
    }
  | {
      kind: "custom-endpoint"
      authSource: "api-key"
      providerFamily: OpenCodexBackendProviderFamily
      baseUrl: string
      model: string
      apiKey: string
    }

type LegacyOpenCodexBackendConfig = {
  providerFamily: "openai-compatible" | "anthropic-compatible" | "custom"
  baseUrl: string
  model: string
  apiKey: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  return value.trim()
}

function isValidOpenAiStyleKey(apiKey: string): boolean {
  return apiKey.startsWith("sk-")
}

function isValidAnthropicKey(apiKey: string): boolean {
  return apiKey.startsWith("sk-ant-") && apiKey.length > 20
}

function normalizeApiRouteFields(
  input: Record<string, unknown>,
): {
  baseUrl: string
  model: string
  apiKey: string
} | null {
  const baseUrl = normalizeText(input.baseUrl)
  const model = normalizeText(input.model)
  const apiKey = normalizeText(input.apiKey)

  if (!baseUrl || !model || !apiKey) {
    return null
  }

  return { baseUrl, model, apiKey }
}

function normalizeUnionRoute(input: Record<string, unknown>): OpenCodexBackendRoute | null {
  const kind = normalizeText(input.kind) as OpenCodexBackendRouteKind | null
  if (!kind) {
    return null
  }

  switch (kind) {
    case "codex-subscription":
      return input.authSource === "codex-local-auth"
        ? { kind, authSource: "codex-local-auth" }
        : null
    case "claude-subscription":
      return input.authSource === "claude-local-auth"
        ? { kind, authSource: "claude-local-auth" }
        : null
    case "openai-compatible-api": {
      if (input.authSource !== "api-key") {
        return null
      }
      const fields = normalizeApiRouteFields(input)
      if (!fields || !isValidOpenAiStyleKey(fields.apiKey)) {
        return null
      }
      return { kind, authSource: "api-key", ...fields }
    }
    case "anthropic-compatible-api": {
      if (input.authSource !== "api-key") {
        return null
      }
      const fields = normalizeApiRouteFields(input)
      if (!fields || !isValidAnthropicKey(fields.apiKey)) {
        return null
      }
      return { kind, authSource: "api-key", ...fields }
    }
    case "custom-endpoint": {
      if (input.authSource !== "api-key") {
        return null
      }
      const providerFamily = normalizeText(
        input.providerFamily,
      ) as OpenCodexBackendProviderFamily | null
      if (
        providerFamily !== "openai-compatible" &&
        providerFamily !== "anthropic-compatible"
      ) {
        return null
      }
      const fields = normalizeApiRouteFields(input)
      if (!fields) {
        return null
      }
      const isValidKey =
        providerFamily === "anthropic-compatible"
          ? isValidAnthropicKey(fields.apiKey)
          : isValidOpenAiStyleKey(fields.apiKey)
      if (!isValidKey) {
        return null
      }
      return { kind, authSource: "api-key", providerFamily, ...fields }
    }
  }
}

function normalizeLegacyRoute(
  input: Record<string, unknown>,
): OpenCodexBackendRoute | null {
  const providerFamily = normalizeText(input.providerFamily)
  if (
    providerFamily !== "openai-compatible" &&
    providerFamily !== "anthropic-compatible" &&
    providerFamily !== "custom"
  ) {
    return null
  }

  const fields = normalizeApiRouteFields(input)
  if (!fields) {
    return null
  }

  if (providerFamily === "openai-compatible") {
    if (!isValidOpenAiStyleKey(fields.apiKey)) {
      return null
    }
    return {
      kind: "openai-compatible-api",
      authSource: "api-key",
      ...fields,
    }
  }

  if (providerFamily === "anthropic-compatible") {
    if (!isValidAnthropicKey(fields.apiKey)) {
      return null
    }
    return {
      kind: "anthropic-compatible-api",
      authSource: "api-key",
      ...fields,
    }
  }

  if (!isValidOpenAiStyleKey(fields.apiKey)) {
    return null
  }

  return {
    kind: "custom-endpoint",
    authSource: "api-key",
    providerFamily: "openai-compatible",
    ...fields,
  }
}

export function getOpenCodexBackendRouteTemplate(
  kind: OpenCodexBackendRouteKind,
): OpenCodexBackendRoute {
  switch (kind) {
    case "codex-subscription":
      return { kind, authSource: "codex-local-auth" }
    case "claude-subscription":
      return { kind, authSource: "claude-local-auth" }
    case "anthropic-compatible-api":
      return {
        kind,
        authSource: "api-key",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-6",
        apiKey: "",
      }
    case "custom-endpoint":
      return {
        kind,
        authSource: "api-key",
        providerFamily: "openai-compatible",
        baseUrl: "http://127.0.0.1:8000/v1",
        model: "opencodex-default",
        apiKey: "",
      }
    default:
      return {
        kind,
        authSource: "api-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.2",
        apiKey: "",
      }
  }
}

export function normalizeOpenCodexBackendRoute(
  route: OpenCodexBackendRoute,
): OpenCodexBackendRoute | undefined {
  return parseOpenCodexBackendRoute(route) ?? undefined
}

export function parseOpenCodexBackendRoute(
  value: unknown,
): OpenCodexBackendRoute | null {
  if (!isRecord(value)) {
    return null
  }

  if ("kind" in value) {
    return normalizeUnionRoute(value)
  }

  return normalizeLegacyRoute(value)
}

export function getOpenCodexBackendRouteTitle(
  route: OpenCodexBackendRoute,
): string {
  switch (route.kind) {
    case "codex-subscription":
      return "Codex Subscription"
    case "claude-subscription":
      return "Claude Subscription"
    case "openai-compatible-api":
      return "OpenAI-Compatible API"
    case "anthropic-compatible-api":
      return "Anthropic-Compatible API"
    case "custom-endpoint":
      return "Custom Endpoint"
  }
}

export function getOpenCodexBackendProviderFamily(
  route: OpenCodexBackendRoute,
): OpenCodexBackendProviderFamily | null {
  switch (route.kind) {
    case "openai-compatible-api":
      return "openai-compatible"
    case "anthropic-compatible-api":
      return "anthropic-compatible"
    case "custom-endpoint":
      return route.providerFamily
    default:
      return null
  }
}

export function getOpenCodexBackendRuntimeKind(
  route: OpenCodexBackendRoute,
): "codex" | "claude" {
  switch (route.kind) {
    case "codex-subscription":
    case "openai-compatible-api":
      return "codex"
    default:
      return "claude"
  }
}

export function openCodexBackendRouteRequiresHost(
  route: OpenCodexBackendRoute,
): boolean {
  return (
    route.kind === "openai-compatible-api" ||
    route.kind === "anthropic-compatible-api" ||
    route.kind === "custom-endpoint"
  )
}

export type { LegacyOpenCodexBackendConfig }