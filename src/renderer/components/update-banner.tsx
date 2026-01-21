import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useUpdateChecker } from "../lib/hooks/use-update-checker"
import { useJustUpdated } from "../lib/hooks/use-just-updated"
import { Button } from "./ui/button"
import { IconSpinner } from "../icons"

// For testing: set to "available", "downloading", or "just-updated" to see the UI
// Change to "none" for production
const MOCK_STATE: "none" | "available" | "downloading" | "just-updated" = "none"

export function UpdateBanner() {
  const {
    state: realState,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  } = useUpdateChecker()

  const {
    justUpdated: realJustUpdated,
    justUpdatedVersion,
    dismissJustUpdated,
    openChangelog,
  } = useJustUpdated()
  const hasTriggeredInstall = useRef(false)

  // Optimistic loading state - show spinner immediately on click
  const [isPending, setIsPending] = useState(false)

  // Use mock or real state
  const isMocking = MOCK_STATE !== "none"

  // Mock state for testing UI
  const [mockStatus, setMockStatus] = useState<
    "available" | "downloading" | "dismissed" | "just-updated"
  >(MOCK_STATE === "none" ? "available" : MOCK_STATE)
  const [mockProgress, setMockProgress] = useState(0)

  // Simulate progress when mocking download
  useEffect(() => {
    if (isMocking && mockStatus === "downloading") {
      const interval = setInterval(() => {
        setMockProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            return 100
          }
          return prev + 5
        })
      }, 200)
      return () => clearInterval(interval)
    }
  }, [isMocking, mockStatus])

  // Just updated state (show "What's New" banner)
  // When mocking "just-updated", we need to show that state regardless of real state
  const justUpdated =
    isMocking && MOCK_STATE === "just-updated" ? true : realJustUpdated

  // Get current app version for display
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  // Track if app is packaged (official build) - default to true to avoid flash
  const [isPackaged, setIsPackaged] = useState(true)
  useEffect(() => {
    window.desktopApi?.getVersion().then(setCurrentVersion)
    window.desktopApi?.isPackaged().then(setIsPackaged)
  }, [])

  // Use current version for display (or the just updated version if available)
  const displayVersion = justUpdatedVersion || currentVersion

  // For mocking just-updated, force idle state so only the "What's New" banner shows
  const state =
    isMocking && MOCK_STATE === "just-updated"
      ? { status: "idle" as const, progress: 0 }
      : isMocking
        ? {
            status:
              mockStatus === "dismissed" || mockStatus === "just-updated"
                ? ("idle" as const)
                : mockStatus,
            progress: mockProgress,
          }
        : realState

  // Clear pending state when status changes from "available"
  // This handles: download started, error occurred, or state reset
  useEffect(() => {
    if (realState.status !== "available") {
      setIsPending(false)
    }
  }, [realState.status])

  // Get progress percentage
  const progress = "progress" in state ? state.progress : undefined

  // Auto-install when download completes
  useEffect(() => {
    if (realState.status === "ready" && !hasTriggeredInstall.current) {
      hasTriggeredInstall.current = true
      // Small delay to ensure UI updates before restart
      setTimeout(() => {
        installUpdate()
      }, 500)
    }
  }, [realState.status, installUpdate])

  // Reset install trigger when going back to available state
  useEffect(() => {
    if (realState.status === "available") {
      hasTriggeredInstall.current = false
    }
  }, [realState.status])

  // Mock handlers for testing
  const handleUpdate = () => {
    if (isMocking) {
      setMockStatus("downloading")
    } else {
      // Force synchronous render to show spinner immediately
      flushSync(() => {
        setIsPending(true)
      })
      downloadUpdate()
    }
  }

  const handleDismiss = () => {
    if (isMocking) {
      setMockStatus("dismissed")
    } else {
      dismissUpdate()
    }
  }

  const handleOpenChangelog = () => {
    // Open changelog URL
    window.desktopApi?.openExternal("https://1code.dev/changelog")
    // Dismiss the banner
    if (isMocking) {
      setMockStatus("dismissed")
    } else {
      dismissJustUpdated()
    }
  }

  const handleDismissWhatsNew = () => {
    if (isMocking) {
      setMockStatus("dismissed")
    } else {
      dismissJustUpdated()
    }
  }

  // For open source builds (!isPackaged), hide all update banners
  if (!isPackaged) {
    return null
  }

  // Show "What's New" banner if app was just updated
  if (justUpdated) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-popover p-2.5 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
        <span className="text-foreground">
          Updated to v{displayVersion}
        </span>
        <div className="flex items-center gap-2 ml-2">
          <Button size="sm" onClick={handleOpenChangelog}>
            See what's new
          </Button>
          <button
            onClick={handleDismissWhatsNew}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
            aria-label="Dismiss"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 3L3 11M3 3L11 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Don't show anything for idle, checking, or error states
  if (
    state.status === "idle" ||
    state.status === "checking" ||
    state.status === "error"
  ) {
    return null
  }

  // Updating state (downloading or ready to install, or pending click)
  const isUpdating =
    state.status === "downloading" || state.status === "ready" || isPending

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-popover p-2.5 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
      {/* Update Available State */}
      {state.status === "available" && !isPending && (
        <>
          <span className="text-foreground">Update available</span>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Later
            </button>
            <Button size="sm" onClick={handleUpdate}>
              Update
            </Button>
          </div>
        </>
      )}

      {/* Updating State (downloading, installing, or pending) */}
      {isUpdating && (
        <>
          <IconSpinner className="h-4 w-4 text-muted-foreground" />
          <span className="text-foreground">
            {isPending ? "Starting update..." : "Updating..."}
          </span>
          {progress !== undefined && !isPending && (
            <span className="text-muted-foreground ml-1">
              {Math.round(progress)}%
            </span>
          )}
        </>
      )}
    </div>
  )
}
