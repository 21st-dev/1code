function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

export function getOpenCodexChangelogUrl(baseUrl: string, version?: string | null): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const versionAnchor = version ? `#v${version}` : ""
  return `${normalizedBaseUrl}/changelog${versionAnchor}`
}

export function getOpenCodexAgentsChangelogUrl(baseUrl: string, version?: string | null): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const versionAnchor = version ? `#${version}` : ""
  return `${normalizedBaseUrl}/agents/changelog${versionAnchor}`
}

export function getOpenCodexChangelogApiUrl(baseUrl: string, perPage: number): string {
  return `${normalizeBaseUrl(baseUrl)}/api/changelog/desktop?per_page=${perPage}`
}
