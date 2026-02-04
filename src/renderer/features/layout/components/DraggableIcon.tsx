/**
 * DraggableIcon Component (GENERIC)
 * Feature: 004-customizable-sidebars
 *
 * Generic wrapper component that makes any icon draggable using dnd-kit's useSortable hook.
 * Works with ANY icon bar configuration (horizontal or vertical).
 *
 * Performance: Memoized to prevent unnecessary re-renders (PERF-001)
 */

import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../../../lib/utils'
import type { DraggableIconProps } from '../types/icon-bar.types'
import { Button } from '../../../components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../components/ui/tooltip'
import { useAtomValue } from 'jotai'
import { dragOperationAtom } from '../atoms/drawer-atoms'

/**
 * GENERIC: DraggableIcon component that wraps any icon with drag-and-drop capability
 *
 * @param icon - Icon data (label, icon component, page)
 * @param config - Icon configuration (position info, barId)
 * @param isActive - Whether this icon is currently active (drawer open with this icon's page)
 * @param onClick - Click handler for toggling drawer
 * @param isDragging - Whether icon is being dragged (optional, managed by parent)
 */
export const DraggableIcon = memo(function DraggableIcon({
  icon,
  config,
  isActive,
  onClick,
  isDragging: externalIsDragging,
}: DraggableIconProps) {
  // dnd-kit sortable hook - provides drag state and transforms
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: internalIsDragging,
  } = useSortable({
    id: icon.id,
    data: {
      type: 'icon',
      icon,
      config,
    },
  })

  // Use external isDragging prop if provided, otherwise use internal state
  const isDragging = externalIsDragging ?? internalIsDragging

  // US2-007: Get drag operation state for invalid drop feedback
  const dragOp = useAtomValue(dragOperationAtom)
  const isOverInvalidTarget = dragOp.activeIconId === icon.id && !dragOp.isValidDrop && dragOp.targetBarId !== null

  // Apply transform for drag animation
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const IconComponent = icon.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-icon-id={icon.id}
      data-bar-id={config.barId}
      className={cn(
        'relative',
        isDragging && 'z-50', // Ensure dragged item appears above others
      )}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isActive ? 'default' : 'ghost'}
              size="icon"
              onClick={onClick}
              aria-label={icon.label}
              aria-pressed={isActive}
              className={cn(
                'transition-all duration-200 cursor-grab active:cursor-grabbing',
                isActive && 'bg-primary text-primary-foreground',
                // US2-002: Enhanced visual feedback during drag
                isDragging && 'opacity-40 cursor-grabbing scale-95',
                !isDragging && 'hover:scale-105',
                // US2-007: Visual feedback for invalid drop targets
                isOverInvalidTarget && 'cursor-not-allowed',
              )}
              {...attributes}
              {...listeners}
            >
              {typeof IconComponent === 'function' ? (
                <IconComponent className="h-4 w-4" />
              ) : (
                IconComponent
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{icon.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
})
