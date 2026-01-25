"use client"

import { X } from "lucide-react"
import { Button } from "../button"
import { IconCloseSidebarRight } from "../icons"
import { PanelModeSwitcher } from "./panel-mode-switcher"
import type { PanelDisplayMode } from "./types"
import { cn } from "../../../lib/utils"

interface PanelHeaderProps {
  /** Title content (displayed after close button and mode switcher) */
  title?: React.ReactNode
  /** Left slot - custom content after mode switcher, before title */
  leftSlot?: React.ReactNode
  /** Right slot - custom actions on the right side */
  rightSlot?: React.ReactNode
  /** Close handler */
  onClose?: () => void
  /** Current display mode */
  displayMode?: PanelDisplayMode
  /** Display mode change handler */
  onDisplayModeChange?: (mode: PanelDisplayMode) => void
  /** Enable desktop window drag region */
  isDesktop?: boolean
  /** Whether window is in fullscreen mode */
  isFullscreen?: boolean
  /** Additional class names */
  className?: string
}

export function PanelHeader({
  title,
  leftSlot,
  rightSlot,
  onClose,
  displayMode,
  onDisplayModeChange,
  isDesktop = false,
  isFullscreen = false,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between h-10 px-2 border-b border-border/50 bg-background flex-shrink-0",
        className
      )}
    >
      {/* Drag region for window dragging */}
      {isDesktop && !isFullscreen && (
        <div
          className="absolute inset-0 z-0"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "drag",
          }}
        />
      )}

      {/* Left side: Close button + Mode switcher + Left slot + Title */}
      <div
        className="relative z-10 flex items-center gap-1 min-w-0 flex-shrink"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {/* Close button - X icon for dialog/fullpage modes, chevron for sidebar */}
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
            onClick={onClose}
          >
            {displayMode === "side-peek" ? (
              <IconCloseSidebarRight className="size-4 text-muted-foreground" />
            ) : (
              <X className="size-4 text-muted-foreground" />
            )}
          </Button>
        )}

        {/* Display mode switcher */}
        {displayMode && onDisplayModeChange && (
          <PanelModeSwitcher
            mode={displayMode}
            onModeChange={onDisplayModeChange}
          />
        )}

        {/* Left slot (custom content like branch selector for Diff) */}
        {leftSlot}

        {/* Title */}
        {title}
      </div>

      {/* Right side (custom actions) */}
      <div
        className="relative z-10 flex items-center gap-1 flex-shrink-0"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {rightSlot}
      </div>
    </div>
  )
}
