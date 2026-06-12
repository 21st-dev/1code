export const DEFAULT_CODEX_MODEL = "gpt-5.5/high"

export function extractCodexModelId(rawModel: unknown): string | undefined {
  if (typeof rawModel !== "string" || rawModel.length === 0) {
    return undefined
  }

  const normalizedModel = rawModel.trim()

  if (!normalizedModel || normalizedModel === "codex") {
    return undefined
  }

  return normalizedModel
}

export function preprocessCodexModelName(params: {
  modelId: string
  hasAppManagedApiKey?: boolean
}): string {
  if (!params.hasAppManagedApiKey) {
    return params.modelId
  }

  return params.modelId
}

export function normalizeCodexAppServerModelId(modelId: string): string {
  return modelId.replace(/\/(?:low|medium|high|xhigh)$/, "")
}

export function resolveCodexSelectedModelId(params: {
  requestedModel: unknown
  hasAppManagedApiKey?: boolean
}): string {
  return preprocessCodexModelName({
    modelId: extractCodexModelId(params.requestedModel) || DEFAULT_CODEX_MODEL,
    hasAppManagedApiKey: params.hasAppManagedApiKey,
  })
}
