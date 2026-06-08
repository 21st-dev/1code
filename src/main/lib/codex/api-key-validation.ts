import { normalizeCodexApiKey } from "../../../shared/codex-api-key"
import { redactProviderSecrets } from "../../../shared/provider-profile-security"

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export type CodexApiKeyValidationCategory =
  | "invalid_format"
  | "auth_failed"
  | "rate_limited"
  | "request_failed"
  | "network_failed"
  | "cancelled"

export type CodexApiKeyValidationResult =
  | {
      ok: true
    }
  | {
      ok: false
      category: CodexApiKeyValidationCategory
      status: "needs-auth" | "failed"
      message: string
      hint: string
      httpStatus?: number
    }

export type CodexApiKeyValidationOptions = {
  fetchImpl?: FetchLike
  signal?: AbortSignal
  timeoutMs?: number
  modelsUrl?: string
}

const DEFAULT_OPENAI_MODELS_URL = "https://api.openai.com/v1/models"
const DEFAULT_VALIDATION_TIMEOUT_MS = 8_000

export class CodexApiKeyValidationError extends Error {
  category: CodexApiKeyValidationCategory
  status: "needs-auth" | "failed"
  hint: string
  httpStatus?: number

  constructor(result: Extract<CodexApiKeyValidationResult, { ok: false }>) {
    super(result.hint ? `${result.message} ${result.hint}` : result.message)
    this.name = "CodexApiKeyValidationError"
    this.category = result.category
    this.status = result.status
    this.hint = result.hint
    this.httpStatus = result.httpStatus
  }
}

function createAbortController(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal?.reason)

  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason)
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true })
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Codex API key validation timed out."))
  }, timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      parentSignal?.removeEventListener("abort", abortFromParent)
    },
  }
}

function parseProviderErrorMessage(rawBody: string): string | null {
  if (!rawBody.trim()) return null

  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: unknown; code?: unknown; type?: unknown } | string
      message?: unknown
    }
    if (typeof parsed.error === "string") return parsed.error
    if (typeof parsed.error?.message === "string") return parsed.error.message
    if (typeof parsed.message === "string") return parsed.message
  } catch {
    // Plain-text error bodies are handled below.
  }

  return rawBody
}

function redactedProviderMessage(rawBody: string, apiKey: string): string | null {
  const message = parseProviderErrorMessage(rawBody)
  if (!message) return null
  return redactProviderSecrets(message, [apiKey])
}

function validationFailure(params: {
  category: CodexApiKeyValidationCategory
  status: "needs-auth" | "failed"
  message: string
  hint: string
  httpStatus?: number
}): CodexApiKeyValidationResult {
  return {
    ok: false,
    category: params.category,
    status: params.status,
    message: params.message,
    hint: params.hint,
    ...(params.httpStatus !== undefined ? { httpStatus: params.httpStatus } : {}),
  }
}

function classifyHttpFailure(
  httpStatus: number,
): Pick<Extract<CodexApiKeyValidationResult, { ok: false }>, "category" | "status" | "message" | "hint"> {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      category: "auth_failed",
      status: "needs-auth",
      message: `OpenAI rejected the saved Codex API key (${httpStatus}).`,
      hint: "Save a valid OpenAI API key in Settings > Models before starting Codex.",
    }
  }

  if (httpStatus === 429) {
    return {
      category: "rate_limited",
      status: "failed",
      message: "OpenAI rate-limited Codex API key validation.",
      hint: "Try again later, or use a different API key with available quota.",
    }
  }

  return {
    category: "request_failed",
    status: "failed",
    message: `OpenAI API key validation failed with HTTP ${httpStatus}.`,
    hint: "Check OpenAI API availability, billing, and key permissions before starting Codex.",
  }
}

export async function validateCodexApiKey(
  apiKey: string,
  options: CodexApiKeyValidationOptions = {},
): Promise<CodexApiKeyValidationResult> {
  const normalized = normalizeCodexApiKey(apiKey)
  if (!normalized) {
    return validationFailure({
      category: "invalid_format",
      status: "needs-auth",
      message: "Codex API key format is invalid.",
      hint: "Use an OpenAI API key that starts with sk-.",
    })
  }

  const timeout = Math.max(1, options.timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS)
  const { signal, cleanup } = createAbortController(options.signal, timeout)
  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(
      options.modelsUrl ?? DEFAULT_OPENAI_MODELS_URL,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${normalized}`,
        },
        signal,
      },
    )

    if (response.ok) {
      return { ok: true }
    }

    const rawBody = await response.text().catch(() => "")
    const classified = classifyHttpFailure(response.status)
    const upstreamMessage = redactedProviderMessage(rawBody, normalized)
    return validationFailure({
      ...classified,
      message: upstreamMessage
        ? `${classified.message} ${upstreamMessage}`
        : classified.message,
      httpStatus: response.status,
    })
  } catch (error) {
    if (signal.aborted) {
      return validationFailure({
        category: options.signal?.aborted ? "cancelled" : "network_failed",
        status: "failed",
        message: options.signal?.aborted
          ? "Codex API key validation was cancelled."
          : "Codex API key validation timed out.",
        hint: "Try again when the OpenAI API is reachable.",
      })
    }

    const message = error instanceof Error ? error.message : String(error)
    const redacted = redactProviderSecrets(message, [normalized])
    return validationFailure({
      category: "network_failed",
      status: "failed",
      message: `Codex API key validation could not reach OpenAI: ${redacted}`,
      hint: "Check network connectivity before starting Codex.",
    })
  } finally {
    cleanup()
  }
}

export async function assertValidCodexApiKey(
  apiKey: string,
  options: CodexApiKeyValidationOptions = {},
): Promise<void> {
  const result = await validateCodexApiKey(apiKey, options)
  if (!result.ok) {
    throw new CodexApiKeyValidationError(result)
  }
}
