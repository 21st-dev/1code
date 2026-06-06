import type { JsonValue, RunEventRedactionContext } from "./runtime-events"

const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|gateway[_-]?token|authorization|cookie|password|secret|client[_-]?secret|oauth)/i

const SECRET_TEXT_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /bearer\s+[A-Za-z0-9._-]+/gi,
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)=([A-Za-z0-9._~+/-]+)/gi,
]

export type RuntimeRedactionResult = {
  payload: JsonValue
  appliedRules: string[]
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function redactString(value: string, appliedRules: Set<string>): string {
  let redacted = value
  for (const pattern of SECRET_TEXT_PATTERNS) {
    if (pattern.test(redacted)) {
      appliedRules.add("secret-text")
      redacted = redacted.replace(pattern, (match) => {
        const separatorIndex = match.indexOf("=")
        if (separatorIndex > 0) {
          return `${match.slice(0, separatorIndex + 1)}<redacted>`
        }
        return "<redacted>"
      })
    }
    pattern.lastIndex = 0
  }
  return redacted
}

function redactValue(value: JsonValue, appliedRules: Set<string>): JsonValue {
  if (typeof value === "string") return redactString(value, appliedRules)
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, appliedRules))
  }
  if (!isJsonObject(value)) return value

  const output: { [key: string]: JsonValue } = {}
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      appliedRules.add("secret-key")
      output[key] = "<redacted>"
      continue
    }
    output[key] = redactValue(child, appliedRules)
  }
  return output
}

export function redactRuntimePayload(
  payload: JsonValue,
  _context: RunEventRedactionContext,
): RuntimeRedactionResult {
  const appliedRules = new Set<string>()
  return {
    payload: redactValue(payload, appliedRules),
    appliedRules: [...appliedRules].sort(),
  }
}
