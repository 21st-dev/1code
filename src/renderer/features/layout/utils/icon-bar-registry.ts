/**
 * Icon Bar Registry: Customizable Icon Bar System (GENERIC)
 * Feature: 004-customizable-sidebars
 *
 * Central registry defining ALL icon bars in the application.
 * This registry is GENERIC and supports ANY number of icon bars.
 */

import type { IconBarDefinition } from '../types/icon-bar.types'

/**
 * GENERIC: Icon bar registry defining top and right bars
 * Future: Easy to add more bars (bottom, left) by adding to this array
 */
export const ICON_BAR_REGISTRY: IconBarDefinition[] = [
  {
    id: 'top',
    label: 'Top Action Bar',
    orientation: 'horizontal',
    placement: 'top',
    drawerSide: 'right',
    defaultIcons: ['terminal', 'preview', 'changes'],
  },
  {
    id: 'right',
    label: 'Right Icon Bar',
    orientation: 'vertical',
    placement: 'right',
    drawerSide: 'right',
    defaultIcons: ['settings', 'inbox', 'automations'],
  },
]

/**
 * GENERIC: Lookup helper for fast icon bar access by ID
 * Works for ANY number of bars in the registry
 */
export const ICON_BAR_MAP = new Map(ICON_BAR_REGISTRY.map(bar => [bar.id, bar]))

/**
 * Get icon bar definition by ID
 * @param barId - Bar identifier (e.g., "top", "right", "bottom")
 * @returns Icon bar definition or undefined if not found
 */
export function getIconBar(barId: string): IconBarDefinition | undefined {
  return ICON_BAR_MAP.get(barId)
}

/**
 * Get all bar IDs from registry
 * @returns Array of bar identifiers
 */
export function getAllBarIds(): string[] {
  return ICON_BAR_REGISTRY.map(bar => bar.id)
}

/**
 * Validate that a bar ID exists in the registry
 * @param barId - Bar identifier to validate
 * @returns true if bar exists, false otherwise
 */
export function isValidBarId(barId: string): boolean {
  return ICON_BAR_MAP.has(barId)
}
