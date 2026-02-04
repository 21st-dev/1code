/**
 * CustomizableLayout Component (GENERIC)
 * Feature: 004-customizable-sidebars
 * Tasks: COMP-005, COMP-006, COMP-007, COMP-008
 *
 * Main layout orchestrator that:
 * - Wraps all icon bars and drawers in a DndContext for drag-and-drop
 * - Renders icon bars based on configuration registry
 * - Manages drawer state for each icon bar
 * - Provides main content area for application
 * - Handles drag-and-drop operations (COMP-006)
 *
 * Design: GENERIC architecture - works with ANY number of icon bars through configuration.
 * Adding new bars requires only updating the registry, no code changes here.
 */

import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import type { CustomizableLayoutProps, IconBarDefinition, Icon, IconLayoutConfig } from '../types/icon-bar.types'
import { IconBar } from './IconBar'
import { AssociatedDrawer } from './AssociatedDrawer'
import { useIconLayoutStore } from '../stores/icon-layout-store'
import {
  drawerOpenAtomFamily,
  drawerActiveIconAtomFamily,
  drawerWidthAtomFamily,
  dragOperationAtom,
} from '../atoms/drawer-atoms'
import { useDrawerState } from '../hooks/useDrawerState'
import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'

/**
 * Helper component to render an icon bar with its drawer state
 * Necessary because Jotai hooks must be called unconditionally
 */
interface IconBarRendererProps {
  bar: IconBarDefinition
  workspaceId: string
  icons: Icon[]
  getBarIcons: (barId: string) => any[]
}

function IconBarRenderer({ bar, workspaceId, icons, getBarIcons }: IconBarRendererProps) {
  const barIcons = getBarIcons(bar.id)

  // US1-002: Use useDrawerState hook for drawer state management
  const drawerState = useDrawerState(workspaceId, bar.id)

  return (
    <IconBar
      bar={bar}
      iconConfigs={barIcons}
      iconRegistry={icons}
      activeIconId={drawerState.activeIconId}
      onIconClick={drawerState.toggleDrawer}
      // isDragOver will be added in COMP-006
    />
  )
}

/**
 * Helper component to render a drawer with its state
 */
interface DrawerRendererProps {
  bar: IconBarDefinition
  workspaceId: string
  icons: Icon[]
}

function DrawerRenderer({ bar, workspaceId, icons }: DrawerRendererProps) {
  // US1-002: Use useDrawerState hook for drawer state management
  const drawerState = useDrawerState(workspaceId, bar.id)
  const widthAtom = drawerWidthAtomFamily(bar.id)

  const handlePageChange = (iconId: string) => {
    // Switch to a different icon's page within the same drawer
    drawerState.openDrawer(iconId)
  }

  return (
    <AssociatedDrawer
      bar={bar}
      isOpen={drawerState.isOpen}
      activeIconId={drawerState.activeIconId}
      widthAtom={widthAtom}
      onClose={drawerState.closeDrawer}
      icons={icons}
      onPageChange={handlePageChange}
      workspaceId={workspaceId}
    />
  )
}

/**
 * COMP-005, COMP-006, COMP-007, COMP-008: CustomizableLayout Component
 *
 * Orchestrates the entire customizable icon bar system with drag-and-drop support.
 *
 * Architecture:
 * - DndContext provides drag-and-drop context for all icon bars
 * - Each icon bar renders independently based on configuration
 * - Each drawer is associated with one icon bar
 * - Main content area receives remaining space
 * - Drag handlers manage icon movement between and within bars (COMP-006)
 *
 * @param workspaceId - Workspace identifier for state isolation
 * @param iconBars - Icon bar definitions from registry
 * @param icons - Available icons registry
 * @param children - Main content area (e.g., chat interface)
 *
 * @example
 * <CustomizableLayout
 *   workspaceId="main"
 *   iconBars={ICON_BAR_REGISTRY}
 *   icons={ICON_REGISTRY}
 * >
 *   <MainChatInterface />
 * </CustomizableLayout>
 */
