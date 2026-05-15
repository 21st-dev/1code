/**
 * Local-first renderer analytics boundary.
 *
 * Hosted telemetry is not part of the default product. Keep these helpers as
 * no-ops so UI code does not need telemetry-specific branching.
 */

let currentUserId: string | null = null

/**
 * Initialize analytics for renderer process
 */
export async function initAnalytics() {
  console.log("[Analytics] Hosted telemetry removed from local-first build")
}

/**
 * Capture an analytics event
 */
export function capture(
  eventName: string,
  properties?: Record<string, any>,
) {
  void eventName
  void properties
}

/**
 * Identify a user
 */
export function identify(
  userId: string,
  traits?: Record<string, any>,
) {
  currentUserId = userId
  void traits
}

/**
 * Get current user ID
 */
export function getCurrentUserId(): string | null {
  return currentUserId
}

/**
 * Reset user identification (on logout)
 */
export function reset() {
  currentUserId = null
}

/**
 * Shutdown analytics
 */
export function shutdown() {
  return
}

// ============================================================================
// Specific event helpers (for renderer-specific events)
// ============================================================================

/**
 * Track message sent from UI
 */
export function trackMessageSent(data: {
  workspaceId: string
  messageLength: number
  mode: "plan" | "agent"
}) {
  capture("message_sent", {
    workspace_id: data.workspaceId,
    message_length: data.messageLength,
    mode: data.mode,
  })
}
