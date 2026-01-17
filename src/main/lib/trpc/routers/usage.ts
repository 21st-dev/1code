import { router, publicProcedure } from "../index"
import { execSync } from "child_process"

function getClaudeCodeTokenFromKeychain(): string | null {
  try {
    const output = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim()

    if (!output) {
      return null
    }

    const credentials = JSON.parse(output)
    return credentials?.claudeAiOauth?.accessToken || null
  } catch (error) {
    console.error("[usage] Error getting token from keychain:", error)
    return null
  }
}

interface AnthropicUsageResponse {
  five_hour: {
    utilization: number
    resets_at: string | null
  } | null
  seven_day: {
    utilization: number
    resets_at: string | null
  } | null
  seven_day_oauth_apps: unknown
  seven_day_opus: {
    utilization: number
    resets_at: string | null
  } | null
}

async function fetchAnthropicUsage(token: string): Promise<AnthropicUsageResponse | null> {
  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "claude-code/2.0.32",
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.error("[usage] Anthropic API error:", response.status, response.statusText)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("[usage] Failed to fetch Anthropic usage:", error)
    return null
  }
}

export const usageRouter = router({
  getCurrentUsage: publicProcedure.query(async () => {
    const token = getClaudeCodeTokenFromKeychain()

    if (!token) {
      return {
        source: "unavailable" as const,
        error: "Not connected to Claude Code",
        session: null,
        weekly: null,
      }
    }

    const usage = await fetchAnthropicUsage(token)

    if (!usage) {
      return {
        source: "unavailable" as const,
        error: "Failed to fetch usage data",
        session: null,
        weekly: null,
      }
    }

    const fiveHour = usage.five_hour
    const sevenDay = usage.seven_day

    const toPercentage = (util: number) => {
      if (util > 1) return Math.round(util)
      return Math.round(util * 100)
    }

    const formatResetTimeLocal = (isoString: string) => {
      const date = new Date(isoString)
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const now = new Date()
      const isToday = date.toDateString() === now.toDateString()
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const isTomorrow = date.toDateString() === tomorrow.toDateString()

      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: date.getMinutes() > 0 ? "2-digit" : undefined,
        hour12: true,
      }).toLowerCase()

      if (isToday) {
        return `Resets ${timeStr} (${timeZone})`
      } else if (isTomorrow) {
        return `Resets tomorrow ${timeStr} (${timeZone})`
      } else {
        const dateStr = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        return `Resets ${dateStr}, ${timeStr} (${timeZone})`
      }
    }

    return {
      source: "api" as const,
      session: fiveHour
        ? {
            percentage: toPercentage(fiveHour.utilization),
            resetAt: fiveHour.resets_at,
            resetLabel: fiveHour.resets_at
              ? formatResetTimeLocal(fiveHour.resets_at)
              : null,
          }
        : null,
      weekly: sevenDay
        ? {
            percentage: toPercentage(sevenDay.utilization),
            resetAt: sevenDay.resets_at,
            resetLabel: sevenDay.resets_at
              ? formatResetTimeLocal(sevenDay.resets_at)
              : null,
          }
        : null,
      opus: usage.seven_day_opus
        ? {
            percentage: toPercentage(usage.seven_day_opus.utilization),
          }
        : null,
    }
  }),
})
