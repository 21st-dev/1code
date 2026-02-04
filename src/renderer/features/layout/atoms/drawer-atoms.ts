/**
 * Drawer State Atoms: Customizable Icon Bar System (GENERIC)
 * Feature: 004-customizable-sidebars
 *
 * DESIGN PHILOSOPHY: All atoms are GENERIC and reusable.
 * - Atom families support per-workspace, per-bar state isolation
 * - Width atoms use atomWithStorage for persistence
 * - Drag operation atom for temporary drag state (not persisted)
 */

import { atom } from 'jotai'
import { atomFamily, atomWithStorage } from 'jotai/utils'
import type { DragOperation } from '../types/icon-bar.types'
import {
  DEFAULT_DRAWER_WIDTH,
  MIN_DRAWER_WIDTH,
  MAX_DRAWER_WIDTH,
} from '../types/icon-bar.types'

// ============================================================================
// FOUND-013: Drawer Atom Families (Per-Bar, Per-Workspace State)
// ============================================================================

/**
 * GENERIC: Drawer open/close state for ANY bar in ANY workspace
 *
 * Uses atomFamily to create isolated atoms per combination of:
 * - workspaceId: Isolates state between different projects/workspaces
 * - barId: Supports unlimited icon bars (top, right, bottom, left, etc.)
 *
 * @example
 * const topDrawerOpen = useAtom(drawerOpenAtomFamily({ workspaceId: 'main', barId: 'top' }))
 * const rightDrawerOpen = useAtom(drawerOpenAtomFamily({ workspaceId: 'main', barId: 'right' }))
 */
export const drawerOpenAtomFamily = atomFamily(
  ({ workspaceId, barId }: { workspaceId: string; barId: string }) =>
    atom<boolean>(false),
  (a, b) => a.workspaceId === b.workspaceId && a.barId === b.barId,
)

/**
 * GENERIC: Active page (icon) for ANY bar's drawer in ANY workspace
 *
 * Tracks which icon's page is currently displayed in the drawer.
 * - null: drawer is closed or no page selected
 * - string: icon ID whose page is currently displayed
 *
 * State transitions:
 * - CLOSED (null) → [user clicks icon] → OPEN (iconId)
 * - OPEN (iconId) → [user clicks different icon in same bar] → OPEN (newIconId)
 * - OPEN (iconId) → [user clicks same icon OR close button] → CLOSED (null)
 *
 * @example
 * const topDrawerPage = useAtom(drawerActiveIconAtomFamily({ workspaceId: 'main', barId: 'top' }))
 */
export const drawerActiveIconAtomFamily = atomFamily(
  ({ workspaceId, barId }: { workspaceId: string; barId: string }) =>
    atom<string | null>(null),
  (a, b) => a.workspaceId === b.workspaceId && a.barId === b.barId,
)

// ============================================================================
// FOUND-014: Drawer Width Atoms (Persistent Storage)
// ============================================================================

/**
 * GENERIC: Drawer width storage for ANY bar
 *
 * Uses atomWithStorage for automatic persistence to localStorage.
 * Width is shared across all workspaces (user preference).
 *
 * Constraints:
 * - Default: 400px (DEFAULT_DRAWER_WIDTH)
 * - Minimum: 350px (MIN_DRAWER_WIDTH)
 * - Maximum: 700px (MAX_DRAWER_WIDTH)
 *
 * Implementation note: Width constraints are enforced by ResizableSidebar component,
 * not in the atom itself (allows flexibility for future changes).
 *
 * @example
 * const topDrawerWidth = useAtom(drawerWidthAtomFamily('top'))
 * const rightDrawerWidth = useAtom(drawerWidthAtomFamily('right'))
 */
export const drawerWidthAtomFamily = atomFamily((barId: string) =>
  atomWithStorage<number>(
    `layout:drawer-width:${barId}`,
    DEFAULT_DRAWER_WIDTH,
    undefined,
    { getOnInit: true },
  ),
)

/**
 * Legacy width atoms for backward compatibility during migration
 *
 * These map to the new atom family for specific bars (top, right).
 * Kept for compatibility with existing code during migration phases.
 * Will be deprecated once migration is complete (Phase 5).
 */
export const topDrawerWidthAtom = drawerWidthAtomFamily('top')
export const rightDrawerWidthAtom = drawerWidthAtomFamily('right')

