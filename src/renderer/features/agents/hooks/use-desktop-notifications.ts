/**
 * Desktop notifications hook - provides native OS notifications for agent events.
 * Uses Electron's Notification API via the IPC bridge in desktopApi.
 */

import { useCallback, useRef, useEffect } from "react"
import { useAtomValue } from "jotai"
import { isDesktopApp } from "../../../lib/utils/platform"
import { desktopNotificationsEnabledAtom, notifyWhenFocusedAtom } from "../../../lib/atoms"
import { useI18n } from "../../../lib/i18n"

// throttle interval to prevent notification spam (ms)
const NOTIFICATION_THROTTLE_MS = 3000

// priority levels for notifications (higher = more important)
const NOTIFICATION_PRIORITY = {
  error: 3,
  input: 2,
  plan: 1,
  complete: 0,
} as const

type NotificationPriority = keyof typeof NOTIFICATION_PRIORITY

export interface NotificationOptions {
  title: string
  body: string
  silent?: boolean
  priority?: NotificationPriority
}

export function useDesktopNotifications() {
  const { t } = useI18n()
  const notificationsEnabled = useAtomValue(desktopNotificationsEnabledAtom)
  const notifyWhenFocused = useAtomValue(notifyWhenFocusedAtom)

  // track last notification time to throttle rapid-fire notifications
  const lastNotificationTime = useRef<number>(0)
  const pendingNotification = useRef<NotificationOptions | null>(null)
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current)
        throttleTimer.current = null
      }
    }
  }, [])

  const showNotification = useCallback((title: string, body: string, options?: { silent?: boolean; priority?: NotificationPriority }) => {
    // Check if notifications are enabled
    if (!notificationsEnabled) {
      return
    }

    if (!isDesktopApp()) {
      // fallback for web - use browser Notification API if available
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, silent: options?.silent })
      }
      return
    }

    const now = Date.now()
    const timeSinceLastNotification = now - lastNotificationTime.current
    const currentPriority = options?.priority ? NOTIFICATION_PRIORITY[options.priority] : 0

    // if we're within throttle window, check priority
    if (timeSinceLastNotification < NOTIFICATION_THROTTLE_MS) {
      const pendingPriority = pendingNotification.current?.priority
        ? NOTIFICATION_PRIORITY[pendingNotification.current.priority]
        : 0

      // Only queue if higher or equal priority than pending
      if (currentPriority >= pendingPriority) {
        pendingNotification.current = { title, body, silent: options?.silent, priority: options?.priority }
      }

      // set up a timer to show the pending notification after throttle period
      if (!throttleTimer.current) {
        throttleTimer.current = setTimeout(() => {
          throttleTimer.current = null
          if (pendingNotification.current) {
            const pending = pendingNotification.current
            pendingNotification.current = null
            // Directly send notification without recursive call to avoid re-throttling
            lastNotificationTime.current = Date.now()
            window.desktopApi?.showNotification({ title: pending.title, body: pending.body })
          }
        }, NOTIFICATION_THROTTLE_MS - timeSinceLastNotification)
      }
      return
    }

    lastNotificationTime.current = now

    // use the IPC bridge to show native notification
    window.desktopApi?.showNotification({ title, body })
  }, [notificationsEnabled])

  const notifyAgentComplete = useCallback((chatName: string) => {
    // Skip if window is focused and user hasn't opted into focused notifications
    if (!notifyWhenFocused && document.hasFocus()) {
      return
    }

    const title = t("desktopNotification.agentComplete.title")
    const body = chatName
      ? t("desktopNotification.agentComplete.bodyWithName", { name: chatName })
      : t("desktopNotification.agentComplete.body")
    showNotification(title, body, { priority: "complete" })
  }, [showNotification, notifyWhenFocused, t])

  const notifyAgentError = useCallback((errorMessage: string) => {
    // always notify on errors, even if window is focused
    const title = t("desktopNotification.agentError.title")
    const body = errorMessage.length > 100 ? errorMessage.slice(0, 100) + "..." : errorMessage
    showNotification(title, body, { priority: "error" })
  }, [showNotification, t])

  const notifyAgentNeedsInput = useCallback((chatName: string) => {
    if (!notifyWhenFocused && document.hasFocus()) {
      return
    }

    const title = t("desktopNotification.inputRequired.title")
    const body = chatName
      ? t("desktopNotification.inputRequired.bodyWithName", { name: chatName })
      : t("desktopNotification.inputRequired.body")
    showNotification(title, body, { priority: "input" })
  }, [showNotification, notifyWhenFocused, t])

  const notifyPlanReady = useCallback((chatName: string) => {
    if (!notifyWhenFocused && document.hasFocus()) {
      return
    }

    const title = t("desktopNotification.planReady.title")
    const body = chatName
      ? t("desktopNotification.planReady.bodyWithName", { name: chatName })
      : t("desktopNotification.planReady.body")
    showNotification(title, body, { priority: "plan" })
  }, [showNotification, notifyWhenFocused, t])

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
