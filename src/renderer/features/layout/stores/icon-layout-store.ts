/**
 * Zustand Store: Icon Layout Configuration (GENERIC)
 * Feature: 004-customizable-sidebars
 *
 * GENERIC Store that works with ANY number of icon bars.
 * Persists user's icon layout configuration to localStorage.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getWindowId } from '../../../contexts/WindowContext'
import type { IconLayoutConfig, IconBarDefinition, Icon, IconConfig } from '../types/icon-bar.types'
import { ICON_BAR_REGISTRY } from '../utils/icon-bar-registry'
import { ICON_REGISTRY } from '../constants/icon-registry'
import {
  IconLayoutConfigSchema,
  validateIconLayoutConfig,
  normalizeIconLayoutConfig,
  migrateIconLayoutConfig,
} from '../utils/icon-validation'

/**
 * Default icon layout configuration
 * Built dynamically from ICON_BAR_REGISTRY
 *
 * Exported for use in migration scripts and tests
 */
export function getDefaultIconLayout(): IconLayoutConfig {
  const bars: Record<string, IconConfig[]> = {}

  ICON_BAR_REGISTRY.forEach(bar => {
    bars[bar.id] = bar.defaultIcons.map((iconId, position) => ({
      iconId,
      barId: bar.id,
      position,
    }))
  })

  return {
    version: 1,
    bars,
    lastModified: new Date().toISOString(),
  }
}

export const DEFAULT_ICON_LAYOUT = getDefaultIconLayout()

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

/**
 * Get storage key for current window
 */
function getStorageKey(): string {
  return `${getWindowId()}:icon-layout-config`
}

/**
 * GENERIC Zustand Store for Icon Layout Configuration
 * Works with ANY number of icon bars through configuration
 */
