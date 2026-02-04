/**
 * IconBar Component (GENERIC)
 * Feature: 004-customizable-sidebars
 * Tasks: COMP-001, US2-004
 *
 * Reusable icon bar component that works for ANY orientation and placement.
 * Renders icons based on IconBarDefinition configuration.
 *
 * Performance: Memoized to prevent unnecessary re-renders (PERF-001)
 */

import { memo } from 'react'
import { cn } from '../../../lib/utils'
import type { IconBarProps } from '../types/icon-bar.types'
import { getIcon } from '../constants/icon-registry'
import { DraggableIcon } from './DraggableIcon'
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { useAtomValue } from 'jotai'
import { dragOperationAtom } from '../atoms/drawer-atoms'

/**
 * GENERIC: IconBar component that adapts to any orientation/placement
 * US2-004: Added SortableContext for drop zones
 *
 * @param bar - Bar definition (orientation, placement, etc.)
 * @param iconConfigs - Icons to display in this bar (from layout config)
 * @param iconRegistry - Available icons registry for lookup
 * @param activeIconId - Currently active icon id for this bar's drawer
 * @param onIconClick - Callback when icon is clicked
 * @param isDragOver - Whether this bar is currently being dragged over
 */
export const IconBar = memo(function IconBar({
  bar,
  iconConfigs,
  iconRegistry,
  activeIconId,
  onIconClick,
  isDragOver = false,
}: IconBarProps) {
  // Sort icons by position
  const sortedConfigs = [...iconConfigs].sort((a, b) => a.position - b.position)

  // US2-004: Set up droppable area for this icon bar
  const { setNodeRef, isOver } = useDroppable({
    id: bar.id,
    data: {
      type: 'icon-bar',
      barId: bar.id,
      orientation: bar.orientation,
    },
  })

  // US2-007: Get drag operation state for invalid drop feedback
  const dragOp = useAtomValue(dragOperationAtom)
  const isCurrentBarTarget = dragOp.targetBarId === bar.id
  const isInvalidDrop = isCurrentBarTarget && !dragOp.isValidDrop

  // US2-003: Choose sorting strategy based on orientation
  const sortingStrategy = bar.orientation === 'horizontal'
    ? horizontalListSortingStrategy
    : verticalListSortingStrategy

  // Get base container classes based on orientation
  const containerClasses = cn(
    'flex gap-1 p-1 transition-all duration-200',
    // Orientation-specific layout
    bar.orientation === 'horizontal'
      ? 'flex-row items-center'
      : 'flex-col items-center',
    // Placement-specific positioning (can be extended for top/bottom/left/right)
    bar.placement === 'top' && 'border-b border-border bg-background',
    bar.placement === 'right' && 'border-l border-border bg-background',
    bar.placement === 'bottom' && 'border-t border-border bg-background',
    bar.placement === 'left' && 'border-r border-border bg-background',
    // US2-002: Enhanced drag-over feedback (valid drops)
    (isDragOver || isOver) && !isInvalidDrop && 'ring-2 ring-primary/50 ring-inset bg-primary/5',
    // US2-007: Visual feedback for invalid drop targets
    isInvalidDrop && 'ring-2 ring-destructive/50 ring-inset bg-destructive/5 cursor-not-allowed',
  )

  // US2-004: Extract icon IDs for SortableContext
  const iconIds = sortedConfigs.map(config => config.iconId)

  return (
    <SortableContext items={iconIds} strategy={sortingStrategy}>
      <div
        ref={setNodeRef}
        className={containerClasses}
        role="toolbar"
        aria-label={bar.label}
        aria-orientation={bar.orientation}
        data-bar-id={bar.id}
        data-orientation={bar.orientation}
        data-placement={bar.placement}
      >
        {sortedConfigs.map(config => {
          const iconDef = getIcon(config.iconId)

          // Skip if icon not found in registry (defensive programming)
          if (!iconDef) {
            console.warn(`[IconBar] Icon not found: ${config.iconId}`)
            return null
          }

          const isActive = activeIconId === config.iconId

          return (
            <DraggableIcon
              key={config.iconId}
              icon={iconDef}
              config={config}
              isActive={isActive}
              onClick={() => onIconClick(config.iconId)}
            />
          )
        })}
      </div>
    </SortableContext>
  )
})
