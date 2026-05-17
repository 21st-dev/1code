"use client"

import { useAtom, type WritableAtom } from "jotai"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Kbd } from "./kbd"
import { useI18n } from "../../lib/i18n"

interface ResizableBottomPanelProps {
  isOpen: boolean
  onClose: () => void
  heightAtom: WritableAtom<number, [number], void>
  minHeight?: number
  maxHeight?: number
  closeHotkey?: string
  showResizeTooltip?: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

const DEFAULT_MIN_HEIGHT = 150
const DEFAULT_MAX_HEIGHT = 500
const EXTENDED_HOVER_AREA_HEIGHT = 8

export function ResizableBottomPanel({
  isOpen,
  onClose,
  heightAtom,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  closeHotkey,
  showResizeTooltip = false,
  children,
  className = "",
  style,
}: ResizableBottomPanelProps) {
  const { t } = useI18n()
  const [panelHeight, setPanelHeight] = useAtom(heightAtom)

  const hasOpenedOnce = useRef(false)
  const wasOpenRef = useRef(false)
  const [shouldAnimate, setShouldAnimate] = useState(!isOpen)

  const [isResizing, setIsResizing] = useState(false)
  const [isHoveringResizeHandle, setIsHoveringResizeHandle] = useState(false)
  const [tooltipX, setTooltipX] = useState<number | null>(null)
  const [isTooltipDismissed, setIsTooltipDismissed] = useState(false)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [localHeight, setLocalHeight] = useState<number | null>(null)

  const currentHeight = localHeight ?? panelHeight

  const tooltipPosition = useMemo(() => {
    if (!tooltipX || !panelRef.current) return null
    const rect = panelRef.current.getBoundingClientRect()
    return {
      x: tooltipX,
      y: rect.top - 8,
    }
  }, [tooltipX, currentHeight])

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) {
      hasOpenedOnce.current = false
      setShouldAnimate(true)
      setLocalHeight(null)
    }
    if (isOpen) {
      setIsTooltipDismissed(false)
    }
    wasOpenRef.current = isOpen

