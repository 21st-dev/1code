/**
 * Shared configuration for the desktop app
 */
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL
const HOSTED_API_BASE_URL = import.meta.env.MAIN_VITE_API_URL || ""

/**
 * Get the optional hosted API base URL.
 */
export function getApiUrl(): string {
  return HOSTED_API_BASE_URL
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return IS_DEV
}
