import { getOpenCodexWebBaseUrl } from "./app-identity"

export function resolveOpenCodexAuthApiBaseUrl(options: {
  isPackaged: boolean
  env?: Record<string, string | undefined>
}): string {
  return getOpenCodexWebBaseUrl(options.env)
}
