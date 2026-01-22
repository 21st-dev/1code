"use client"

import { useEffect, useState } from "react"
import { Minus, Square, X } from "lucide-react"
import { Button } from "./ui/button"

/**
 * Windows title bar component for frameless windows
 * Provides window controls (minimize, maximize, close) and drag region
 *
 * Only shown on Windows when using frameless window (useNativeFrame = false)
 */
export function WindowsTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [hasNativeFrame, setHasNativeFrame] = useState(false)

  const isWindows =
    typeof window !== "undefined" && window.desktopApi?.platform === "win32"

  // Check actual window frame state
  useEffect(() => {
    if (!isWindows || !window.desktopApi?.getWindowFrameState) return

    const checkFrameState = async () => {
      try {
        const hasFrame = await window.desktopApi.getWindowFrameState()
        setHasNativeFrame(hasFrame)
      } catch {
        setHasNativeFrame(false)
      }
    }

    checkFrameState()
  }, [isWindows])

  // Check window maximized state
  useEffect(() => {
    if (!isWindows || !window.desktopApi?.windowIsMaximized) return

    const checkMaximized = async () => {
      const maximized = await window.desktopApi.windowIsMaximized()
      setIsMaximized(maximized)
    }

    checkMaximized()

    const handleFocus = () => checkMaximized()
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [isWindows])

  // Don't render on non-Windows or when using native frame
  if (!isWindows || hasNativeFrame) return null

  const handleMinimize = async () => {
    await window.desktopApi?.windowMinimize()
  }

  const handleMaximize = async () => {
    await window.desktopApi?.windowMaximize()
    setTimeout(async () => {
      const maximized = await window.desktopApi?.windowIsMaximized()
      setIsMaximized(maximized ?? false)
    }, 100)
  }

  const handleClose = async () => {
    await window.desktopApi?.windowClose()
  }

  return (
    <div
      className="h-8 flex-shrink-0 flex items-center justify-between bg-background border-b border-border/50"
      style={{
        // @ts-expect-error - WebKit-specific property for Electron window dragging
        WebkitAppRegion: "drag",
      }}
    >
      {/* Left side - App title (draggable) */}
      <div className="flex items-center gap-2 px-3 h-full">
        <span className="text-xs font-medium text-foreground/70">Intelligence Interface</span>
      </div>

      {/* Right side - Window controls (non-draggable) */}
      <div
        className="flex items-center h-full"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMinimize}
          className="h-full w-10 rounded-none hover:bg-foreground/10"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMaximize}
          className="h-full w-10 rounded-none hover:bg-foreground/10"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-full w-10 rounded-none hover:bg-red-500/20 hover:text-red-500"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
