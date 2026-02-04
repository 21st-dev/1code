/**
 * TypeScript Contracts: Customizable Icon Bar System (GENERIC)
 * Feature: 004-customizable-sidebars
 *
 * DESIGN PHILOSOPHY: All components are GENERIC and reusable.
 * - IconBar works for ANY orientation, placement, or configuration
 * - DraggableIcon is a wrapper that works with ANY icon
 * - Store and atoms support unlimited icon bars dynamically
 * - Adding new bars requires only configuration, no new components
 */

import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

// ============================================================================
// Core Entities (GENERIC)
// ============================================================================

/**
 * GENERIC: Defines an icon bar instance (reusable for any number of bars)
 */
export interface IconBarDefinition {
  /** Unique bar identifier (e.g., "top", "right", "bottom") */
  id: string

  /** Display name for accessibility */
  label: string

  /** Layout direction */
  orientation: 'horizontal' | 'vertical'

  /** Screen position */
  placement: 'top' | 'right' | 'bottom' | 'left'

  /** Which side associated drawer slides from */
  drawerSide: 'left' | 'right'

  /** Default icon IDs for this bar (ordered) */
  defaultIcons: string[]
}

/**
 * GENERIC: Represents a draggable icon that can be placed in ANY icon bar
 */
export interface Icon {
  /** Unique identifier (e.g., "agents", "terminal", "settings") */
  id: string

  /** Display name for accessibility and tooltips */
  label: string

  /** Icon component (Lucide or custom React component) */
  icon: LucideIcon | React.ComponentType

  /** Page content to display in drawer when icon is clicked */
  page: ReactNode

  /** Optional: restrict to specific bars (default: all bars allowed) */
  allowedBars?: string[]
}

/**
 * GENERIC: Represents the position of an icon within ANY bar (persisted)
 */
export interface IconConfig {
  /** Icon identifier (references Icon.id) */
  iconId: string

  /** Bar identifier (references IconBarDefinition.id) */
  barId: string

  /** 0-indexed position within the bar */
  position: number
}

/**
 * GENERIC: Complete icon placement configuration for a user (persisted to localStorage)
 * Supports ANY number of icon bars dynamically
 */
export interface IconLayoutConfig {
  /** Schema version for migrations */
  version: number

  /** GENERIC: Map of barId → icons (supports unlimited bars) */
  bars: Record<string, IconConfig[]>

  /** ISO 8601 timestamp of last modification */
  lastModified: string
}

/**
 * GENERIC: Runtime state for ANY drawer (not persisted)
 */
export interface DrawerState {
  /** Which bar this drawer belongs to */
  barId: string

  /** Whether drawer is visible */
  isOpen: boolean

  /** Currently displayed icon id (null when closed) */
  activeIconId: string | null

  /** Current width in pixels */
  width: number
}

/**
 * GENERIC: Temporary state during drag-and-drop operation (works for ANY bars)
 */
export interface DragOperation {
  /** Icon being dragged (null when not dragging) */
  activeIconId: string | null

  /** Icon being hovered over */
  overIconId: string | null

  /** Origin bar ID */
  sourceBarId: string | null

  /** Destination bar ID */
  targetBarId: string | null
}

// ============================================================================
// Component Props (GENERIC)
// ============================================================================

/**
 * GENERIC: Props for CustomizableLayout (supports N icon bars)
 */
export interface CustomizableLayoutProps {
  /** Workspace identifier for state isolation */
  workspaceId: string

  /** Icon bar definitions to render */
  iconBars: IconBarDefinition[]

  /** Available icons registry */
  icons: Icon[]

  /** Main content area */
  children: ReactNode
}

/**
 * GENERIC: Props for reusable IconBar component (any orientation/placement)
 */
export interface IconBarProps {
  /** Bar definition */
  bar: IconBarDefinition

  /** Icons to display in this bar (from layout config) */
  iconConfigs: IconConfig[]

  /** Available icons registry */
  iconRegistry: Icon[]

  /** Currently active icon id for this bar's drawer (if any) */
  activeIconId: string | null

  /** Callback when icon is clicked */
  onIconClick: (iconId: string) => void

  /** Whether this bar is currently being dragged over */
  isDragOver?: boolean
}

/**
 * GENERIC: Props for reusable DraggableIcon wrapper
 */
export interface DraggableIconProps {
  /** Icon data */
  icon: Icon

  /** Icon configuration (position info) */
  config: IconConfig

  /** Whether this icon is currently active (drawer open with this icon's page) */
  isActive: boolean

  /** Click handler */
  onClick: () => void

  /** Whether icon is being dragged */
  isDragging?: boolean
}

/**
 * GENERIC: Props for drawer content component (works with any bar)
 */