// ============================================================================
// FOUND-015: Drag Operation Atom (Temporary State)
// ============================================================================

/**
 * GENERIC: Temporary drag-and-drop operation state
 *
 * Tracks the current drag operation across ALL icon bars.
 * - Global state (not per-workspace) since only one drag can happen at a time
 * - Transient (not persisted to localStorage)
 * - Reset to initial state on drag end or cancel
 *
 * State lifecycle:
 * 1. IDLE: All fields null
 * 2. DRAGGING: activeIconId and sourceBarId set (on drag start)
 * 3. HOVERING: overIconId and targetBarId set (on drag over)
 * 4. COMMITTED: Update layout config → reset to IDLE (on drag end)
 * 5. CANCELED: Reset to IDLE (on drag cancel)
 *
 * Used for:
 * - Visual feedback during drag (highlight drop zones, show preview)
 * - Validation (check if icon can be dropped in target bar)
 * - Position calculation (where to insert icon in target bar)
 *
 * @example
 * const [dragOp, setDragOp] = useAtom(dragOperationAtom)
 *
 * // On drag start
 * setDragOp({ activeIconId: 'settings', sourceBarId: 'top', overIconId: null, targetBarId: null })
 *
 * // On drag over
 * setDragOp(prev => ({ ...prev, overIconId: 'terminal', targetBarId: 'right' }))
 *
 * // On drag end
 * if (dragOp.activeIconId && dragOp.targetBarId) {
 *   iconLayoutStore.moveIcon(dragOp.activeIconId, dragOp.targetBarId, newPosition)
 * }
 * setDragOp({ activeIconId: null, overIconId: null, sourceBarId: null, targetBarId: null })
 */
export const dragOperationAtom = atom<DragOperation>({
  activeIconId: null,
  overIconId: null,
  sourceBarId: null,
  targetBarId: null,
  isValidDrop: true, // US2-007: Default to true (valid)
})

// ============================================================================
// Helper Atoms (Derived State)
// ============================================================================

/**
 * GENERIC: Check if ANY drawer is currently open in a workspace
 *
 * Derived atom that checks all bars in the workspace.
 * Useful for layout calculations and conditional rendering.
 *
 * @example
 * const anyDrawerOpen = useAtomValue(isAnyDrawerOpenAtom({ workspaceId: 'main', barIds: ['top', 'right'] }))
 */
export const isAnyDrawerOpenAtomFamily = atomFamily(
  ({ workspaceId, barIds }: { workspaceId: string; barIds: string[] }) =>
    atom((get) => {
      return barIds.some((barId) =>
        get(drawerOpenAtomFamily({ workspaceId, barId })),
      )
    }),
  (a, b) =>
    a.workspaceId === b.workspaceId &&
    a.barIds.length === b.barIds.length &&
    a.barIds.every((id, i) => id === b.barIds[i]),
)

/**
 * GENERIC: Check if a specific icon is active (drawer open with this icon's page)
 *
 * Searches across all bars in a workspace to find if an icon is currently active.
 * Returns { barId, isActive } or null if icon is not active anywhere.
 *
 * @example
 * const settingsActive = useAtomValue(isIconActiveAtomFamily({ workspaceId: 'main', iconId: 'settings', barIds: ['top', 'right'] }))
 */
export const isIconActiveAtomFamily = atomFamily(
  ({
    workspaceId,
    iconId,
    barIds,
  }: {
    workspaceId: string
    iconId: string
    barIds: string[]
  }) =>
    atom((get) => {
      for (const barId of barIds) {
        const activeIconId = get(
          drawerActiveIconAtomFamily({ workspaceId, barId }),
        )
        const isOpen = get(drawerOpenAtomFamily({ workspaceId, barId }))
        if (isOpen && activeIconId === iconId) {
          return { barId, isActive: true }
        }
      }
      return null
    }),
  (a, b) =>
    a.workspaceId === b.workspaceId &&
    a.iconId === b.iconId &&
    a.barIds.length === b.barIds.length &&
    a.barIds.every((id, i) => id === b.barIds[i]),
)

/**
 * GENERIC: Check if a drag operation is currently in progress
 *
 * Derived atom for convenience - true if any drag is active.
 *
 * @example
 * const isDragging = useAtomValue(isDraggingAtom)
 */
export const isDraggingAtom = atom((get) => {
  const dragOp = get(dragOperationAtom)
  return dragOp.activeIconId !== null
})
