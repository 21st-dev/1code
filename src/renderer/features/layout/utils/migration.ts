/**
 * Migration Utilities: Icon Bar System
 * Feature: 004-customizable-sidebars
 * Phase: MIG5 (User Data Migration)
 *
 * Handles migration of user preferences from the old system to the new icon bar system.
 */

import type { IconLayoutConfig } from '../types/icon-bar.types'
import { toast } from 'sonner'

/**
 * Get default icon layout (lazy evaluation to avoid circular dependencies)
 * This is imported dynamically when needed to avoid module-load-time errors in tests
 */
function getDefaultIconLayout(): IconLayoutConfig | null {
  try {
    // Dynamic import to avoid circular dependency during tests
    const { DEFAULT_ICON_LAYOUT } = require('../stores/icon-layout-store')
    return DEFAULT_ICON_LAYOUT
  } catch (error) {
    // In test environments without proper window mocks, return null
    console.error('[Migration] Failed to get default layout:', error)
    return null
  }
}

/**
 * Migration flag key in localStorage
 * When set to 'true', migration has already been completed
 */
const MIGRATION_FLAG_KEY = 'icon-bar-migration-v1'

/**
 * Legacy sidebar width keys (from old system)
 */
const LEGACY_WIDTH_KEYS = {
  preview: 'agentsPreviewSidebarWidth',
  diff: 'agentsDiffSidebarWidth',
} as const

/**
 * New drawer width keys (icon bar system)
 */
const NEW_WIDTH_KEYS = {
  top: 'layout:drawer-width:top',
  right: 'layout:drawer-width:right',
} as const

/**
 * Check if migration has already been run
 */
export function hasMigrationRun(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG_KEY) === 'true'
  } catch (error) {
    console.warn('[Migration] Failed to check migration flag:', error)
    return false
  }
}

/**
 * Mark migration as complete
 */
export function setMigrationComplete(): void {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
    console.log('[Migration] Migration flag set to complete')
  } catch (error) {
    console.error('[Migration] Failed to set migration flag:', error)
  }
}

/**
 * MIG5-002: Migrate existing sidebar width atoms to new drawer width atoms
 *
 * Maps old width values to new storage keys:
 * - agentsPreviewSidebarWidth → layout:drawer-width:top
 * - agentsDiffSidebarWidth → layout:drawer-width:right
 *
 * @returns Object with migration results { top: number | null, right: number | null }
 */
export function migrateDrawerWidths(): {
  top: number | null
  right: number | null
} {
  const results = { top: null as number | null, right: null as number | null }

  try {
    // Migrate preview sidebar width to top drawer width
    const previewWidth = localStorage.getItem(LEGACY_WIDTH_KEYS.preview)
    if (previewWidth !== null) {
      try {
        const width = JSON.parse(previewWidth)
        if (typeof width === 'number' && width > 0) {
          localStorage.setItem(NEW_WIDTH_KEYS.top, JSON.stringify(width))
          results.top = width
          console.log(
            `[Migration] Migrated preview sidebar width to top drawer: ${width}px`,
          )
        }
      } catch (parseError) {
        console.warn(
          '[Migration] Failed to parse preview width, skipping:',
          parseError,
        )
      }
    }

    // Migrate diff sidebar width to right drawer width
    const diffWidth = localStorage.getItem(LEGACY_WIDTH_KEYS.diff)
    if (diffWidth !== null) {
      try {
        const width = JSON.parse(diffWidth)
        if (typeof width === 'number' && width > 0) {
          localStorage.setItem(NEW_WIDTH_KEYS.right, JSON.stringify(width))
          results.right = width
          console.log(
            `[Migration] Migrated diff sidebar width to right drawer: ${width}px`,
          )
        }
      } catch (parseError) {
        console.warn(
          '[Migration] Failed to parse diff width, skipping:',
          parseError,
        )
      }
    }
  } catch (error) {
    console.error('[Migration] Failed to migrate drawer widths:', error)
  }

  return results
}

/**
 * MIG5-003: Initialize default icon layout if no config exists
 *
 * Checks if any icon layout config exists in localStorage.
 * If none exists, creates the default layout based on DEFAULT_ICON_LAYOUT.
 *
 * Note: This function checks for the Zustand persist key pattern.
 * The actual key will be like "icon-layout-store::<state>"
 *
 * @returns true if default layout was initialized, false if config already exists
 */
export function initializeDefaultLayout(): boolean {
  try {
    // Check if icon layout config already exists
    // Zustand persist stores with key pattern: "<name>::<state>"
    const existingConfig = localStorage.getItem('icon-layout-store')

    if (existingConfig !== null) {
      console.log('[Migration] Icon layout config already exists, skipping initialization')
      return false
    }

    // No config exists - initialize with defaults
    const defaultLayout = getDefaultIconLayout()
    if (!defaultLayout) {
      console.error('[Migration] Failed to get default layout, cannot initialize')
      return false
    }

    const defaultState = {
      state: { config: defaultLayout },
      version: 1,
    }

    localStorage.setItem('icon-layout-store', JSON.stringify(defaultState))
    console.log('[Migration] Initialized default icon layout configuration')
    return true
  } catch (error) {
    console.error('[Migration] Failed to initialize default layout:', error)
    return false
  }
}

/**
 * MIG5-001: Run complete migration sequence
 *
 * Executes all migration tasks in order:
 * 1. Check if migration already completed
 * 2. Migrate sidebar widths (MIG5-002)
 * 3. Initialize default icon layout (MIG5-003)
 * 4. Set migration flag (MIG5-004)
 *
 * @returns Migration results with success status and details
 */
export function runMigration(): {
  success: boolean
  alreadyMigrated: boolean
  widthsMigrated: { top: number | null; right: number | null }
  layoutInitialized: boolean
  error?: string
} {
  try {
    // Check if migration already completed (MIG5-004 check)
    if (hasMigrationRun()) {
      console.log('[Migration] Migration already completed, skipping')
      return {
        success: true,
        alreadyMigrated: true,
        widthsMigrated: { top: null, right: null },
        layoutInitialized: false,
      }
    }

    console.log('[Migration] Starting icon bar system migration...')

    // MIG5-002: Migrate drawer widths
    const widthsMigrated = migrateDrawerWidths()

    // MIG5-003: Initialize default layout if needed
    const layoutInitialized = initializeDefaultLayout()

    // MIG5-004: Mark migration as complete
    setMigrationComplete()

    const result = {
      success: true,
      alreadyMigrated: false,
      widthsMigrated,
      layoutInitialized,
    }

    console.log('[Migration] Migration completed successfully:', result)

    // Show user notification if any migration occurred
    if (widthsMigrated.top !== null || widthsMigrated.right !== null || layoutInitialized) {
      toast.success('Layout preferences migrated successfully')
    }

    return result
  } catch (error) {
    console.error('[Migration] Migration failed:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Show user-facing error
    toast.error('Failed to migrate layout preferences. Using defaults.')

    return {
      success: false,
      alreadyMigrated: false,
      widthsMigrated: { top: null, right: null },
      layoutInitialized: false,
      error: errorMessage,
    }
  }
}

/**
 * Reset migration flag (for testing purposes)
 * This should NOT be exposed in production code
 */
export function _resetMigrationForTesting(): void {
  try {
    localStorage.removeItem(MIGRATION_FLAG_KEY)
    console.log('[Migration] Migration flag reset (testing only)')
  } catch (error) {
    console.error('[Migration] Failed to reset migration flag:', error)
  }
}