export function CustomizableLayout({
  workspaceId,
  iconBars,
  icons,
  children,
}: CustomizableLayoutProps) {
  // Get icon layout configuration from Zustand store
  const { config, getBarIcons, moveIcon, reorderIcon, getIconLocation } = useIconLayoutStore()

  // Get drag operation state
  const setDragOperation = useSetAtom(dragOperationAtom)
  const dragOperation = useAtomValue(dragOperationAtom)

  /**
   * COMP-008: Configure dnd-kit sensors for drag interactions
   *
   * Sensors enable different input methods for drag-and-drop:
   * - PointerSensor: Mouse and touch pointer events
   * - KeyboardSensor: Keyboard navigation for accessibility
   * - TouchSensor: Touch-specific events for mobile devices
   *
   * Activation constraints prevent accidental drags and conflicts with click events.
   */
  const sensors = useSensors(
    // Mouse sensor with delay to prevent accidental drags on click
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require 5px movement before drag starts (prevents click interference)
        distance: 5,
      },
    }),
    // Keyboard sensor for accessibility (WCAG 2.1 compliant)
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    // Touch sensor for mobile/tablet support with press delay
    useSensor(TouchSensor, {
      activationConstraint: {
        // Require 250ms press before drag starts (prevents scroll interference)
        delay: 250,
        // Allow 5px tolerance during press (prevents cancellation on slight movement)
        tolerance: 5,
      },
    }),
  )

  /**
   * COMP-006: handleDragStart
   * Called when user starts dragging an icon
   *
   * Updates drag operation atom with:
   * - activeIconId: The icon being dragged
   * - sourceBarId: The bar the icon is being dragged from
   */
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event

    // Extract icon ID from drag event
    const iconId = active.id as string

    // Find which bar this icon belongs to
    const location = getIconLocation(iconId)

    if (!location) {
      console.warn(`[CustomizableLayout] Icon ${iconId} not found in any bar`)
      return
    }

    console.log(`[CustomizableLayout] Drag started: icon=${iconId}, sourceBar=${location.barId}`)

    // Update drag operation state
    setDragOperation({
      activeIconId: iconId,
      sourceBarId: location.barId,
      overIconId: null,
      targetBarId: null,
      isValidDrop: true, // US2-007: Default to valid
    })
  }

  /**
   * COMP-006: handleDragOver
   * US2-006: Added validation for allowedBars
   * US2-007: Added isValidDrop for visual feedback
   *
   * Called when user drags icon over a droppable area
   *
   * Updates drag operation atom with:
   * - overIconId: The icon being hovered over (if any)
   * - targetBarId: The bar being hovered over
   * - isValidDrop: Whether this is a valid drop target
   *
   * This provides visual feedback for valid/invalid drop targets
   */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event

    if (!over) {
      // Dragging over empty space - clear hover state
      setDragOperation(prev => ({
        ...prev,
        overIconId: null,
        targetBarId: null,
        isValidDrop: true,
      }))
      return
    }

    const activeIconId = active.id as string
    const overIconId = over.id as string

    // Find which bar the target icon belongs to
    const targetLocation = getIconLocation(overIconId)

    if (!targetLocation) {
      console.warn(`[CustomizableLayout] Over icon ${overIconId} not found in any bar`)
      return
    }

    // US2-006: Validate if icon is allowed in target bar
    const draggedIcon = icons.find(icon => icon.id === activeIconId)
    const isValidDrop = draggedIcon?.allowedBars
      ? draggedIcon.allowedBars.includes(targetLocation.barId)
      : true // If no restrictions, allow anywhere

    // Update drag operation with hover state
    setDragOperation(prev => ({
      ...prev,
      overIconId,
      targetBarId: targetLocation.barId,
      isValidDrop, // US2-007: Set validation result
    }))
  }

  /**
   * COMP-006: handleDragEnd
   * Called when user releases the dragged icon
   *
   * Performs the actual icon move/reorder operation:
   * - If dropped in same bar: calls reorderIcon()
   * - If dropped in different bar: calls moveIcon()
   * - If dropped in invalid location: no-op (icon returns to original position)
   *
   * Finally resets drag operation atom to idle state
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    // Reset drag operation state
    const resetDragOp = () => {
      setDragOperation({
        activeIconId: null,
        overIconId: null,
        sourceBarId: null,
        targetBarId: null,
        isValidDrop: true, // US2-007: Reset to default
      })
    }

    // If not dropped over anything, cancel drag
    if (!over) {
      console.log('[CustomizableLayout] Drag cancelled - no drop target')
      resetDragOp()
      return
    }

    const activeIconId = active.id as string
    const overIconId = over.id as string

    // If dropped on itself, no change needed
    if (activeIconId === overIconId) {
      console.log('[CustomizableLayout] Drag ended - no change (same icon)')
      resetDragOp()
      return
    }

    // Find locations of both icons
    const activeLocation = getIconLocation(activeIconId)
    const overLocation = getIconLocation(overIconId)

    if (!activeLocation || !overLocation) {
      console.warn('[CustomizableLayout] Cannot find icon locations for drag end')
      resetDragOp()
      return
    }

    const sourceBarId = activeLocation.barId
    const targetBarId = overLocation.barId

    // Check if icon is allowed in target bar
    const draggedIcon = icons.find(icon => icon.id === activeIconId)
    if (draggedIcon?.allowedBars && !draggedIcon.allowedBars.includes(targetBarId)) {
      console.warn(
        `[CustomizableLayout] Icon ${activeIconId} not allowed in bar ${targetBarId}. Allowed: ${draggedIcon.allowedBars.join(', ')}`
      )
      resetDragOp()
      return
    }

    if (sourceBarId === targetBarId) {
      // Reorder within same bar
      const barIcons = getBarIcons(sourceBarId)
      const oldIndex = barIcons.findIndex(ic => ic.iconId === activeIconId)
      const newIndex = barIcons.findIndex(ic => ic.iconId === overIconId)

      if (oldIndex === -1 || newIndex === -1) {
        console.warn('[CustomizableLayout] Cannot find icon indices for reorder')
        resetDragOp()
        return
      }

      console.log(
        `[CustomizableLayout] Reordering icon ${activeIconId} in bar ${sourceBarId}: ${oldIndex} → ${newIndex}`
      )

      // Call store method to reorder
      reorderIcon(activeIconId, sourceBarId, newIndex)
    } else {
      // Move to different bar
      const targetBarIcons = getBarIcons(targetBarId)
      const newPosition = targetBarIcons.findIndex(ic => ic.iconId === overIconId)

      if (newPosition === -1) {
        console.warn('[CustomizableLayout] Cannot find target position for move')
        resetDragOp()
        return
      }

      console.log(
        `[CustomizableLayout] Moving icon ${activeIconId} from ${sourceBarId} to ${targetBarId} at position ${newPosition}`
      )

      // Call store method to move
      moveIcon(activeIconId, targetBarId, newPosition)
    }

    resetDragOp()
  }

  /**
   * COMP-006: handleDragCancel
   * Called when drag operation is cancelled (e.g., user presses Escape)
   *
   * Resets drag operation atom to idle state without making any changes
   */
  const handleDragCancel = () => {
    console.log('[CustomizableLayout] Drag cancelled')

    setDragOperation({
      activeIconId: null,
      overIconId: null,
      sourceBarId: null,
      targetBarId: null,
      isValidDrop: true, // US2-007: Reset to default
    })
  }

  /**
   * MIG4: desktopViewAtom has been removed in Phase 8.
   * Drawers are now controlled independently via icon bar system.
   */

  // Filter bars by placement for rendering
  const topBars = iconBars.filter(bar => bar.placement === 'top')
  const bottomBars = iconBars.filter(bar => bar.placement === 'bottom')
  const leftBars = iconBars.filter(bar => bar.placement === 'left')
  const rightBars = iconBars.filter(bar => bar.placement === 'right')

  // Find the icon being dragged for the DragOverlay preview
  const draggedIcon = dragOperation.activeIconId
    ? icons.find(icon => icon.id === dragOperation.activeIconId)
    : null

  return (
    <DndContext
      // COMP-008: Sensors for mouse, touch, and keyboard interactions
      sensors={sensors}

      // COMP-006: Drag handlers for icon customization
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}

      // US2-003: Collision detection using pointerWithin for better multi-container support
      collisionDetection={pointerWithin}
    >
      {/* Main layout container */}
      <div className="flex h-full w-full flex-col">
        {/* Top icon bars (horizontal) */}
        {topBars.map(bar => (
          <IconBarRenderer
            key={bar.id}
            bar={bar}
            workspaceId={workspaceId}
            icons={icons}
            getBarIcons={getBarIcons}
          />
        ))}

        {/* Middle section: main content + side icon bars + drawers */}
        <div className="relative flex flex-1 overflow-hidden">
          {/* Left icon bars (vertical) */}
          {leftBars.map(bar => (
            <IconBarRenderer
              key={bar.id}
              bar={bar}
              workspaceId={workspaceId}
              icons={icons}
              getBarIcons={getBarIcons}
            />
          ))}

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>

          {/* Right icon bars (vertical) */}
          {rightBars.map(bar => (
            <IconBarRenderer
              key={bar.id}
              bar={bar}
              workspaceId={workspaceId}
              icons={icons}
              getBarIcons={getBarIcons}
            />
          ))}

          {/* Associated drawers for all bars */}
          {/* Drawers are positioned absolutely and slide in from their configured side */}
          <div className="pointer-events-none absolute inset-0">
            {iconBars.map(bar => (
              <DrawerRenderer
                key={`drawer-${bar.id}`}
                bar={bar}
                workspaceId={workspaceId}
                icons={icons}
              />
            ))}
          </div>
        </div>

        {/* Bottom icon bars (horizontal) */}
        {bottomBars.map(bar => (
          <IconBarRenderer
            key={bar.id}
            bar={bar}
            workspaceId={workspaceId}
            icons={icons}
            getBarIcons={getBarIcons}
          />
        ))}
      </div>

      {/* COMP-007: DragOverlay shows icon preview during drag */}
      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {draggedIcon ? (
          <div className="cursor-grabbing">
            <Button
              variant="default"
              size="icon"
              className={cn(
                'pointer-events-none shadow-lg ring-2 ring-primary/50',
                'bg-primary text-primary-foreground',
              )}
            >
              {typeof draggedIcon.icon === 'function' ? (
                <draggedIcon.icon className="h-4 w-4" />
              ) : (
                draggedIcon.icon
              )}
            </Button>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
