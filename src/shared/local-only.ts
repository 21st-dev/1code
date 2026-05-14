export const LOCAL_ONLY_BLOCKED_MESSAGE =
  "Local-only mode blocks hosted 1Code services"

const FALSE_VALUES = new Set(["0", "false", "off", "no"])

export function shouldEnableLocalOnly(
  env: Record<string, string | undefined> = {},
  viteEnv: Record<string, string | undefined> = {},
): boolean {
  const values = [
    env.ONECODE_LOCAL_ONLY,
    env.MAIN_VITE_LOCAL_ONLY,
    viteEnv.ONECODE_LOCAL_ONLY,
    viteEnv.MAIN_VITE_LOCAL_ONLY,
    viteEnv.VITE_LOCAL_ONLY,
  ]

  return !values.some((value) => {
    if (value === undefined || value === null) return false
    return FALSE_VALUES.has(String(value).trim().toLowerCase())
  })
}

export function isOfficialCloudHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  const blockedRoots = [
    "21st.dev",
    "1code.dev",
    "21st.sh",
    "e2b.app",
    "csb.app",
    "codesandbox.io",
  ]

  return blockedRoots.some((root) => host === root || host.endsWith(`.${root}`))
}

export function isOfficialCloudUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false
    }
    return isOfficialCloudHostname(parsed.hostname)
  } catch {
    return false
  }
}
