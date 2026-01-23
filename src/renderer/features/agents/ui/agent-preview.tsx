"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useAtom } from "jotai"
import { Button } from "../../../components/ui/button"
import { RotateCw } from "lucide-react"
import {
  ExternalLinkIcon,
  IconDoubleChevronRight,
  IconChatBubble,
} from "../../../components/ui/icons"
import { PreviewUrlInput } from "./preview-url-input"
import {
  previewPathAtomFamily,
  viewportModeAtomFamily,
  previewScaleAtomFamily,
  mobileDeviceAtomFamily,
} from "../atoms"
import { cn } from "../../../lib/utils"
import { ViewportToggle } from "./viewport-toggle"
import { ScaleControl } from "./scale-control"
import { DevicePresetsBar } from "./device-presets-bar"
import { ResizeHandle } from "./resize-handle"
import { MobileCopyLinkButton } from "./mobile-copy-link-button"
import { DEVICE_PRESETS, AGENTS_PREVIEW_CONSTANTS } from "../constants"
// import { getSandboxPreviewUrl } from "@/app/(alpha)/canvas/{components}/settings-tabs/repositories/preview-url"
const getSandboxPreviewUrl = (sandboxId: string, port: number, _type: string) => `https://${sandboxId}-${port}.csb.app` // Desktop mock
interface AgentPreviewProps {
  chatId: string
  sandboxId: string
  port: number
  repository?: string
  hideHeader?: boolean
  onClose?: () => void
  isMobile?: boolean
}

