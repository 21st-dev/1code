type HeaderValue = string | string[] | undefined

export function hasProviderGatewayAuthHeader(
  headers: Record<string, HeaderValue>,
  token: string,
): boolean {
  const authorization = headers.authorization
  const xApiKey = headers["x-api-key"]

  if (authorization === `Bearer ${token}`) return true
  if (Array.isArray(authorization) && authorization.includes(`Bearer ${token}`)) {
    return true
  }
  if (xApiKey === token) return true
  if (Array.isArray(xApiKey) && xApiKey.includes(token)) return true
  return false
}

export function redactProviderSecrets(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value)
  return text
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***")
    .replace(
      /("(?:access|refresh|id)_?token"\s*:\s*")[^"]+(")/gi,
      "$1***$2",
    )
    .replace(
      /\b((?:access|refresh|id)_?token|api[_-]?key|code|state|nonce|verifier)\s*=\s*[^\s&#]+/gi,
      "$1=***",
    )
    .replace(
      /([?&](?:access_token|refresh_token|id_token|api_key|code|state|nonce|verifier)=)[^&#\s]+/gi,
      "$1***",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "jwt-***")
}
