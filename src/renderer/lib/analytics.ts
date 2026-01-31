/**
 * PostHog analytics for 1Code Desktop - Renderer Process
 * Uses PostHog JS SDK for client-side tracking
 */

import posthog from "posthog-js"

// PostHog configuration from environment
const POSTHOG_DESKTOP_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com"

let initialized = false
let currentUserId: string | null = null
let appVersion: string | null = null
let appPlatform: string | null = null
let appArch: string | null = null

// Check if we're in development mode
// Renderer can't access env vars directly, so we check a global flag
const isDev = typeof window !== "undefined" &&
  window.location.hostname === "localhost" &&
  !(window as any).__FORCE_ANALYTICS__

/**
 * Check if user has opted out of analytics
 * Reads directly from localStorage to avoid circular dependencies
 */
function isOptedOut(): boolean {
  try {
    const optOut = localStorage.getItem("preferences:analytics-opt-out")
    return optOut === "true"
  } catch {
    return false
  }
}

/**
 * Get common properties for all events
 */
function getCommonProperties() {
  return {
    app_version: appVersion,
    platform: appPlatform,
    arch: appArch,
    source: "desktop_renderer",
  }
}

/**
 * Initialize PostHog for renderer process
 */
export async function initAnalytics() {
  // Skip in development mode
  if (isDev) return

  if (initialized) return

  // Skip if no PostHog key configured
  if (!POSTHOG_DESKTOP_KEY) {
    console.log("[Analytics] Skipping PostHog initialization (no key configured)")
    return
  }

  // Get app info from main process
  try {
    if (window.desktopApi?.getVersion) {
      appVersion = await window.desktopApi.getVersion()
    }
    if (window.desktopApi?.platform) {
      appPlatform = window.desktopApi.platform
    }
    if (window.desktopApi?.arch) {
      appArch = window.desktopApi.arch
    }
  } catch (error) {
    console.warn("[Analytics] Failed to get app info:", error)
  }

  posthog.init(POSTHOG_DESKTOP_KEY, {
    api_host: POSTHOG_HOST,
    // Disable automatic tracking - we track manually
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    // Privacy settings
    person_profiles: "identified_only",
    persistence: "localStorage",
  })

  initialized = true
}

/**
 * Capture an analytics event
 */
export function capture(
  eventName: string,
  properties?: Record<string, any>,
) {
  // Skip in development mode
  if (isDev) return

  // Skip if user opted out
  if (isOptedOut()) return

  if (!initialized) return

  posthog.capture(eventName, {
    ...getCommonProperties(),
    ...properties,
  })
}

/**
 * Identify a user
 */
export function identify(
  userId: string,
  traits?: Record<string, any>,
) {
  currentUserId = userId

  // Skip in development mode
  if (isDev) return

  // Skip if user opted out
  if (isOptedOut()) return

  if (!initialized) return

  posthog.identify(userId, {
    ...getCommonProperties(),
    ...traits,
  })
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
  if (initialized) {
    posthog.reset()
  }
}

/**
 * Shutdown PostHog
 */
export function shutdown() {
  if (initialized) {
    posthog.reset()
    initialized = false
  }
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
  mode: "plan" | "agent" | "ask"
}) {
  capture("message_sent", {
    workspace_id: data.workspaceId,
    message_length: data.messageLength,
    mode: data.mode,
  })
}

