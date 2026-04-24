"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { useDndContext, useDroppable } from "@dnd-kit/core"
import { cn } from "../../../lib/utils"
import { getDefaultRatios } from "../atoms"
import { canAddToSplit, useAgentSubChatStore } from "../stores/sub-chat-store"

const MIN_PANE_WIDTH = 350

// Shared between `SplitViewContainer` and `SplitDropZone`, and read by the
// unified drag-end handler in `agents-content.tsx` to route drops as splits.
export const SPLIT_DROP_DATA = { type: "split" } as const

const DROP_OVERLAY_CLASS =
  "after:absolute after:inset-0 after:pointer-events-none after:border-2 after:border-dashed after:border-primary/60 after:rounded-md after:z-20"

interface SplitViewContainerProps {
  panes: Array<{ id: string; content: React.ReactNode }>
  hiddenTabs?: React.ReactNode
}

export function SplitViewContainer({
  panes,
  hiddenTabs,
}: SplitViewContainerProps) {
  const splitRatios = useAgentSubChatStore((s) => s.splitRatios)
  const setSplitRatios = useAgentSubChatStore((s) => s.setSplitRatios)
  const [localRatios, setLocalRatios] = useState<number[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const ratiosRef = useRef(splitRatios)
  ratiosRef.current = splitRatios

  // Disabled when the drop would silently no-op (already a pane, max reached),
  // so no hover highlight appears and the user can tell the drop won't land.
  const { active } = useDndContext()
  const activeSubChatId = useAgentSubChatStore((s) => s.activeSubChatId)
  const splitPaneIds = useAgentSubChatStore((s) => s.splitPaneIds)
  const dropDisabled =
    !active ||
    !canAddToSplit({ activeSubChatId, splitPaneIds }, String(active.id))
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: "split-view-drop-zone",
    data: SPLIT_DROP_DATA,
    disabled: dropDisabled,
  })

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      setDroppableRef(node)
    },
    [setDroppableRef],
  )

  // Use local ratios during drag, else persisted. Auto-fix if length mismatch.
  const currentRatios = (() => {
    if (localRatios && localRatios.length === panes.length) return localRatios
    if (splitRatios.length === panes.length) return splitRatios
    return getDefaultRatios(panes.length)
  })()

  // When pane count changes, reset ratios if they don't match
  useEffect(() => {
    if (splitRatios.length !== panes.length && panes.length >= 2) {
      setSplitRatios(getDefaultRatios(panes.length))
    }
  }, [panes.length, splitRatios.length, setSplitRatios])

  return (
    <div
      ref={setRefs}
      className={cn("flex h-full w-full relative", isOver && DROP_OVERLAY_CLASS)}
    >
      {panes.map((pane, i) => (
        <Fragment key={pane.id}>
          {/* Pane — close button is rendered inline by each pane's ChatViewInner */}
          <div
            style={{ width: `${currentRatios[i] * 100}%` }}
            className="h-full overflow-hidden relative flex flex-col"
          >
            {pane.content}
          </div>

          {/* Divider between pane i and pane i+1 */}
          {i < panes.length - 1 && (
            <SplitDivider
              index={i}
              containerRef={containerRef}
              ratiosRef={ratiosRef}
              onLocalRatiosChange={setLocalRatios}
              onCommitRatios={setSplitRatios}
            />
          )}
        </Fragment>
      ))}

      {/* Hidden keep-alive tabs */}
      {hiddenTabs}
    </div>
  )
}

// Drop zone wrapping the solo chat view so dragging a sub-chat onto it
// creates a 2-pane split (same routing as SplitViewContainer's own droppable).
export function SplitDropZone({ children }: { children: React.ReactNode }) {
  const { active } = useDndContext()
  const activeSubChatId = useAgentSubChatStore((s) => s.activeSubChatId)
  const splitPaneIds = useAgentSubChatStore((s) => s.splitPaneIds)
  const dropDisabled =
    !active ||
    !canAddToSplit({ activeSubChatId, splitPaneIds }, String(active.id))
  const { setNodeRef, isOver } = useDroppable({
    id: "solo-chat-drop-zone",
    data: SPLIT_DROP_DATA,
    disabled: dropDisabled,
  })
  return (
    <div
      ref={setNodeRef}
      className={cn("relative h-full w-full", isOver && DROP_OVERLAY_CLASS)}
    >
      {children}
    </div>
  )
}

// --- Divider sub-component ---

interface SplitDividerProps {
  index: number
  containerRef: React.RefObject<HTMLDivElement | null>
  ratiosRef: React.RefObject<number[]>
  onLocalRatiosChange: (ratios: number[] | null) => void
  onCommitRatios: (ratios: number[]) => void
}

function SplitDivider({
  index,
  containerRef,
  ratiosRef,
  onLocalRatiosChange,
  onCommitRatios,
}: SplitDividerProps) {
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      // Cleanup any in-progress drag on unmount
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      const container = containerRef.current
      if (!container) return

      const startX = event.clientX
      const startRatios = [...ratiosRef.current]
      const containerWidth = container.getBoundingClientRect().width
      const pointerId = event.pointerId
      const target = event.currentTarget

      target.setPointerCapture(pointerId)

      // Abort any previous drag session
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      let hasMoved = false
      let finalRatios = startRatios

      const minRatio = MIN_PANE_WIDTH / containerWidth
      // Combined width of the two adjacent panes stays constant
      const combined = startRatios[index] + startRatios[index + 1]

      const onMove = (e: PointerEvent) => {
        const deltaX = e.clientX - startX
        if (!hasMoved && Math.abs(deltaX) < 3) return
        hasMoved = true

        const deltaRatio = deltaX / containerWidth
        let newLeft = startRatios[index] + deltaRatio
        let newRight = combined - newLeft

        // Clamp both panes to minimum
        if (newLeft < minRatio) { newLeft = minRatio; newRight = combined - minRatio }
        if (newRight < minRatio) { newRight = minRatio; newLeft = combined - minRatio }

        const newRatios = [...startRatios]
        newRatios[index] = newLeft
        newRatios[index + 1] = newRight
        finalRatios = newRatios
        onLocalRatiosChange(newRatios)
      }

      const finish = () => {
        controller.abort()
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId)
        }
        if (hasMoved) {
          onCommitRatios(finalRatios)
        }
        onLocalRatiosChange(null)
      }

      document.addEventListener("pointermove", onMove, { signal })
      document.addEventListener("pointerup", finish, { once: true, signal })
      document.addEventListener("pointercancel", finish, { once: true, signal })
    },
    [index, containerRef, ratiosRef, onLocalRatiosChange, onCommitRatios],
  )

  return (
    <div
      className="relative flex-shrink-0 z-10"
      style={{ width: "1px", touchAction: "none" }}
    >
      {/* Visible 1px border */}
      <div className="absolute inset-0 transition-colors duration-100 bg-border" />

      {/* Hit area */}
      <div
        className="absolute top-0 bottom-0 cursor-col-resize"
        style={{ left: "-4px", width: "9px" }}
        onPointerDown={handlePointerDown}
      />
    </div>
  )
}
