import { stripCodexAnsi } from "./acp-spawn-probe"

const URL_CANDIDATE_REGEX = /https?:\/\/[^\s]+/g

export type CodexLoginOutputSession = {
  rawOutput: string
  output: string
  url: string | null
}

export function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  )
}

export function extractFirstNonLocalhostUrl(output: string): string | null {
  const matches = stripCodexAnsi(output).match(URL_CANDIDATE_REGEX)
  if (!matches) return null

  for (const match of matches) {
    try {
      const parsedUrl = new URL(match.trim().replace(/[),.;!?]+$/, ""))
      if (!isLocalhostHostname(parsedUrl.hostname)) {
        return parsedUrl.toString()
      }
    } catch {
      // Ignore invalid URL candidates.
    }
  }

  return null
}

export function redactCodexLoginUrlForDisplay(match: string): string {
  const trailingMatch = match.match(/[),.;!?]+$/)
  const trailing = trailingMatch?.[0] ?? ""
  const rawUrl = trailing ? match.slice(0, -trailing.length) : match

  try {
    const parsedUrl = new URL(rawUrl)
    if (isLocalhostHostname(parsedUrl.hostname)) {
      return match
    }

    const hadSearch = parsedUrl.search.length > 0
    const hadHash = parsedUrl.hash.length > 0
    parsedUrl.search = ""
    parsedUrl.hash = ""

    return [
      parsedUrl.toString(),
      hadSearch ? "?[redacted]" : "",
      hadHash ? "#[redacted]" : "",
      trailing,
    ].join("")
  } catch {
    return match
  }
}

export function redactCodexLoginOutput(output: string): string {
  return output
    .replace(URL_CANDIDATE_REGEX, redactCodexLoginUrlForDisplay)
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[redacted]")
    .replace(
      /("(?:access|refresh|id)_?token"\s*:\s*")[^"]+(")/gi,
      "$1[redacted]$2",
    )
    .replace(
      /\b((?:access|refresh|id)_?token|code|state|nonce|verifier)\s*=\s*[^\s]+/gi,
      "$1=[redacted]",
    )
}

export function appendCodexLoginOutput(
  session: CodexLoginOutputSession,
  chunk: string,
): void {
  const cleanChunk = stripCodexAnsi(chunk)
  if (!cleanChunk) return

  session.rawOutput += cleanChunk
  session.output += redactCodexLoginOutput(cleanChunk)

  if (!session.url) {
    session.url = extractFirstNonLocalhostUrl(session.rawOutput)
  }
}
