/**
 * useDrawerState Hook: GENERIC drawer state management
 * Feature: 004-customizable-sidebars
 * Task: US1-001
 *
 * DESIGN PHILOSOPHY: Works for ANY icon bar in ANY workspace.
 * - Uses Jotai atom families for per-bar, per-workspace isolation
 * - Provides drawer open/close/toggle operations
 * - Handles page switching within the same drawer
 */

import { useAtom } from 'jotai'
import { useCallback, useMemo } from 'react'
import {
  drawerOpenAtomFamily,
  drawerActiveIconAtomFamily,
} from '../atoms/drawer-atoms'
import type { UseDrawerStateReturn } from '../types/icon-bar.types'

/**
 * GENERIC: Hook for managing drawer state for ANY icon bar
 *
 * Provides methods to:
 * - Open drawer with a specific icon's page
 * - Close drawer
 * - Toggle drawer (opens if closed, closes if same icon clicked again, switches page if different icon)
 *
 * State behavior:
 * - Opening: Sets isOpen=true, activeIconId={iconId}
 * - Closing: Sets isOpen=false, activeIconId=null
 * - Toggling same icon: Closes drawer
 * - Toggling different icon: Switches page (keeps drawer open)
 *
 * @param workspaceId - Workspace identifier for state isolation
 * @param barId - Bar identifier (e.g., "top", "right")
 *
 * @returns Drawer state and control methods
 *
 * @example
 * ```tsx
 * // Top bar drawer
 * const topDrawer = useDrawerState('main', 'top')
 * topDrawer.openDrawer('settings')  // Opens with settings page
 * topDrawer.toggleDrawer('terminal') // Switches to terminal page
 * topDrawer.closeDrawer()           // Closes drawer
 *
 * // Right bar drawer (independent from top)
 * const rightDrawer = useDrawerState('main', 'right')
 * rightDrawer.openDrawer('preview')  // Opens independently
 * ```
 */
export function useDrawerState(
  workspaceId: string,
  barId: string,
): UseDrawerStateReturn {
  // Create stable atom references for this specific workspace + bar combination
  const drawerOpenAtom = useMemo(
    () => drawerOpenAtomFamily({ workspaceId, barId }),
    [workspaceId, barId],
  )
  const drawerActiveIconAtom = useMemo(
    () => drawerActiveIconAtomFamily({ workspaceId, barId }),
    [workspaceId, barId],
  )

  // Get atoms for this specific workspace + bar combination
  const [isOpen, setIsOpen] = useAtom(drawerOpenAtom) as [boolean, (value: boolean) => void]
  const [activeIconId, setActiveIconId] = useAtom(drawerActiveIconAtom) as [string | null, (value: string | null) => void]

  /**
   * Open drawer with a specific icon's page
   *
   * - Sets drawer to open state
   * - Sets the active icon (page to display)
   *
   * @param iconId - ID of icon whose page should be displayed
   */
  const openDrawer = useCallback(
    (iconId: string) => {
      setIsOpen(true)
      setActiveIconId(iconId)
    },
    [setIsOpen, setActiveIconId],
  )

  /**
   * Close drawer
   *
   * - Sets drawer to closed state
   * - Clears active icon (no page displayed)
   */
  const closeDrawer = useCallback(() => {
    setIsOpen(false)
    setActiveIconId(null)
  }, [setIsOpen, setActiveIconId])

  /**
   * Toggle drawer with icon
   *
   * Behavior depends on current state:
   * 1. Drawer closed → Open with this icon's page
   * 2. Drawer open, same icon clicked → Close drawer (toggle off)
   * 3. Drawer open, different icon clicked → Switch to new icon's page (keep open)
   *
   * This matches expected user behavior:
   * - First click opens
   * - Clicking same icon again closes
   * - Clicking different icon switches content
   *
   * @param iconId - ID of icon to toggle/switch to
   */
  const toggleDrawer = useCallback(
    (iconId: string) => {
      if (!isOpen) {
        // Case 1: Drawer closed → open with this icon
        openDrawer(iconId)
      } else if (activeIconId === iconId) {
        // Case 2: Same icon clicked → close drawer (toggle off)
        closeDrawer()
      } else {
        // Case 3: Different icon clicked → switch page (keep drawer open)
        setActiveIconId(iconId)
      }
    },
    [isOpen, activeIconId, openDrawer, closeDrawer, setActiveIconId],
  )

  return {
    isOpen,
    activeIconId,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  }
}
