/**
 * Desktop notifications hook - provides native OS notifications for agent events.
 * Uses Electron's Notification API via the IPC bridge in desktopApi.
 */

import { useCallback, useRef } from "react"
import { isDesktopApp } from "../../../lib/utils/platform"

// throttle interval to prevent notification spam (ms)
const NOTIFICATION_THROTTLE_MS = 3000

export interface NotificationOptions {
  title: string
  body: string
  silent?: boolean
}

export function useDesktopNotifications() {
  // track last notification time to throttle rapid-fire notifications
  const lastNotificationTime = useRef<number>(0)
  const pendingNotification = useRef<NotificationOptions | null>(null)
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotification = useCallback((title: string, body: string, options?: { silent?: boolean }) => {
    if (!isDesktopApp()) {
      // fallback for web - use browser Notification API if available
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, silent: options?.silent })
      }
      return
    }

    const now = Date.now()
    const timeSinceLastNotification = now - lastNotificationTime.current

    // if we're within throttle window, queue this notification
    if (timeSinceLastNotification < NOTIFICATION_THROTTLE_MS) {
      pendingNotification.current = { title, body, silent: options?.silent }

      // set up a timer to show the pending notification after throttle period
      if (!throttleTimer.current) {
        throttleTimer.current = setTimeout(() => {
          throttleTimer.current = null
          if (pendingNotification.current) {
            const pending = pendingNotification.current
            pendingNotification.current = null
            showNotification(pending.title, pending.body, { silent: pending.silent })
          }
        }, NOTIFICATION_THROTTLE_MS - timeSinceLastNotification)
      }
      return
    }

    lastNotificationTime.current = now

    // use the IPC bridge to show native notification
    window.desktopApi?.showNotification({ title, body })
  }, [])

  const notifyAgentComplete = useCallback((chatName: string) => {
    // don't notify if window is focused - user is already watching
    if (document.hasFocus()) {
      return
    }

    const title = "Agent Complete"
    const body = chatName ? `Finished working on "${chatName}"` : "Agent has completed its task"
    showNotification(title, body)
  }, [showNotification])

  const notifyAgentError = useCallback((errorMessage: string) => {
    // always notify on errors, even if window is focused
    const title = "Agent Error"
    const body = errorMessage.length > 100 ? errorMessage.slice(0, 100) + "..." : errorMessage
    showNotification(title, body)
  }, [showNotification])

  const notifyAgentNeedsInput = useCallback((chatName: string) => {
    // don't notify if window is focused
    if (document.hasFocus()) {
      return
    }

    const title = "Input Required"
    const body = chatName ? `"${chatName}" is waiting for your input` : "Agent is waiting for your input"
    showNotification(title, body)
  }, [showNotification])

  const notifyPlanReady = useCallback((chatName: string) => {
    // don't notify if window is focused
    if (document.hasFocus()) {
      return
    }

    const title = "Plan Ready"
    const body = chatName ? `"${chatName}" has a plan ready for approval` : "A plan is ready for your approval"
    showNotification(title, body)
  }, [showNotification])

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (isDesktopApp()) {
      // desktop apps don't need explicit permission for notifications
      return "granted"
    }

    // for web, request browser permission
    if ("Notification" in window) {
      return await Notification.requestPermission()
    }

    return "denied"
  }, [])

  return {
    showNotification,
    notifyAgentComplete,
    notifyAgentError,
    notifyAgentNeedsInput,
    notifyPlanReady,
    requestPermission,
  }
}
