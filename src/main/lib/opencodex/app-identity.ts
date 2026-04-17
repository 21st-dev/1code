export const OPENCODEX_PRODUCT_NAME = "OpenCodex"
export const OPENCODEX_SUPPORT_EMAIL = "support@opencodex.local"
export const DEFAULT_OPENCODEX_WEB_BASE_URL = "https://opencodex.invalid"

export function getOpenCodexProtocol(isDev: boolean): string {
  return isDev ? "opencodex-dev" : "opencodex"
}

export function getOpenCodexAppUserModelId(isDev: boolean): string {
  return isDev ? "dev.opencodex.desktop.dev" : "dev.opencodex.desktop"
}

export function formatOpenCodexWindowTitle(options?: {
  badgeCount?: number | null
  title?: string | null
}): string {
  const title = options?.title?.trim()
  if (title) {
    return title
  }

  const badgeCount = options?.badgeCount ?? 0
  if (badgeCount > 0) {
    return `${OPENCODEX_PRODUCT_NAME} (${badgeCount})`
  }

  return OPENCODEX_PRODUCT_NAME
}

export function getOpenCodexAuthPageTitle(page: string): string {
  return `${OPENCODEX_PRODUCT_NAME} - ${page}`
}

export function getOpenCodexSupportUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const configuredUrl = env.OPENCODEX_HOME_URL?.trim()
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "")
  }

  return `mailto:${OPENCODEX_SUPPORT_EMAIL}`
}

export function getOpenCodexCopyright(year: number | string = new Date().getFullYear()): string {
  return `Copyright (c) ${year} ${OPENCODEX_PRODUCT_NAME}`
}

export function getOpenCodexAuthDeviceName(version: string, platform: string, arch: string): string {
  return `${OPENCODEX_PRODUCT_NAME} ${version} (${platform} ${arch})`
}

export function getOpenCodexTrustedHosts(baseUrl: string): string[] {
  const trusted: string[] = []

  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      trusted.push(parsed.hostname.toLowerCase())
    }
  } catch {
    // Ignore invalid or non-URL inputs; localhost remains trusted for dev callbacks.
  }

  for (const host of ["localhost", "127.0.0.1"]) {
    if (!trusted.includes(host)) {
      trusted.push(host)
    }
  }

  return trusted
}

export function getOpenCodexWebBaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const configuredUrl = env.OPENCODEX_WEB_URL?.trim() || env.MAIN_VITE_API_URL?.trim()
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "")
  }

  return DEFAULT_OPENCODEX_WEB_BASE_URL
}

export function getOpenCodexWebAppUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const rendererUrl = env.ELECTRON_RENDERER_URL?.trim()
  if (rendererUrl) {
    return rendererUrl
  }

  return `${getOpenCodexWebBaseUrl(env)}/agents`
}
