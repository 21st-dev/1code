/**
 * Shared configuration for the desktop app
 */

const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

/**
 * Get the API base URL
 * No longer used for OAuth - keeping for potential future use
 */
export function getApiUrl(): string {
  return "https://code.kosal.io"
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return IS_DEV
}
