/**
 * API fetch helper for desktop app
 *
 * In the desktop app, relative fetch paths like "/api/..." don't work
 * because the app is loaded from a local file (file://...).
 * This helper provides the correct base URL for API requests.
 */

let cachedBaseUrl: string | null = null

/**
 * Get the API base URL (cached after first call)
 * Returns the configured API base URL
 */
export async function getApiBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl
  cachedBaseUrl = await window.desktopApi.getApiBaseUrl()
  return cachedBaseUrl
}

/**
 * Fetch wrapper that uses the correct API base URL
 * Use this instead of fetch() for API requests in the desktop app
 *
 * @param path - API path (e.g., "/api/tts")
 * @param init - Fetch init options
 * @param options.withCredentials - Include credentials (default: false for CORS compatibility)
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
  options?: { withCredentials?: boolean }
): Promise<Response> {
  const baseUrl = await getApiBaseUrl()
  return fetch(`${baseUrl}${path}`, {
    ...init,
    ...(options?.withCredentials && { credentials: "include" }),
  })
}
