export const OPENCODEX_COMMUNITY_URL =
  import.meta.env.VITE_OPENCODEX_COMMUNITY_URL ||
  import.meta.env.VITE_FEEDBACK_URL ||
  "https://discord.gg/8ektTZGnj4"

export const OPENCODEX_CHANGELOG_URL =
  import.meta.env.VITE_OPENCODEX_CHANGELOG_URL ||
  "https://1code.dev/changelog"

export const OPENCODEX_AGENTS_CHANGELOG_URL =
  import.meta.env.VITE_OPENCODEX_AGENTS_CHANGELOG_URL ||
  "https://1code.dev/agents/changelog"

export const OPENCODEX_CHANGELOG_FEED_URL =
  import.meta.env.VITE_OPENCODEX_CHANGELOG_FEED_URL ||
  "https://21st.dev/api/changelog/desktop?per_page=3"

function appendHash(url: string, hash?: string): string {
  if (!hash) return url
  return `${url}#${hash}`
}

export function buildOpenCodexChangelogUrl(version?: string): string {
  return appendHash(OPENCODEX_CHANGELOG_URL, version)
}

export function buildOpenCodexAgentsChangelogUrl(version?: string): string {
  return appendHash(OPENCODEX_AGENTS_CHANGELOG_URL, version)
}
