import { getOpenCodexWebBaseUrl } from "./opencodex/app-identity"
/**
 * Shared configuration for the desktop app
 */
import { app } from "electron"

const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

/**
 * Get the API base URL
 * In packaged app, ALWAYS use production URL to prevent localhost leaking into releases
 * In dev mode, allow override via MAIN_VITE_API_URL env variable
 */
export function getApiUrl(): string {
  return getOpenCodexWebBaseUrl({
    OPENCODEX_WEB_URL: process.env.OPENCODEX_WEB_URL,
    MAIN_VITE_API_URL: import.meta.env.MAIN_VITE_API_URL,
  })
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return IS_DEV
}
