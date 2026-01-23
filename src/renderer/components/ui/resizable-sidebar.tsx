"use client"

import { useAtom, type WritableAtom } from "jotai"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import { Kbd } from "./kbd"

interface ResizableSidebarProps {
  isOpen: boolean
  onClose: () => void
  widthAtom: WritableAtom<number, [number], void>
  minWidth?: number
  maxWidth?: number
  side: "left" | "right"
  closeHotkey?: string
  animationDuration?: number
  children: React.ReactNode
  className?: string
  initialWidth?: number | string
  exitWidth?: number | string
  /** Data attributes to spread onto the container */
  dataAttributes?: Record<string, string | boolean>
  /** Disable close on click without drag */
  disableClickToClose?: boolean
  /** Show resize tooltip (Close/Resize instructions) */
  showResizeTooltip?: boolean
  /** Custom styles for the sidebar container */
  style?: React.CSSProperties
}

const DEFAULT_MIN_WIDTH = 200
const DEFAULT_MAX_WIDTH = 9999 // Effectively no limit - CSS constraints handle max width
const DEFAULT_ANIMATION_DURATION = 0 // Disabled for performance
const EXTENDED_HOVER_AREA_WIDTH = 8

export function ResizableSidebar({
  isOpen,
  onClose,
  widthAtom,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
  side,
  closeHotkey,
  animationDuration = DEFAULT_ANIMATION_DURATION,
  children,
  className = "",
  initialWidth = 0,
  exitWidth = 0,
  dataAttributes,
  disableClickToClose = false,
  showResizeTooltip = false,
  style,
}: ResizableSidebarProps) {
  const [sidebarWidth, setSidebarWidth] = useAtom(widthAtom)

  // Track if this is the first open to avoid initial animation when already open
  const hasOpenedOnce = useRef(false)
  const wasOpenRef = useRef(false)
  const [shouldAnimate, setShouldAnimate] = useState(!isOpen)

  // Resize handle state
  const [isResizing, setIsResizing] = useState(false)
  const [isHoveringResizeHandle, setIsHoveringResizeHandle] = useState(false)
  const [tooltipY, setTooltipY] = useState<number | null>(null)
  const [isTooltipDismissed, setIsTooltipDismissed] = useState(false)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Local width state for smooth resizing (avoids localStorage sync during resize)
  const [localWidth, setLocalWidth] = useState<number | null>(null)

  // Use local width during resize, otherwise use persisted width
  const currentWidth = localWidth ?? sidebarWidth

  // Calculate tooltip position dynamically based on sidebar position
  const tooltipPosition = useMemo(() => {
    if (!tooltipY || !sidebarRef.current) return null
    const rect = sidebarRef.current.getBoundingClientRect()
    // For left sidebar, tooltip appears to the right
    // For right sidebar, tooltip appears to the left
    const x = side === "left" ? rect.right + 8 : rect.left - 8
    return {
      x,
      y: tooltipY,
    }
  }, [tooltipY, currentWidth, side])

  useEffect(() => {
    // When sidebar closes, reset hasOpenedOnce so animation plays on next open
    if (!isOpen && wasOpenRef.current) {
      hasOpenedOnce.current = false
      setShouldAnimate(true)
      // Clear local width when sidebar closes
      setLocalWidth(null)
    }
    if (isOpen) {
      setIsTooltipDismissed(false)
    }
    wasOpenRef.current = isOpen

    // Mark as opened after animation completes
    if (isOpen && !hasOpenedOnce.current) {
      const timer = setTimeout(
        () => {
          hasOpenedOnce.current = true
          setShouldAnimate(false)
        },
        animationDuration * 1000 + 50,
      )
      return () => clearTimeout(timer)
    } else if (isOpen && hasOpenedOnce.current) {
      // Already opened before, don't animate
      setShouldAnimate(false)
    }
  }, [isOpen, animationDuration])

  const handleClose = useCallback(() => {
    // If tooltip is visible, dismiss it first
    if (isHoveringResizeHandle && !isTooltipDismissed) {
      flushSync(() => {
        setIsTooltipDismissed(true)
      })
    }
    // Reset resizing state synchronously so exit animation sees the final width
    flushSync(() => {
      if (isResizing) {
        setIsResizing(false)
      }
      if (localWidth !== null) {
        setLocalWidth(null)
      }
    })
    // Ensure animation is enabled when closing
    setShouldAnimate(true)
    // Close sidebar - this will trigger exit animation via AnimatePresence
    onClose()
    setIsHoveringResizeHandle(false)
    setTooltipY(null)
  }, [
    onClose,
    isOpen,
    shouldAnimate,
    isResizing,
    localWidth,
    isHoveringResizeHandle,
    isTooltipDismissed,
  ])

  // Cleanup tooltip timeout on unmount or when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
        tooltipTimeoutRef.current = null
      }
      setIsHoveringResizeHandle(false)
      setTooltipY(null)
    }
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
        tooltipTimeoutRef.current = null
      }
    }
  }, [isOpen])

  // Global click handler for tooltip dismissal
  useEffect(() => {
    // Only register handlers when tooltip might be visible
    if (!isOpen || !isHoveringResizeHandle || isTooltipDismissed) {
      return
    }

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const tooltipElement = target.closest('[data-tooltip="true"]')
      const isClickOnTooltip =
        tooltipElement ||
        (tooltipRef.current && tooltipRef.current.contains(target))

      // Check if click is on tooltip
      if (isClickOnTooltip) {
        e.preventDefault()
        e.stopPropagation()
        flushSync(() => {
          setIsTooltipDismissed(true)
        })
        handleClose()
      }
    }

    // Use capture phase to catch event early
    document.addEventListener("click", handleDocumentClick, true)
    document.addEventListener("pointerdown", handleDocumentClick, true)

    return () => {
      document.removeEventListener("click", handleDocumentClick, true)
      document.removeEventListener("pointerdown", handleDocumentClick, true)
    }
  }, [isOpen, isHoveringResizeHandle, isTooltipDismissed, handleClose])

  // Handle resize interactions (both handle and extended area)
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = sidebarWidth
      const pointerId = event.pointerId
      let hasMoved = false
      let currentLocalWidth: number | null = null

      const handleElement =
        resizeHandleRef.current ?? (event.currentTarget as HTMLElement)

      const clampWidth = (width: number) =>
        Math.max(minWidth, Math.min(maxWidth, width))

      handleElement.setPointerCapture?.(pointerId)
      // Clear tooltip timeout when starting resize
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
        tooltipTimeoutRef.current = null
      }
      setIsResizing(true)
      setIsHoveringResizeHandle(false)

      const updateWidth = (clientX: number) => {
        // For left sidebar, moving right increases width
        // For right sidebar, moving left increases width
        const delta = side === "left" ? clientX - startX : startX - clientX
        const newWidth = clampWidth(startWidth + delta)
        currentLocalWidth = newWidth
        // Use local state for smooth real-time updates during resize
        setLocalWidth(newWidth)
      }

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const delta = Math.abs(
          side === "left"
            ? pointerEvent.clientX - startX
            : startX - pointerEvent.clientX,
        )
        if (!hasMoved && delta >= 3) {
          hasMoved = true
        }

        if (hasMoved) {
          // Update width immediately for real-time resize
          updateWidth(pointerEvent.clientX)
        }
      }

      const finishResize = (pointerEvent?: PointerEvent) => {
        if (handleElement.hasPointerCapture?.(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }

        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", handlePointerUp)
        document.removeEventListener("pointercancel", handlePointerCancel)
        setIsResizing(false)

        if (!hasMoved && pointerEvent && !disableClickToClose) {
          handleClose()
        } else if (hasMoved && pointerEvent) {
          const delta =
            side === "left"
              ? pointerEvent.clientX - startX
              : startX - pointerEvent.clientX
          const finalWidth = clampWidth(startWidth + delta)
          // Save final width to persisted atom (triggers localStorage sync)
          setSidebarWidth(finalWidth)
          // Clear local width to use persisted value
          setLocalWidth(null)
        } else {
          // If no pointer event but resize was happening, save current local width
          if (currentLocalWidth !== null) {
            setSidebarWidth(currentLocalWidth)
            setLocalWidth(null)
          }
        }
      }

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        finishResize(pointerEvent)
      }

      const handlePointerCancel = () => {
        finishResize()
      }

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", handlePointerUp, { once: true })
      document.addEventListener("pointercancel", handlePointerCancel, {
        once: true,
      })
    },
    [sidebarWidth, setSidebarWidth, handleClose, minWidth, maxWidth, side, disableClickToClose],
  )

  // Determine resize handle position based on side
  const resizeHandleStyle = useMemo(() => {
    if (side === "left") {
      return {
        right: "0px",
        width: "4px",
        marginRight: "-2px",
        paddingLeft: "2px",
        paddingRight: "2px",
      }
    } else {
      return {
        left: "0px",
        width: "4px",
        marginLeft: "-2px",
        paddingLeft: "2px",
        paddingRight: "2px",
      }
    }
  }, [side])

  const extendedHoverAreaStyle = useMemo(() => {
    if (side === "left") {
      return {
        width: `${EXTENDED_HOVER_AREA_WIDTH}px`,
        right: "0px",
      }
    } else {
      return {
        width: `${EXTENDED_HOVER_AREA_WIDTH}px`,
        left: "0px",
      }
    }
  }, [side])

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={sidebarRef}
            initial={
              !shouldAnimate
                ? {
                    width: currentWidth,
                    opacity: 1,
                  }
                : {
                    width: initialWidth,
                    opacity: 0,
                  }
            }
            animate={{
              width: currentWidth,
              opacity: 1,
            }}
            exit={{
              width: exitWidth,
              opacity: 0,
            }}
            transition={{
              duration: isResizing ? 0 : animationDuration / 1000,
              ease: [0.4, 0, 0.2, 1],
            }}
            className={`bg-transparent flex flex-col text-xs h-full relative ${className}`}
            style={{ minWidth: minWidth, overflow: "hidden", ...style }}
            {...(dataAttributes ? Object.fromEntries(
              Object.entries(dataAttributes).map(([key, value]) => [`data-${key}`, value])
            ) : {})}
          >
            {/* Extended hover area */}
            <div
              data-extended-hover-area
              className="absolute top-0 bottom-0 cursor-col-resize"
              style={{
                ...extendedHoverAreaStyle,
                pointerEvents: isResizing ? "none" : "auto",
                zIndex: isResizing ? 5 : 10,
              }}
              onPointerDown={handleResizePointerDown}
              onMouseEnter={(e) => {
                if (isResizing) {
                  return
                }
                // Clear any existing timeout
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                }
                // Set Y position immediately for positioning
                if (!tooltipY) {
                  setTooltipY(e.clientY)
                }
                // Delay showing tooltip
                tooltipTimeoutRef.current = setTimeout(() => {
                  setIsHoveringResizeHandle(true)
                }, 300)
              }}
              onMouseLeave={(e) => {
                if (isResizing) return
                // Clear timeout if mouse leaves before tooltip appears
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                  tooltipTimeoutRef.current = null
                }
                const relatedTarget = e.relatedTarget
                // Check if relatedTarget is a Node (not window or null)
                if (
                  relatedTarget instanceof Node &&
                  (resizeHandleRef.current?.contains(relatedTarget) ||
                    resizeHandleRef.current === relatedTarget)
                ) {
                  return
                }
                setIsHoveringResizeHandle(false)
                setTooltipY(null)
                setIsTooltipDismissed(false)
              }}
            />

            {/* Resize Handle */}
            <div
              ref={resizeHandleRef}
              onPointerDown={handleResizePointerDown}
              onMouseEnter={(e) => {
                // Clear any existing timeout
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                }
                // Set Y position immediately for positioning
                if (!tooltipY) {
                  setTooltipY(e.clientY)
                }
                // Delay showing tooltip
                tooltipTimeoutRef.current = setTimeout(() => {
                  setIsHoveringResizeHandle(true)
                }, 300)
              }}
              onMouseLeave={(e) => {
                // Clear timeout if mouse leaves before tooltip appears
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                  tooltipTimeoutRef.current = null
                }
                const relatedTarget = e.relatedTarget
                // Check if relatedTarget is an Element (not window or null)
                if (
                  relatedTarget instanceof Element &&
                  relatedTarget.closest("[data-extended-hover-area]")
                ) {
                  return
                }
                setIsHoveringResizeHandle(false)
                setTooltipY(null)
                setIsTooltipDismissed(false)
              }}
              className={`absolute top-0 bottom-0 cursor-col-resize z-10`}
              style={resizeHandleStyle}
            />

            {/* Hover Tooltip - Notion style */}
            {showResizeTooltip &&
              isHoveringResizeHandle &&
              !isResizing &&
              !isTooltipDismissed &&
              tooltipPosition &&
              typeof window !== "undefined" &&
              createPortal(
                <AnimatePresence>
                  {tooltipPosition && (
                    <motion.div
                      key="tooltip"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.05, ease: "easeOut" }}
                      className="fixed z-10"
                      style={{
                        left: `${tooltipPosition.x}px`,
                        top: `${tooltipPosition.y}px`,
                        transform:
                          side === "left"
                            ? "translateY(-50%)"
                            : "translateX(-100%) translateY(-50%)",
                        transformOrigin:
                          side === "left" ? "left center" : "right center",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        ref={tooltipRef}
                        role="dialog"
                        data-tooltip="true"
                        className="relative rounded-md border border-border bg-popover px-2 py-1 flex flex-col items-start gap-0.5 text-xs text-popover-foreground shadow-lg dark pointer-events-auto"
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          if (e.button === 0) {
                            // Left mouse button
                            flushSync(() => {
                              setIsTooltipDismissed(true)
                            })
                            // Directly call handleClose - same as button
                            handleClose()
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          flushSync(() => {
                            setIsTooltipDismissed(true)
                          })
                          // Directly call handleClose - same as button
                          handleClose()
                        }}
                      >
                        {!disableClickToClose && (
                          <div className="flex items-center gap-1 text-xs">
                            <span>Close</span>
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                              <span>Click</span>
                              {closeHotkey && (
                                <>
                                  <span>or</span>
                                  <Kbd>{closeHotkey}</Kbd>
                                </>
                              )}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs">
                          <span>Resize</span>
                          <span className="text-muted-foreground">Drag</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body,
              )}

            {/* Children content */}
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
