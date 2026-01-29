import { execSync } from "child_process"
import os from "os"
import { publicProcedure, router } from "../index"

/**
 * Read Claude Code credentials from macOS System Keychain
 * This is where the Claude CLI stores its OAuth token with proper scopes
 */
function readSystemKeychainCredentials(): string | null {
  try {
    const username = os.userInfo().username
    const result = execSync(
      `security find-generic-password -s "Claude Code-credentials" -a "${username}" -w 2>/dev/null`,
      { encoding: "utf-8" }
    )
    return result.trim()
  } catch {
    // Item not found or error
    return null
  }
}

/**
 * Extract access token from Claude CLI credentials JSON
 */
function extractAccessToken(jsonData: string): string | null {
  try {
    const data = JSON.parse(jsonData)
    return data?.claudeAiOauth?.accessToken ?? null
  } catch {
    return null
  }
}

/**
 * Get OAuth token from system keychain (Claude CLI credentials)
 * This token has the proper scopes for usage API
 */
function getOAuthToken(): string | null {
  const keychainData = readSystemKeychainCredentials()

  if (!keychainData) {
    console.log("[ClaudeUsage] No credentials found in system keychain")
    return null
  }

  const token = extractAccessToken(keychainData)
  if (token) {
    console.log("[ClaudeUsage] Token from system keychain, length:", token.length)
  } else {
    console.log("[ClaudeUsage] Could not extract token from keychain data")
  }

  return token
}

/**
 * Parsed usage data returned to the client
 * Always includes all model breakdowns (defaulting to 0 if not used)
 */
export interface ClaudeUsageData {
  fiveHour: {
    utilization: number
    resetsAt: string | null
  }
  sevenDay: {
    utilization: number
    resetsAt: string | null
  }
  sevenDayOpus: {
    utilization: number
  }
  sevenDaySonnet: {
    utilization: number
    resetsAt: string | null
  }
  lastFetched: string
}

/**
 * Parse utilization value that can be Int, Double, or String
 * Based on claude-usage-tracker's robust parser
 */
function parseUtilization(value: unknown): number {
  if (typeof value === "number") {
    return value
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace("%", "")
    const parsed = parseFloat(cleaned)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Claude Usage Router
 * Fetches usage data from Anthropic's OAuth API
 */
export const claudeUsageRouter = router({
  /**
   * Get current usage stats
   */
  getUsage: publicProcedure.query(async (): Promise<{
    data: ClaudeUsageData | null
    error: string | null
  }> => {
    const token = getOAuthToken()

    if (!token) {
      return {
        data: null,
        error: "Not connected to Claude Code",
      }
    }

    try {
      console.log("[ClaudeUsage] Fetching from API...")
      const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "claude-code/2.1.5",
          "anthropic-beta": "oauth-2025-04-20",
        },
      })
      console.log("[ClaudeUsage] Response status:", response.status)

      if (response.status === 401 || response.status === 403) {
        const body = await response.text()
        console.error("[ClaudeUsage] Auth failed:", response.status, body)
        return {
          data: null,
          error: "Token expired or invalid. Please reconnect Claude Code.",
        }
      }

      if (response.status === 429) {
        return {
          data: null,
          error: "Rate limited. Please try again later.",
        }
      }

      if (!response.ok) {
        console.error("[ClaudeUsage] API error:", response.status, response.statusText)
        return {
          data: null,
          error: `API error: ${response.status}`,
        }
      }

      const rawData = await response.json() as Record<string, unknown>

      // Debug: log raw API response
      console.log("[ClaudeUsage] Raw API response:", JSON.stringify(rawData, null, 2))

      // Parse each section with robust type handling (matching claude-usage-tracker)
      const fiveHour = rawData.five_hour as Record<string, unknown> | undefined
      const sevenDay = rawData.seven_day as Record<string, unknown> | undefined
      const sevenDayOpus = rawData.seven_day_opus as Record<string, unknown> | undefined
      const sevenDaySonnet = rawData.seven_day_sonnet as Record<string, unknown> | undefined

      const data: ClaudeUsageData = {
        fiveHour: {
          utilization: fiveHour ? parseUtilization(fiveHour.utilization) : 0,
          resetsAt: (fiveHour?.resets_at as string) ?? null,
        },
        sevenDay: {
          utilization: sevenDay ? parseUtilization(sevenDay.utilization) : 0,
          resetsAt: (sevenDay?.resets_at as string) ?? null,
        },
        // Always include model breakdowns (default to 0 if not present)
        sevenDayOpus: {
          utilization: sevenDayOpus ? parseUtilization(sevenDayOpus.utilization) : 0,
        },
        sevenDaySonnet: {
          utilization: sevenDaySonnet ? parseUtilization(sevenDaySonnet.utilization) : 0,
          resetsAt: (sevenDaySonnet?.resets_at as string) ?? null,
        },
        lastFetched: new Date().toISOString(),
      }

      return { data, error: null }
    } catch (error) {
      console.error("[ClaudeUsage] Fetch error:", error)
      return {
        data: null,
        error: "Network error. Please check your connection.",
      }
    }
  }),
})
