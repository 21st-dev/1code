"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { isDesktopApp } from "../../../lib/utils/platform"

// Track pending notifications count for badge
const pendingNotificationsAtom = atomWithStorage<number>(
  "desktop-pending-notifications",
  0,
)

// Track window focus state
let isWindowFocused = true

/**
 * Hook to manage desktop notifications and badge count
 * - Shows native notifications when window is not focused
 * - Updates dock badge with pending notification count
 * - Clears badge when window regains focus
 */
export function useDesktopNotifications() {
  const [pendingCount, setPendingCount] = useAtom(pendingNotificationsAtom)
  const isInitialized = useRef(false)

  // Subscribe to window focus changes
  useEffect(() => {
    if (!isDesktopApp() || typeof window === "undefined") return

    // Initialize focus state
    isWindowFocused = document.hasFocus()

    const handleFocus = () => {
      isWindowFocused = true
      // Clear badge when window gains focus
      setPendingCount(0)
      window.desktopApi?.setBadge(null)
    }

    const handleBlur = () => {
      isWindowFocused = false
    }

    // Use both window events and Electron API
    window.addEventListener("focus", handleFocus)
    window.addEventListener("blur", handleBlur)

    // Also subscribe to Electron focus events
    const unsubscribe = window.desktopApi?.onFocusChange?.((focused) => {
      if (focused) {
        handleFocus()
      } else {
        handleBlur()
      }
    })

    isInitialized.current = true

    return () => {
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("blur", handleBlur)
      unsubscribe?.()
    }
  }, [setPendingCount])

  // Update badge when pending count changes
  useEffect(() => {
    if (!isDesktopApp() || typeof window === "undefined") return

    if (pendingCount > 0) {
      window.desktopApi?.setBadge(pendingCount)
    } else {
      window.desktopApi?.setBadge(null)
    }
  }, [pendingCount])

  /**
   * Show a notification for agent completion
   * Only shows if window is not focused (in desktop app)
   * Uses terminal-notifier per CLAUDE.md instructions (with Electron fallback)
   */
  const notifyAgentComplete = useCallback(
    (agentName: string) => {
      if (!isDesktopApp() || typeof window === "undefined") return

      // Only notify if window is not focused
      if (!isWindowFocused) {
        // Increment badge count
        setPendingCount((prev) => prev + 1)

        // Use terminal-notifier per CLAUDE.md (preferred on macOS)
        if (window.desktopApi?.terminalNotify) {
          window.desktopApi.terminalNotify(
            `Completed: ${agentName}`,
            "Claude Code",
          )
        } else {
          // Fallback to Electron notification
          window.desktopApi?.showNotification({
            title: "Agent finished",
            body: `${agentName} completed the task`,
          })
        }
      }
    },
    [setPendingCount],
  )

  /**
   * Check if window is currently focused
   */
  const isAppFocused = useCallback(() => {
    return isWindowFocused
  }, [])

  return {
    notifyAgentComplete,
    isAppFocused,
    pendingCount,
    clearBadge: () => {
      setPendingCount(0)
      window.desktopApi?.setBadge(null)
    },
  }
}

/**
 * Standalone function to show notification (for use outside React components)
 * Uses terminal-notifier per CLAUDE.md instructions (with Electron fallback)
 */
export function showAgentNotification(agentName: string) {
  if (!isDesktopApp() || typeof window === "undefined") return

  // Only notify if window is not focused
  if (!document.hasFocus()) {
    // Use terminal-notifier per CLAUDE.md (preferred on macOS)
    if (window.desktopApi?.terminalNotify) {
      window.desktopApi.terminalNotify(`Completed: ${agentName}`, "Claude Code")
    } else {
      // Fallback to Electron notification
      window.desktopApi?.showNotification({
        title: "Agent finished",
        body: `${agentName} completed the task`,
      })
    }
  }
}
