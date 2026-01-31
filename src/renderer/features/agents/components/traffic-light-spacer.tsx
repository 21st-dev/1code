"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "../../../lib/utils"

/**
 * Invisible no-drag zone over native macOS traffic lights.
 * Prevents the drag region from intercepting clicks on the native buttons.
 * Native traffic lights are always visible (managed by main process).
 */
export function TrafficLights({
  isFullscreen = null,
  isDesktop = false,
  className = "",
}: {
  isFullscreen?: boolean | null
  isDesktop?: boolean
  className?: string
}) {
  if (!isDesktop || isFullscreen === true) return null

  return (
    <div
      className={cn("relative", className)}
      style={{
        // @ts-expect-error - WebKit-specific property
        WebkitAppRegion: "no-drag",
      }}
      data-sidebar-content
    >
      {/* Invisible hit area matching native traffic light dimensions */}
      <div className="flex items-center gap-2" data-sidebar-content>
        <div className="w-3 h-3" />
        <div className="w-3 h-3" />
        <div className="w-3 h-3" />
      </div>
    </div>
  )
}

/**
 * Spacer component for macOS traffic light buttons (close/minimize/maximize)
 * Only renders in Electron desktop app to provide space for the buttons
 * Animates height smoothly when appearing/disappearing (e.g. fullscreen transitions)
 *
 * isFullscreen can be:
 * - null: not initialized yet (no animation, assume not fullscreen)
 * - boolean: initialized (animate only on real changes)
 */
export function TrafficLightSpacer({
  isFullscreen = null,
  isDesktop = false,
  className = "",
}: {
  isFullscreen?: boolean | null
  isDesktop?: boolean
  className?: string
}) {
  const prevFullscreenRef = useRef(isFullscreen)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    if (
      isFullscreen !== null &&
      prevFullscreenRef.current !== null &&
      prevFullscreenRef.current !== isFullscreen
    ) {
      setShouldAnimate(true)
    }
    prevFullscreenRef.current = isFullscreen
  }, [isFullscreen])

  const shouldShow = isDesktop && isFullscreen !== true

  return (
    <div
      className={cn(
        "w-full shrink-0 overflow-hidden",
        shouldAnimate && "transition-[height] duration-200 ease-out",
        className,
      )}
      style={{ height: shouldShow ? 32 : 0 }}
    />
  )
}

/**
 * Wrapper to make child elements non-draggable within a draggable region
 */
export function NoDrag({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        // @ts-expect-error - WebKit-specific property
        WebkitAppRegion: "no-drag",
      }}
    >
      {children}
    </div>
  )
}