export function AgentPreview({
  chatId,
  sandboxId,
  port,
  repository,
  hideHeader = false,
  onClose,
  isMobile = false,
}: AgentPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  // Persisted state from Jotai atoms (per chatId)
  const [persistedPath, setPersistedPath] = useAtom(
    previewPathAtomFamily(chatId),
  )
  const [viewportMode, setViewportMode] = useAtom(
    viewportModeAtomFamily(chatId),
  )
  const [scale, setScale] = useAtom(previewScaleAtomFamily(chatId))
  const [device, setDevice] = useAtom(mobileDeviceAtomFamily(chatId))

  // Local state for resizing
  const [isResizing, setIsResizing] = useState(false)
  const [maxWidth, setMaxWidth] = useState<number>(
    AGENTS_PREVIEW_CONSTANTS.MAX_WIDTH,
  )

  // Dual state architecture:
  // - loadedPath: Controls iframe src (stable, only changes on manual navigation)
  // - currentPath: Display path (updates immediately on internal navigation)
  const [loadedPath, setLoadedPath] = useState(persistedPath)
  const [currentPath, setCurrentPath] = useState(persistedPath)

  // Listen for reload events from external header
  useEffect(() => {
    const handleReload = (e: CustomEvent) => {
      if (e.detail?.chatId === chatId) {
        setReloadKey((prev) => prev + 1)
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), 400)
      }
    }

    window.addEventListener(
      "agent-preview-reload",
      handleReload as EventListener,
    )
    return () =>
      window.removeEventListener(
        "agent-preview-reload",
        handleReload as EventListener,
      )
  }, [chatId])

  // Listen for navigation events from external header
  useEffect(() => {
    const handleNavigate = (e: CustomEvent) => {
      if (e.detail?.chatId === chatId && e.detail?.path) {
        setLoadedPath(e.detail.path)
        setCurrentPath(e.detail.path)
        setPersistedPath(e.detail.path)
        setIsLoaded(false)
      }
    }

    window.addEventListener(
      "agent-preview-navigate",
      handleNavigate as EventListener,
    )
    return () =>
      window.removeEventListener(
        "agent-preview-navigate",
        handleNavigate as EventListener,
      )
  }, [chatId, setPersistedPath])

  // Dispatch path updates to header
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("agent-preview-path-update", {
        detail: { chatId, path: currentPath },
      }),
    )
  }, [chatId, currentPath])

  // Sync loadedPath when persistedPath changes (e.g., on mount with stored value)
  useEffect(() => {
    setLoadedPath(persistedPath)
    setCurrentPath(persistedPath)
  }, [persistedPath])

  // Compute base host and preview URL
  const previewBaseUrl = useMemo(
    () => getSandboxPreviewUrl(sandboxId, port, "agents"),
    [sandboxId, port],
  )
  const baseHost = useMemo(() => {
    return new URL(previewBaseUrl).host
  }, [previewBaseUrl])

  const previewUrl = useMemo(() => {
    return `${previewBaseUrl}${loadedPath}`
  }, [previewBaseUrl, loadedPath])

  // Handle path selection from URL bar
  const handlePathSelect = useCallback(
    (path: string) => {
      setLoadedPath(path) // Triggers iframe reload via src change
      setCurrentPath(path) // Updates URL bar display
      setPersistedPath(path) // Persist to localStorage
      setIsLoaded(false) // Show loading state
    },
    [setPersistedPath],
  )

  // Listen for SET_URL messages from iframe for bi-directional sync
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify source is our iframe
      if (
        !iframeRef.current ||
        event.source !== iframeRef.current.contentWindow
      ) {
        return
      }

      // Handle SET_URL messages from preview script
      if (event.data?.type === "SET_URL") {
        const newPath = event.data.url || "/"

        // Skip srcdoc paths (edge case from iframe)
        if (newPath.includes("srcdoc")) {
          return
        }

        // Update ONLY currentPath for immediate display update
        // Do NOT update loadedPath - that would cause iframe remount
        setCurrentPath(newPath)
        setPersistedPath(newPath) // Persist to localStorage
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [setPersistedPath])

  // Calculate max width on mount and window resize
  useEffect(() => {
    const updateMaxWidth = () => {
      const availableWidth = window.innerWidth - 64 // Account for padding/margins
      setMaxWidth(Math.max(AGENTS_PREVIEW_CONSTANTS.MIN_WIDTH, availableWidth))
    }

    updateMaxWidth()
    window.addEventListener("resize", updateMaxWidth)
    return () => window.removeEventListener("resize", updateMaxWidth)
  }, [])

  // Cleanup resize handlers on unmount
  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.()
    }
  }, [])

  const handleReload = useCallback(() => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setIsLoaded(false)
    setReloadKey((prev) => prev + 1)
    setTimeout(() => setIsRefreshing(false), 400)
  }, [isRefreshing])

  const handlePresetChange = useCallback(
    (presetName: string) => {
      const preset = DEVICE_PRESETS.find((p) => p.name === presetName)
      if (preset) {
        setDevice({
          width: preset.width,
          height: preset.height,
          preset: preset.name,
        })
      }
    },
    [setDevice],
  )

  const handleWidthChange = useCallback(
    (width: number) => {
      setDevice({
        ...device,
        width,
        preset: "Custom",
      })
    },
    [device, setDevice],
  )

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const handle = e.currentTarget as HTMLElement
      const pointerId = e.pointerId
      const isLeftHandle = handle.getAttribute("data-side") === "left"
      const startX = e.clientX
      const startWidth = device.width
      const frame = frameRef.current

      if (!frame) return

      handle.setPointerCapture(pointerId)
      setIsResizing(true)

      const handlePointerMove = (e: PointerEvent) => {
        let delta = e.clientX - startX
        if (isLeftHandle) {
          delta = -delta
        }
        const newWidth = Math.round(
          Math.max(
            AGENTS_PREVIEW_CONSTANTS.MIN_WIDTH,
            Math.min(maxWidth, startWidth + delta * 2),
          ),
        )
        frame.style.width = `${newWidth}px`
        setDevice({
          ...device,
          width: newWidth,
          preset: "Custom",
        })
      }

      const handlePointerUp = () => {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId)
        }
        setIsResizing(false)
        cleanup()
      }

      const handlePointerCancel = () => {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId)
        }
        cleanup()
      }

      const cleanup = () => {
        handle.removeEventListener("pointermove", handlePointerMove as any)
        handle.removeEventListener("pointerup", handlePointerUp as any)
        handle.removeEventListener("pointercancel", handlePointerCancel as any)
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
        resizeCleanupRef.current = null
      }

      document.body.style.userSelect = "none"
      document.body.style.cursor = "ew-resize"
      handle.addEventListener("pointermove", handlePointerMove as any)
      handle.addEventListener("pointerup", handlePointerUp as any)
      handle.addEventListener("pointercancel", handlePointerCancel as any)
      resizeCleanupRef.current = cleanup
    },
    [device, maxWidth, setDevice],
  )

  return (
    <div
      className={cn(
        "flex flex-col bg-tl-background",
        isMobile ? "h-full w-full" : "h-full",
      )}
    >
      {/* Mobile Header */}
      {isMobile && !hideHeader && (
        <div
          className="flex-shrink-0 bg-background/95 backdrop-blur border-b h-11 min-h-[44px] max-h-[44px]"
          data-mobile-preview-header
          style={{
            // @ts-expect-error - WebKit-specific property for Electron window dragging
            WebkitAppRegion: "drag",
          }}
        >
          <div
            className="flex h-full items-center px-2 gap-2"
            style={{
              // @ts-expect-error - WebKit-specific property
              WebkitAppRegion: "no-drag",
            }}
          >
            {/* Chat button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
            >
              <IconChatBubble className="h-4 w-4" />
              <span className="sr-only">Back to chat</span>
            </Button>

            {/* Reload button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReload}
              disabled={isRefreshing}
              className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
            >
              <RotateCw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />
            </Button>

            {/* URL Input - centered, flexible */}
            <div className="flex-1 min-w-0 mx-1">
              <PreviewUrlInput
                baseHost={baseHost}
                currentPath={currentPath}
                onPathChange={handlePathSelect}
                isLoading={!isLoaded}
                className="w-full"
                variant="mobile"
              />
            </div>

            {/* Scale control */}
            <ScaleControl value={scale} onChange={setScale} />

            {/* Copy link button */}
            <MobileCopyLinkButton url={previewUrl} />
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobile && !hideHeader && (
        <div className="flex items-center justify-between px-3 h-10 bg-tl-background flex-shrink-0">
          {/* Left: Refresh + Viewport Toggle + Scale */}
          <div className="flex items-center gap-1 flex-1">
            <Button
              variant="ghost"
              onClick={handleReload}
              disabled={isRefreshing}
              className="h-7 w-7 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
            >
              <RotateCw
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground",
                  isRefreshing && "animate-spin",
                )}
              />
            </Button>

            <ViewportToggle value={viewportMode} onChange={setViewportMode} />

            <ScaleControl value={scale} onChange={setScale} />
          </div>

          {/* Center: URL bar */}
          <div className="flex-1 mx-2 min-w-0 flex items-center justify-center">
            <PreviewUrlInput
              baseHost={baseHost}
              currentPath={currentPath}
              onPathChange={handlePathSelect}
              isLoading={!isLoaded}
              className="max-w-[350px] w-full"
            />
          </div>

          {/* Right: External link + Mode toggle + Close */}
          <div className="flex items-center justify-end gap-1 flex-1">
            <Button
              variant="ghost"
              className="h-7 w-7 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
              onClick={() => window.open(previewUrl, "_blank")}
            >
              <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>

            {onClose && (
              <Button
                variant="ghost"
                className="h-7 w-7 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
                onClick={onClose}
              >
                <IconDoubleChevronRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Device presets bar - only visible in mobile viewport mode (not on actual mobile devices) */}
      {!isMobile && !hideHeader && viewportMode === "mobile" && (
        <DevicePresetsBar
          selectedPreset={device.preset}
          width={device.width}
          height={device.height}
          onPresetChange={handlePresetChange}
          onWidthChange={handleWidthChange}
          maxWidth={maxWidth}
        />
      )}

      {/* Content area */}
      <div
        className={cn(
          "flex-1 relative flex items-center justify-center overflow-hidden",
          isMobile ? "w-full h-full" : "px-1 pb-1",
        )}
      >
        {isMobile ? (
          // Mobile: Fullscreen iframe with scale support
          <div className="relative overflow-hidden w-full h-full flex-shrink-0 bg-background">
            <div
              className="w-full h-full"
              style={
                scale !== 100
                  ? {
                      width: `${(100 / scale) * 100}%`,
                      height: `${(100 / scale) * 100}%`,
                      transform: `scale(${scale / 100})`,
                      transformOrigin: "top left",
                    }
                  : undefined
              }
            >
              <iframe
                ref={iframeRef}
                key={reloadKey}
                src={previewUrl}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                allow="clipboard-write"
                onLoad={() => setIsLoaded(true)}
                onError={() => setIsLoaded(true)}
              />
            </div>
            {/* Loading overlay */}
            {!isLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                <div className="w-6 h-6 animate-pulse">
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 400 400"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-label="kCode logo"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M358.333 0C381.345 0 400 18.6548 400 41.6667V295.833C400 298.135 398.134 300 395.833 300H270.833C268.532 300 266.667 301.865 266.667 304.167V395.833C266.667 398.134 264.801 400 262.5 400H41.6667C18.6548 400 0 381.345 0 358.333V304.72C0 301.793 1.54269 299.081 4.05273 297.575L153.76 207.747C157.159 205.708 156.02 200.679 152.376 200.065L151.628 200H4.16667C1.86548 200 6.71103e-08 198.135 0 195.833V104.167C1.07376e-06 101.865 1.86548 100 4.16667 100H162.5C164.801 100 166.667 98.1345 166.667 95.8333V4.16667C166.667 1.86548 168.532 1.00666e-07 170.833 0H358.333ZM170.833 100C168.532 100 166.667 101.865 166.667 104.167V295.833C166.667 298.135 168.532 300 170.833 300H262.5C264.801 300 266.667 298.135 266.667 295.833V104.167C266.667 101.865 264.801 100 262.5 100H170.833Z"
                      fill="currentColor"
                      className="text-muted-foreground"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Left resize handle - only in mobile viewport mode (not on actual mobile devices) */}
            {viewportMode === "mobile" && (
              <ResizeHandle
                side="left"
                onPointerDown={handleResizeStart}
                isResizing={isResizing}
              />
            )}

            {/* Frame with dynamic size */}
            <div
              ref={frameRef}
              className={cn(
                "relative overflow-hidden flex-shrink-0 bg-background",
                !isResizing &&
                  "transition-[width,height,margin] duration-300 ease-in-out",
                viewportMode === "desktop"
                  ? "border-[0.5px] rounded-sm"
                  : "shadow-lg border",
              )}
              style={{
                width:
                  viewportMode === "desktop" ? "100%" : `${device.width}px`,
                height: "100%",
                maxHeight:
                  viewportMode === "mobile" ? `${device.height}px` : "100%",
                marginLeft: viewportMode === "mobile" ? "16px" : "0",
                marginRight: viewportMode === "mobile" ? "16px" : "0",
                borderRadius: viewportMode === "desktop" ? "8px" : "24px",
              }}
            >
              {/* Scale transform wrapper */}
              <div
                className="w-full h-full"
                style={
                  scale !== 100
                    ? {
                        width: `${(100 / scale) * 100}%`,
                        height: `${(100 / scale) * 100}%`,
                        transform: `scale(${scale / 100})`,
                        transformOrigin: "top left",
                      }
                    : undefined
                }
              >
                <iframe
                  ref={iframeRef}
                  key={reloadKey}
                  src={previewUrl}
                  width="100%"
                  height="100%"
                  style={{
                    border: "none",
                    borderRadius: viewportMode === "desktop" ? "8px" : "24px",
                  }}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  onLoad={() => setIsLoaded(true)}
                  title="Preview"
                  tabIndex={-1}
                />

                {/* Loading overlay */}
                {!isLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background z-10 rounded-[inherit]">
                    <div className="w-6 h-6 animate-pulse">
                      <svg
                        width="100%"
                        height="100%"
                        viewBox="0 0 400 400"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-label="kCode logo"
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M358.333 0C381.345 0 400 18.6548 400 41.6667V295.833C400 298.135 398.134 300 395.833 300H270.833C268.532 300 266.667 301.865 266.667 304.167V395.833C266.667 398.134 264.801 400 262.5 400H41.6667C18.6548 400 0 381.345 0 358.333V304.72C0 301.793 1.54269 299.081 4.05273 297.575L153.76 207.747C157.159 205.708 156.02 200.679 152.376 200.065L151.628 200H4.16667C1.86548 200 6.71103e-08 198.135 0 195.833V104.167C1.07376e-06 101.865 1.86548 100 4.16667 100H162.5C164.801 100 166.667 98.1345 166.667 95.8333V4.16667C166.667 1.86548 168.532 1.00666e-07 170.833 0H358.333ZM170.833 100C168.532 100 166.667 101.865 166.667 104.167V295.833C166.667 298.135 168.532 300 170.833 300H262.5C264.801 300 266.667 298.135 266.667 295.833V104.167C266.667 101.865 264.801 100 262.5 100H170.833Z"
                          fill="currentColor"
                          className="text-muted-foreground"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right resize handle - only in mobile viewport mode (not on actual mobile devices) */}
            {viewportMode === "mobile" && (
              <ResizeHandle
                side="right"
                onPointerDown={handleResizeStart}
                isResizing={isResizing}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