export interface DrawerContentProps {
  /** Bar this drawer belongs to */
  bar: IconBarDefinition

  /** Currently active icon id */
  activeIconId: string | null

  /** Available icons for this drawer */
  icons: Icon[]

  /** Callback to switch pages */
  onPageChange: (iconId: string) => void

  /** Callback to close drawer */
  onClose: () => void

  /** Workspace identifier */
  workspaceId: string
}

/**
 * GENERIC: Props for AssociatedDrawer (drawer linked to any icon bar)
 */
export interface AssociatedDrawerProps {
  /** Bar this drawer is associated with */
  bar: IconBarDefinition

  /** Whether drawer is open */
  isOpen: boolean

  /** Currently active icon id */
  activeIconId: string | null

  /** Drawer width atom (for persistence) */
  widthAtom: any // Jotai atom

  /** Close handler */
  onClose: () => void

  /** Available icons */
  icons: Icon[]

  /** Page change handler */
  onPageChange: (iconId: string) => void

  /** Workspace ID */
  workspaceId: string
}

// ============================================================================
// Store Interfaces (GENERIC)
// ============================================================================

/**
 * GENERIC: Zustand store interface for icon layout configuration
 * Supports ANY number of icon bars
 */
export interface IconLayoutStore {
  /** Current configuration */
  config: IconLayoutConfig

  /** GENERIC: Move icon to ANY bar */
  moveIcon: (iconId: string, toBarId: string, newPosition: number) => void

  /** GENERIC: Reorder icon within ANY bar */
  reorderIcon: (iconId: string, barId: string, newPosition: number) => void

  /** Reset to default configuration */
  resetToDefaults: () => void

  /** GENERIC: Get current location of an icon (works for any bar) */
  getIconLocation: (iconId: string) => { barId: string; position: number } | null

  /** GENERIC: Get all icons for ANY bar */
  getBarIcons: (barId: string) => IconConfig[]

  /** GENERIC: Reconcile config with bar and icon registries */
  reconcileWithRegistry: (barRegistry: IconBarDefinition[], iconRegistry: Icon[]) => void
}

// ============================================================================
// Hook Return Types (GENERIC)
// ============================================================================

/**
 * GENERIC: Return type for useDrawerState hook (works for any bar)
 */
export interface UseDrawerStateReturn {
  /** Whether drawer is open */
  isOpen: boolean

  /** Currently active icon id */
  activeIconId: string | null

  /** Open drawer with specific icon's page */
  openDrawer: (iconId: string) => void

  /** Close drawer */
  closeDrawer: () => void

  /** Toggle drawer with icon (opens if closed, closes if same icon clicked) */
  toggleDrawer: (iconId: string) => void
}

/**
 * GENERIC: Return type for useIconBar hook
 */
export interface UseIconBarReturn {
  /** Bar definition */
  bar: IconBarDefinition

  /** Icon configurations for this bar */
  iconConfigs: IconConfig[]

  /** Resolved icon objects */
  icons: Icon[]

  /** Drawer state for this bar */
  drawer: UseDrawerStateReturn
}

/**
 * GENERIC: Return type for useIconDragDrop hook (multi-bar support)
 */
export interface UseIconDragDropReturn {
  /** Current drag operation state */
  dragOperation: DragOperation

  /** dnd-kit sensors */
  sensors: any

  /** Handle drag start */
  handleDragStart: (event: any) => void

  /** Handle drag over */
  handleDragOver: (event: any) => void

  /** Handle drag end */
  handleDragEnd: (event: any) => void

  /** Handle drag cancel */
  handleDragCancel: () => void
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Icon position update action (GENERIC)
 */
export type IconPositionUpdate =
  | { type: 'move'; iconId: string; toBarId: string; newPosition: number }
  | { type: 'reorder'; iconId: string; barId: string; newPosition: number }

/**
 * Validation error type
 */
export interface ValidationError {
  field: string
  message: string
  code: 'duplicate_id' | 'invalid_position' | 'missing_icon' | 'invalid_bar' | 'schema_mismatch'
}

/**
 * Migration result type
 */
export interface MigrationResult {
  success: boolean
  fromVersion: number
  toVersion: number
  errors?: ValidationError[]
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * Default drawer widths (pixels)
 */
export const DEFAULT_DRAWER_WIDTH = 400
export const MIN_DRAWER_WIDTH = 350
export const MAX_DRAWER_WIDTH = 700

/**
 * Animation durations (milliseconds)
 */
export const DRAWER_ANIMATION_DURATION = 250
export const PAGE_TRANSITION_DURATION = 150

/**
 * localStorage key prefix
 */
export const STORAGE_KEY_PREFIX = 'icon-layout-config'