    if (isOpen && !hasOpenedOnce.current) {
      const timer = setTimeout(() => {
        hasOpenedOnce.current = true
        setShouldAnimate(false)
      }, 50)
      return () => clearTimeout(timer)
    } else if (isOpen && hasOpenedOnce.current) {
      setShouldAnimate(false)
    }
  }, [isOpen])

  // Cleanup tooltip timeout on unmount or close
  useEffect(() => {
    if (!isOpen) {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
        tooltipTimeoutRef.current = null
      }
      setIsHoveringResizeHandle(false)
      setTooltipX(null)
    }
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
        tooltipTimeoutRef.current = null
      }
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    if (isHoveringResizeHandle && !isTooltipDismissed) {
      setIsTooltipDismissed(true)
    }
    if (isResizing) {
      setIsResizing(false)
    }
    if (localHeight !== null) {
      setLocalHeight(null)
    }
    setShouldAnimate(true)
    onClose()
    setIsHoveringResizeHandle(false)
    setTooltipX(null)
  }, [onClose, localHeight, isResizing, isHoveringResizeHandle, isTooltipDismissed])

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const startY = event.clientY
      const startHeight = panelHeight
      const pointerId = event.pointerId
      let hasMoved = false
      let currentLocalHeight: number | null = null

      const handleElement = resizeHandleRef.current ?? (event.currentTarget as HTMLElement)
      handleElement.setPointerCapture?.(pointerId)
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
        tooltipTimeoutRef.current = null
      }
      setIsResizing(true)
      setIsHoveringResizeHandle(false)

      const clampHeight = (h: number) =>
        Math.max(minHeight, Math.min(maxHeight, h))

      const handlePointerMove = (e: PointerEvent) => {
        const delta = Math.abs(startY - e.clientY)
        if (!hasMoved && delta >= 3) {
          hasMoved = true
        }
        if (hasMoved) {
          const newHeight = clampHeight(startHeight + (startY - e.clientY))
          currentLocalHeight = newHeight
          setLocalHeight(newHeight)
        }
      }

      const finishResize = (e?: PointerEvent) => {
        if (handleElement.hasPointerCapture?.(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }
        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", handlePointerUp)
        document.removeEventListener("pointercancel", handlePointerCancel)
        setIsResizing(false)

        if (!hasMoved && e) {
          // Click without drag — close
          handleClose()
        } else if (hasMoved && e) {
          const finalHeight = clampHeight(startHeight + (startY - e.clientY))
          setPanelHeight(finalHeight)
          setLocalHeight(null)
        } else {
          if (currentLocalHeight !== null) {
            setPanelHeight(currentLocalHeight)
            setLocalHeight(null)
          }
        }
      }

      const handlePointerUp = (e: PointerEvent) => finishResize(e)
      const handlePointerCancel = () => finishResize()

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", handlePointerUp, { once: true })
      document.addEventListener("pointercancel", handlePointerCancel, { once: true })
    },
    [panelHeight, setPanelHeight, handleClose, minHeight, maxHeight],
  )

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      if (isResizing) return
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
      }
      if (!tooltipX) {
        setTooltipX(e.clientX)
      }
      tooltipTimeoutRef.current = setTimeout(() => {
        setIsHoveringResizeHandle(true)
      }, 300)
    },
    [isResizing, tooltipX],
  )

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      if (isResizing) return
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
        tooltipTimeoutRef.current = null
      }
      const relatedTarget = e.relatedTarget
      if (
        relatedTarget instanceof Node &&
        (resizeHandleRef.current?.contains(relatedTarget) ||
          resizeHandleRef.current === relatedTarget)
      ) {
        return
      }
      setIsHoveringResizeHandle(false)
      setTooltipX(null)
      setIsTooltipDismissed(false)
    },
    [isResizing],
  )

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={
              !shouldAnimate
                ? { height: currentHeight, opacity: 1 }
                : { height: 0, opacity: 0 }
            }
            animate={{ height: currentHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: isResizing ? 0 : 0,
              ease: [0.4, 0, 0.2, 1],
            }}
            className={`relative flex-shrink-0 ${className}`}
            style={{ minHeight, overflow: "hidden", ...style }}
          >
            {/* Extended hover area */}
            <div
              data-extended-hover-area
              className="absolute left-0 right-0 cursor-row-resize"
              style={{
                height: `${EXTENDED_HOVER_AREA_HEIGHT}px`,
                top: 0,
                pointerEvents: isResizing ? "none" : "auto",
                zIndex: isResizing ? 5 : 10,
              }}
              onPointerDown={handleResizePointerDown}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            />

            {/* Resize handle — top edge */}
            <div
              ref={resizeHandleRef}
              onPointerDown={handleResizePointerDown}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={(e) => {
                if (isResizing) return
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                  tooltipTimeoutRef.current = null
                }
                const relatedTarget = e.relatedTarget
                if (
                  relatedTarget instanceof Element &&
                  relatedTarget.closest("[data-extended-hover-area]")
                ) {
                  return
                }
                setIsHoveringResizeHandle(false)
                setTooltipX(null)
                setIsTooltipDismissed(false)
              }}
              className="absolute top-0 left-0 right-0 h-[4px] cursor-row-resize z-10"
              style={{ marginTop: "-2px" }}
            />

            {/* Hover Tooltip — Notion style */}
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
                        transform: "translateX(-50%) translateY(-100%)",
                        transformOrigin: "center bottom",
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
                            setIsTooltipDismissed(true)
                            handleClose()
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          setIsTooltipDismissed(true)
                          handleClose()
                        }}
                      >
                        <div className="flex items-center gap-1 text-xs">
                          <span>{t("common.close")}</span>
                          <span className="text-muted-foreground inline-flex items-center gap-1">
                            <span>{t("common.click")}</span>
                            {closeHotkey && (
                              <>
                                <span>{t("common.or")}</span>
                                <Kbd>{closeHotkey}</Kbd>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span>{t("common.resize")}</span>
                          <span className="text-muted-foreground">{t("common.drag")}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body,
              )}

            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
