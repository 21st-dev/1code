import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { useUpdateChecker } from "../lib/hooks/use-update-checker"
import { useJustUpdated } from "../lib/hooks/use-just-updated"
import { getUpdateBannerViewModel } from "../lib/updates/banner-model"
import { getOpenCodexChangelogUrl } from "../lib/updates/changelog-url"
import { Button } from "./ui/button"
import { IconSpinner } from "../icons"

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
  } = useJustUpdated()

  const [isPending, setIsPending] = useState(false)
  const isMocking = MOCK_STATE !== "none"

  const [mockStatus, setMockStatus] = useState<
    "available" | "downloading" | "dismissed" | "just-updated"
  >(MOCK_STATE === "none" ? "available" : MOCK_STATE)
  const [mockProgress, setMockProgress] = useState(0)

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

  const justUpdated =
    isMocking && MOCK_STATE === "just-updated" ? true : realJustUpdated

  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [isPackaged, setIsPackaged] = useState(true)
  useEffect(() => {
    window.desktopApi?.getVersion().then(setCurrentVersion)
    window.desktopApi?.isPackaged().then(setIsPackaged)
  }, [])

  const displayVersion = justUpdatedVersion || currentVersion

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

  useEffect(() => {
    if (realState.status !== "available") {
      setIsPending(false)
    }
  }, [realState.status])

  const viewModel = getUpdateBannerViewModel({
    state,
    isPending,
    justUpdated,
    displayVersion,
  })

  const handleUpdate = () => {
    if (isMocking) {
      setMockStatus("downloading")
      return
    }

    flushSync(() => {
      setIsPending(true)
    })
    downloadUpdate()
  }

  const handleDismiss = () => {
    if (isMocking) {
      setMockStatus("dismissed")
      return
    }

    dismissUpdate()
  }

  const handleDismissWhatsNew = () => {
    if (isMocking) {
      setMockStatus("dismissed")
      return
    }

    dismissJustUpdated()
  }

  const handleOpenWhatsNew = async () => {
    const api = window.desktopApi
    if (!api) {
      return
    }

    const baseUrl = await api.getApiBaseUrl()
    await api.openExternal(
      getOpenCodexChangelogUrl(baseUrl, viewModel.version ?? displayVersion),
    )
  }

  if (!isPackaged || viewModel.kind === "hidden") {
    return null
  }

  if (viewModel.kind === "just-updated") {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-popover p-2.5 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
        <span className="text-foreground">
          Updated to v{viewModel.version ?? displayVersion}
        </span>
        <div className="ml-2 flex items-center gap-2">
          <Button size="sm" onClick={handleOpenWhatsNew}>
            See what's new
          </Button>
          <button
            onClick={handleDismissWhatsNew}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-popover p-2.5 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
      {viewModel.kind === "available" && (
        <>
          <div>
            <p className="text-foreground">{viewModel.title}</p>
            <p className="text-xs text-muted-foreground">{viewModel.message}</p>
          </div>
          <div className="ml-2 flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Later
            </button>
            <Button size="sm" onClick={handleUpdate}>
              {viewModel.actionLabel}
            </Button>
          </div>
        </>
      )}

      {viewModel.kind === "progress" && (
        <>
          <IconSpinner className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-foreground">{viewModel.title}</p>
            <p className="text-xs text-muted-foreground">{viewModel.message}</p>
          </div>
          {viewModel.progress !== undefined && (
            <span className="ml-1 text-muted-foreground">
              {Math.round(viewModel.progress)}%
            </span>
          )}
        </>
      )}

      {viewModel.kind === "restart-ready" && (
        <>
          <div>
            <p className="text-foreground">{viewModel.title}</p>
            <p className="text-xs text-muted-foreground">{viewModel.message}</p>
          </div>
          <div className="ml-2 flex items-center gap-2">
            <Button size="sm" onClick={installUpdate}>
              {viewModel.actionLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
