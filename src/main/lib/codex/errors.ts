import { redactProviderSecrets } from "../../../shared/provider-profile-security"

const AUTH_HINTS = [
  "not logged in",
  "authentication required",
  "auth required",
  "login required",
  "missing credentials",
  "no credentials",
  "unauthorized",
  "forbidden",
  "codex login",
  "401",
  "403",
]

export type CodexNormalizedError = {
  message: string
  code?: string
}

export type CodexErrorDiagnostics = {
  name: string | null
  code: string | null
  exitCode: number | null
}

export type CodexLoginOutputRedactor = (output: string) => string

export function extractCodexError(
  error: unknown,
  options: { redactLoginOutput?: CodexLoginOutputRedactor } = {},
): CodexNormalizedError {
  const anyError = error as any
  const message =
    anyError?.data?.message ||
    anyError?.errorText ||
    anyError?.message ||
    anyError?.error ||
    String(error)
  const code = anyError?.data?.code || anyError?.code

  const rawMessage = typeof message === "string" ? message : String(message)
  const redactedProviderMessage = redactProviderSecrets(rawMessage)
  const redactedMessage = options.redactLoginOutput
    ? options.redactLoginOutput(redactedProviderMessage)
    : redactedProviderMessage

  return {
    message: redactedMessage,
    code: typeof code === "string" ? code : undefined,
  }
}

export function getCodexErrorDiagnostics(
  error: unknown,
): CodexErrorDiagnostics {
  const anyError = error as any
  const code = anyError?.data?.code || anyError?.code || anyError?.cause?.code
  const exitCode =
    anyError?.data?.exitCode ??
    anyError?.exitCode ??
    anyError?.status ??
    anyError?.cause?.exitCode ??
    null

  return {
    name: typeof anyError?.name === "string" ? anyError.name : null,
    code: typeof code === "string" ? code : null,
    exitCode: typeof exitCode === "number" ? exitCode : null,
  }
}

export function isCodexAuthError(params: {
  message?: string | null
  code?: string | null
}): boolean {
  const searchableText = `${params.code || ""} ${params.message || ""}`.toLowerCase()
  return AUTH_HINTS.some((hint) => searchableText.includes(hint))
}
