/**
 * PostHog analytics for 1Code Desktop - Main Process
 * Uses PostHog Node.js SDK for server-side tracking
 */

import { PostHog } from "posthog-node"
import { app } from "electron"
import * as fs from "fs"
import * as path from "path"

// PostHog configuration - hardcoded key for opensource users, env var override for internal builds
// This enables analytics for all users including those building from source
const POSTHOG_DESKTOP_KEY = import.meta.env.MAIN_VITE_POSTHOG_KEY || "phc_wM7gbrJhOLTvynyhnhPkrVGDc5mKRSXsLGQHqM3T3vq"
const POSTHOG_HOST = import.meta.env.MAIN_VITE_POSTHOG_HOST || "https://us.i.posthog.com"

let posthog: PostHog | null = null
let currentUserId: string | null = null
let userOptedOut = false // Synced from renderer

// track first launch using a marker file
const FIRST_LAUNCH_MARKER = ".first_launch_tracked"

function getFirstLaunchMarkerPath(): string {
  try {
    return path.join(app.getPath("userData"), FIRST_LAUNCH_MARKER)
  } catch {
    // app not ready yet
    return ""
  }
}

function isFirstLaunch(): boolean {
  const markerPath = getFirstLaunchMarkerPath()
  if (!markerPath) return false

  try {
    return !fs.existsSync(markerPath)
  } catch {
    return false
  }
}

function markFirstLaunchTracked(): void {
  const markerPath = getFirstLaunchMarkerPath()
  if (!markerPath) return

  try {
    fs.writeFileSync(markerPath, new Date().toISOString())
  } catch {
    // ignore errors writing marker
  }
}

// Cached user properties for analytics enrichment
let cachedSubscriptionPlan: string | null = null
let cachedConnectionMethod: string | null = null

// Check if we're in development mode
// Set FORCE_ANALYTICS=true to test analytics in development
// Use a function to check lazily after app is ready
function isDev(): boolean {
  try {
    return !app.isPackaged && process.env.FORCE_ANALYTICS !== "true"
  } catch {
    // App not ready yet, assume dev mode
    return process.env.FORCE_ANALYTICS !== "true"
  }
}

/**
 * Get common properties for all events
 */
function getCommonProperties() {
  return {
    source: "desktop", // Unified source for desktop vs web analytics
    app_version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron_version: process.versions.electron,
    node_version: process.versions.node,
    // Analytics enrichment properties
    subscription_plan: cachedSubscriptionPlan,
    connection_method: cachedConnectionMethod,
  }
}

/**
 * Set opt-out status (called from renderer when user preference changes)
 */
export function setOptOut(optedOut: boolean) {
  userOptedOut = optedOut
}

/**
 * Set subscription plan (called after fetching from API)
 */
export function setSubscriptionPlan(plan: string) {
  cachedSubscriptionPlan = plan
}

/**
 * Set connection method (called from renderer via IPC)
 * Values: "claude-subscription" | "api-key" | "custom-model"
 */
export function setConnectionMethod(method: string) {
  cachedConnectionMethod = method
}

/**
 * Initialize PostHog for main process
 */
export function initAnalytics() {
  // Skip in development mode
  if (isDev()) return

  if (posthog) return

  // Skip if no PostHog key configured
  if (!POSTHOG_DESKTOP_KEY) {
    console.log("[Analytics] Skipping PostHog initialization (no key configured)")
    return
  }

  posthog = new PostHog(POSTHOG_DESKTOP_KEY, {
    host: POSTHOG_HOST,
    // Flush events every 30 seconds or when 20 events are queued
    flushAt: 20,
    flushInterval: 30000,
  })
}

/**
 * Capture an analytics event
 */
export function capture(
  eventName: string,
  properties?: Record<string, any>,
) {
  // Skip in development mode
  if (isDev()) return

  // Skip if user opted out
  if (userOptedOut) return

  if (!posthog) return

  const distinctId = currentUserId || "anonymous"

  posthog.capture({
    distinctId,
    event: eventName,
    properties: {
      ...getCommonProperties(),
      ...properties,
    },
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
  if (isDev()) return

  // Skip if user opted out
  if (userOptedOut) return

  if (!posthog) return

  posthog.identify({
    distinctId: userId,
    properties: {
      ...getCommonProperties(),
      ...traits,
    },
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
  // Reset cached analytics properties
  cachedSubscriptionPlan = null
  cachedConnectionMethod = null
  // PostHog Node.js SDK doesn't have a reset method
  // Events will be sent as anonymous until next identify
}

/**
 * Shutdown PostHog and flush pending events
 */
export async function shutdown() {
  if (posthog) {
    await posthog.shutdown()
    posthog = null
  }
}

// ============================================================================
// Specific event helpers
// ============================================================================

/**
 * Track app opened event
 */
export function trackAppOpened() {
  const firstLaunch = isFirstLaunch()

  capture("desktop_opened", {
    first_launch: firstLaunch,
  })

  if (firstLaunch) {
    // mark as tracked so subsequent opens don't count as first launch
    markFirstLaunchTracked()

    // also fire a separate first_launch event for funnel analysis
    capture("first_launch", {
      app_version: app.getVersion(),
      platform: process.platform,
    })
  }
}

/**
 * Track successful authentication
 */
export function trackAuthCompleted(userId: string, email?: string) {
  identify(userId, email ? { email } : undefined)
  capture("auth_completed", {
    user_id: userId,
  })
}

/**
 * Track project opened
 */
export function trackProjectOpened(project: {
  id: string
  hasGitRemote: boolean
}) {
  capture("project_opened", {
    project_id: project.id,
    has_git_remote: project.hasGitRemote,
  })
}

/**
 * Track workspace/chat created
 */
export function trackWorkspaceCreated(workspace: {
  id: string
  projectId: string
  useWorktree: boolean
  repository?: string
}) {
  capture("workspace_created", {
    workspace_id: workspace.id,
    project_id: workspace.projectId,
    use_worktree: workspace.useWorktree,
    repository: workspace.repository,
  })
}

/**
 * Track workspace archived
 */
export function trackWorkspaceArchived(workspaceId: string) {
  capture("workspace_archived", {
    workspace_id: workspaceId,
  })
}

/**
 * Track workspace deleted
 */
export function trackWorkspaceDeleted(workspaceId: string) {
  capture("workspace_deleted", {
    workspace_id: workspaceId,
  })
}

/**
 * Track message sent
 */
export function trackMessageSent(data: {
  workspaceId: string
  subChatId?: string
  mode: "plan" | "agent" | "ask"
}) {
  capture("message_sent", {
    workspace_id: data.workspaceId,
    sub_chat_id: data.subChatId,
    mode: data.mode,
  })
}

/**
 * Track PR created
 */
export function trackPRCreated(data: {
  workspaceId: string
  prNumber: number
  repository?: string
  mode?: "worktree" | "local"
}) {
  capture("pr_created", {
    workspace_id: data.workspaceId,
    pr_number: data.prNumber,
    repository: data.repository,
    mode: data.mode,
  })
}

/**
 * Track commit created
 */
export function trackCommitCreated(data: {
  workspaceId: string
  filesChanged: number
  mode: "worktree" | "local"
}) {
  capture("commit_created", {
    workspace_id: data.workspaceId,
    files_changed: data.filesChanged,
    mode: data.mode,
  })
}

/**
 * Track sub-chat created
 */
export function trackSubChatCreated(data: {
  workspaceId: string
  subChatId: string
}) {
  capture("sub_chat_created", {
    workspace_id: data.workspaceId,
    sub_chat_id: data.subChatId,
  })
}
