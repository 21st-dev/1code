import { useState, useCallback } from 'react'
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import { useIconLayoutStore } from '../stores/icon-layout-store'
import { ICON_REGISTRY } from '../constants/icon-registry'
import { ICON_BAR_REGISTRY } from '../utils/icon-bar-registry'

interface DragState {
  activeIconId: string | null
  overIconId: string | null
  sourceBarId: string | null
  targetBarId: string | null
}

export function useIconDragDrop() {
  const [dragState, setDragState] = useState<DragState>({
    activeIconId: null,
    overIconId: null,
    sourceBarId: null,
    targetBarId: null,
  })

  const { moveIcon, reorderIcon, getIconLocation } = useIconLayoutStore()

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const iconId = active.id as string
    const location = getIconLocation(iconId)

    setDragState({
      activeIconId: iconId,
      overIconId: null,
      sourceBarId: location?.barId || null,
      targetBarId: null,
    })
  }, [getIconLocation])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event

    if (!over) {
      setDragState(prev => ({
        ...prev,
        overIconId: null,
        targetBarId: null,
      }))
      return
    }

    const overId = over.id as string
    const overLocation = getIconLocation(overId)

    // Check if we're over a bar container
    const isOverBar = ICON_BAR_REGISTRY.some(bar => bar.id === overId)

    if (isOverBar) {
      setDragState(prev => ({
        ...prev,
        overIconId: null,
        targetBarId: overId,
      }))
    } else {
      setDragState(prev => ({
        ...prev,
        overIconId: overId,
        targetBarId: overLocation?.barId || null,
      }))
    }
  }, [getIconLocation])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      // Drag cancelled - reset state
      setDragState({
        activeIconId: null,
        overIconId: null,
        sourceBarId: null,
        targetBarId: null,
      })
      return
    }

    const iconId = active.id as string
    const overId = over.id as string
    const sourceLocation = getIconLocation(iconId)
    const overLocation = getIconLocation(overId)

    if (!sourceLocation) {
      setDragState({
        activeIconId: null,
        overIconId: null,
        sourceBarId: null,
        targetBarId: null,
      })
      return
    }

    // Check if we're dropping on a bar container
    const isOverBar = ICON_BAR_REGISTRY.some(bar => bar.id === overId)

    if (isOverBar) {
      // Dropping on an empty bar
      if (overId !== sourceLocation.barId) {
        moveIcon(iconId, overId, 0) // Add to end of target bar
      }
    } else if (overLocation) {
      // Dropping on another icon
      if (sourceLocation.barId === overLocation.barId) {
        // Same bar - reorder
        if (iconId !== overId) {
          reorderIcon(iconId, sourceLocation.barId, overLocation.position)
        }
      } else {
        // Different bar - move
        moveIcon(iconId, overLocation.barId, overLocation.position)
      }
    }

    // Reset drag state
    setDragState({
      activeIconId: null,
      overIconId: null,
      sourceBarId: null,
      targetBarId: null,
    })
  }, [getIconLocation, moveIcon, reorderIcon])

  const handleDragCancel = useCallback(() => {
    setDragState({
      activeIconId: null,
      overIconId: null,
      sourceBarId: null,
      targetBarId: null,
    })
  }, [])

  return {
    dragState,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
