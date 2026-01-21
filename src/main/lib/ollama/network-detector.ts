/**
 * Network connectivity detector
 * Checks if internet is available for Claude API
 */

import { isOfflineSimulated } from '../trpc/routers/debug'

export interface NetworkStatus {
  online: boolean
  lastCheck: number
}

let cachedStatus: NetworkStatus = {
  online: true,
  lastCheck: 0,
}

const CACHE_TTL = 10000 // 10 seconds cache

/**
 * Check if internet is available
 * Tries multiple endpoints for reliability
 */
export async function checkInternetConnection(): Promise<boolean> {
  // Check if offline mode is being simulated (for testing)
  if (isOfflineSimulated()) {
    console.log('[Network] Offline mode is being simulated (debug feature)')
    cachedStatus = { online: false, lastCheck: Date.now() }
    return false
  }

  const now = Date.now()

  // Return cached result if fresh
  if (now - cachedStatus.lastCheck < CACHE_TTL) {
    return cachedStatus.online
  }

  // Try multiple endpoints for more reliable detection
  const endpoints = [
    'https://api.anthropic.com',
    'https://www.google.com',
    'https://1.1.1.1', // Cloudflare DNS
  ]

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)

      const response = await fetch(endpoint, {
        method: 'HEAD',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // If we get any response, internet is available
      if (response.ok || response.status >= 400) {
        cachedStatus = { online: true, lastCheck: now }
        console.log(`[Network] Internet check: ONLINE (via ${endpoint})`)
        return true
      }
    } catch (error) {
      // Try next endpoint
      continue
    }
  }

  // All endpoints failed - likely offline
  cachedStatus = { online: false, lastCheck: now }
  console.log('[Network] Internet check: OFFLINE (all endpoints failed)')
  return false
}

/**
 * Clear cache to force next check
 */
export function clearNetworkCache(): void {
  cachedStatus = { online: true, lastCheck: 0 }
}