export const useIconLayoutStore = create<IconLayoutStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_ICON_LAYOUT,

      /**
       * GENERIC: Move icon to ANY bar
       * @param iconId - Icon identifier to move
       * @param toBarId - Target bar identifier
       * @param newPosition - Position in target bar (0-indexed)
       */
      moveIcon: (iconId: string, toBarId: string, newPosition: number) => {
        const { config } = get()

        // Find which bar currently contains the icon
        let sourceBarId: string | null = null
        for (const [barId, icons] of Object.entries(config.bars)) {
          if (icons.some(ic => ic.iconId === iconId)) {
            sourceBarId = barId
            break
          }
        }

        if (!sourceBarId) {
          console.warn(`[IconLayoutStore] Icon ${iconId} not found in any bar`)
          return
        }

        // Can't move to the same bar (use reorderIcon instead)
        if (sourceBarId === toBarId) {
          console.warn(
            `[IconLayoutStore] Use reorderIcon for same-bar moves. iconId=${iconId}, barId=${toBarId}`
          )
          return
        }

        // Create new bars object with icon moved
        const newBars = { ...config.bars }

        // Remove icon from source bar
        newBars[sourceBarId] = newBars[sourceBarId].filter(ic => ic.iconId !== iconId)

        // Add icon to target bar at specified position
        if (!newBars[toBarId]) {
          newBars[toBarId] = []
        }

        const targetBar = [...newBars[toBarId]]
        targetBar.splice(newPosition, 0, {
          iconId,
          barId: toBarId,
          position: newPosition,
        })
        newBars[toBarId] = targetBar

        // Reindex positions for both affected bars
        newBars[sourceBarId] = newBars[sourceBarId].map((ic, idx) => ({
          ...ic,
          barId: sourceBarId,
          position: idx,
        }))

        newBars[toBarId] = newBars[toBarId].map((ic, idx) => ({
          ...ic,
          barId: toBarId,
          position: idx,
        }))

        set({
          config: {
            ...config,
            bars: newBars,
            lastModified: new Date().toISOString(),
          },
        })
      },

      /**
       * GENERIC: Reorder icon within ANY bar
       * @param iconId - Icon identifier to reorder
       * @param barId - Bar identifier containing the icon
       * @param newPosition - New position in the bar (0-indexed)
       */
      reorderIcon: (iconId: string, barId: string, newPosition: number) => {
        const { config } = get()

        // Get current bar icons
        const barIcons = config.bars[barId]
        if (!barIcons) {
          console.warn(`[IconLayoutStore] Bar ${barId} not found`)
          return
        }

        // Find current index
        const currentIndex = barIcons.findIndex(ic => ic.iconId === iconId)
        if (currentIndex === -1) {
          console.warn(`[IconLayoutStore] Icon ${iconId} not found in bar ${barId}`)
          return
        }

        // No change if position is the same
        if (currentIndex === newPosition) {
          return
        }

        // Clone array and perform reorder
        const reordered = [...barIcons]
        const [removed] = reordered.splice(currentIndex, 1)
        reordered.splice(newPosition, 0, removed)

        // Reindex positions
        const reindexed = reordered.map((ic, idx) => ({
          ...ic,
          position: idx,
        }))

        set({
          config: {
            ...config,
            bars: {
              ...config.bars,
              [barId]: reindexed,
            },
            lastModified: new Date().toISOString(),
          },
        })
      },

      /**
       * GENERIC: Get all icons for ANY bar
       * @param barId - Bar identifier
       * @returns Array of icon configurations (ordered by position)
       */
      getBarIcons: (barId: string): IconConfig[] => {
        const { config } = get()
        return config.bars[barId] || []
      },

      /**
       * GENERIC: Get current location of an icon (works for any bar)
       * @param iconId - Icon identifier
       * @returns Location info or null if not found
       */
      getIconLocation: (iconId: string): { barId: string; position: number } | null => {
        const { config } = get()

        for (const [barId, icons] of Object.entries(config.bars)) {
          const iconConfig = icons.find(ic => ic.iconId === iconId)
          if (iconConfig) {
            return { barId, position: iconConfig.position }
          }
        }

        return null
      },

      /**
       * Reset to default configuration
       */
      resetToDefaults: () => {
        set({
          config: {
            ...getDefaultIconLayout(),
            lastModified: new Date().toISOString(),
          },
        })
      },

      /**
       * GENERIC: Reconcile config with bar and icon registries
       * Handles added/removed bars and icons across app updates
       *
       * @param barRegistry - Current bar definitions
       * @param iconRegistry - Current icon definitions
       */
      reconcileWithRegistry: (
        barRegistry: IconBarDefinition[],
        iconRegistry: Icon[]
      ): void => {
        const { config } = get()

        const validBarIds = new Set(barRegistry.map(b => b.id))
        const validIconIds = new Set(iconRegistry.map(i => i.id))

        // Step 1: Remove invalid bars and filter out invalid icons
        const validBars: Record<string, IconConfig[]> = {}

        Object.entries(config.bars).forEach(([barId, icons]) => {
          if (validBarIds.has(barId)) {
            // Keep only valid icons in this bar
            validBars[barId] = icons.filter(ic => validIconIds.has(ic.iconId))
          }
        })

        // Step 2: Add new bars with their default icons
        barRegistry.forEach(bar => {
          if (!validBars[bar.id]) {
            validBars[bar.id] = bar.defaultIcons
              .filter(iconId => validIconIds.has(iconId))
              .map((iconId, idx) => ({
                iconId,
                barId: bar.id,
                position: idx,
              }))
          }
        })

        // Step 3: Add new icons to their default bars (if not already placed)
        const configuredIconIds = new Set(
          Object.values(validBars).flatMap(icons => icons.map(ic => ic.iconId))
        )

        iconRegistry.forEach(icon => {
          if (!configuredIconIds.has(icon.id)) {
            // Find default bar for this icon
            const defaultBar = barRegistry.find(b => b.defaultIcons.includes(icon.id))

            if (defaultBar && validBars[defaultBar.id]) {
              // Check if icon is allowed in this bar
              if (!icon.allowedBars || icon.allowedBars.includes(defaultBar.id)) {
                validBars[defaultBar.id].push({
                  iconId: icon.id,
                  barId: defaultBar.id,
                  position: validBars[defaultBar.id].length,
                })
              }
            } else {
              // No default bar found, try to place in first allowed bar
              const allowedBar = barRegistry.find(
                b => !icon.allowedBars || icon.allowedBars.includes(b.id)
              )

              if (allowedBar && validBars[allowedBar.id]) {
                validBars[allowedBar.id].push({
                  iconId: icon.id,
                  barId: allowedBar.id,
                  position: validBars[allowedBar.id].length,
                })
              }
            }
          }
        })

        // Step 4: Reindex all positions to ensure they're sequential
        Object.keys(validBars).forEach(barId => {
          validBars[barId] = validBars[barId].map((ic, idx) => ({
            ...ic,
            position: idx,
          }))
        })

        set({
          config: {
            ...config,
            bars: validBars,
            lastModified: new Date().toISOString(),
          },
        })
      },
    }),
    {
      name: getStorageKey(),
      version: 1,
      // US2-013: Zustand persist middleware automatically batches writes to localStorage.
      // Since drag operations only trigger on dragEnd (not during drag), no additional
      // debouncing is needed. Each drag-drop operation = 1 localStorage write.
      migrate: (persistedState, version) => {
        console.log(`[IconLayoutStore] Migrating from version ${version}`)
        return migrateIconLayoutConfig(persistedState, version)
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[IconLayoutStore] Rehydration error:', error)
            // State will be set to initial state (DEFAULT_ICON_LAYOUT)
            return
          }

          if (!state) {
            console.warn('[IconLayoutStore] No state to rehydrate')
            return
          }

          // Validate rehydrated state with Zod
          const validationResult = IconLayoutConfigSchema.safeParse(state.config)

          if (!validationResult.success) {
            console.error(
              '[IconLayoutStore] Invalid config after rehydration:',
              validationResult.error.errors
            )

            // Normalize the config to fix any issues
            const normalized = normalizeIconLayoutConfig(state.config)

            // Try validating the normalized config
            const normalizedValidation = IconLayoutConfigSchema.safeParse(normalized)

            if (normalizedValidation.success) {
              console.log('[IconLayoutStore] Config normalized successfully')
              state.config = normalized
            } else {
              console.error('[IconLayoutStore] Config still invalid after normalization, using defaults')
              state.config = DEFAULT_ICON_LAYOUT

              // Optionally notify user
              if (typeof window !== 'undefined' && window.desktopApi?.showNotification) {
                window.desktopApi.showNotification({
                  title: 'Icon Layout Reset',
                  body: 'Your icon layout was reset to defaults due to corrupted data.',
                })
              }
            }
          }

          // Always reconcile with current registries on rehydration
          // This handles app updates that add/remove icons or bars
          state.reconcileWithRegistry(ICON_BAR_REGISTRY, ICON_REGISTRY)

          console.log('[IconLayoutStore] State rehydrated successfully')
        }
      },
    }
  )
)
