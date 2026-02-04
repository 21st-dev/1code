/**
 * AssociatedDrawer Component (GENERIC)
 *
 * Wraps ResizableSidebar to create a drawer associated with any icon bar.
 * Handles drawer open/close state and renders content for the active icon.
 *
 * Design: Works with ANY icon bar through configuration, not hardcoded to specific bars.
 */

import { ResizableSidebar } from '../../../components/ui/resizable-sidebar'
import type { AssociatedDrawerProps } from '../types/icon-bar.types'
import {
  MIN_DRAWER_WIDTH,
  MAX_DRAWER_WIDTH,
  DRAWER_ANIMATION_DURATION,
} from '../types/icon-bar.types'
import { DrawerContent } from './DrawerContent'

/**
 * US1-006, US1-007: AssociatedDrawer Component
 *
 * Wraps ResizableSidebar to create a drawer associated with any icon bar.
 * - Uses ResizableSidebar with side="right" for both drawers (US1-006)
 * - Applies consistent width constraints from constants (US1-007)
 */
export function AssociatedDrawer({
  bar,
  isOpen,
  activeIconId,
  widthAtom,
  onClose,
  icons,
  onPageChange,
  workspaceId,
}: AssociatedDrawerProps) {
  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={onClose}
      widthAtom={widthAtom}
      side={bar.drawerSide}
      minWidth={MIN_DRAWER_WIDTH}
      maxWidth={MAX_DRAWER_WIDTH}
      animationDuration={DRAWER_ANIMATION_DURATION / 1000} // Convert ms to seconds
      disableClickToClose={false}
      showResizeTooltip={true}
      dataAttributes={{
        'drawer-bar-id': bar.id,
        'drawer-orientation': bar.orientation,
      }}
    >
      <DrawerContent
        bar={bar}
        activeIconId={activeIconId}
        icons={icons}
        onPageChange={onPageChange}
        onClose={onClose}
        workspaceId={workspaceId}
      />
    </ResizableSidebar>
  )
}
