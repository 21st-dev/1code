import {
  isOfficialCloudUrl,
  LOCAL_ONLY_BLOCKED_MESSAGE,
  shouldEnableLocalOnly,
} from "../../shared/local-only"

export { isOfficialCloudUrl, LOCAL_ONLY_BLOCKED_MESSAGE }

export class LocalOnlyBlockedError extends Error {
  code = "LOCAL_ONLY_BLOCKED"

  constructor(operation: string, url?: string | null) {
    super(
      url
        ? `${LOCAL_ONLY_BLOCKED_MESSAGE}: ${operation} (${url})`
        : `${LOCAL_ONLY_BLOCKED_MESSAGE}: ${operation}`,
    )
    this.name = "LocalOnlyBlockedError"
  }
}

export function isLocalOnlyMode(): boolean {
  return shouldEnableLocalOnly(
    process.env,
    import.meta.env as Record<string, string | undefined>,
  )
}

export function assertOfficialCloudAllowed(
  operation: string,
  url?: string | null,
): void {
  if (!isLocalOnlyMode()) return
  if (!url || isOfficialCloudUrl(url)) {
    throw new LocalOnlyBlockedError(operation, url)
  }
}

export function blockedOfficialCloudResponse(operation: string, url?: string) {
  const error = new LocalOnlyBlockedError(operation, url)
  return {
    ok: false,
    status: 451,
    data: null,
    error: error.message,
  }
}
