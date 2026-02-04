/**
 * Icon Registry: Customizable Icon Bar System (GENERIC)
 * Feature: 004-customizable-sidebars
 *
 * Central registry of all available icons in the application.
 * Maps icons to existing pages (Settings, Automations, Inbox, Terminal, Changes, Preview).
 */

import { Settings, Zap, Inbox as InboxIcon, Terminal as TerminalIcon, GitBranch, Eye } from 'lucide-react'
import { lazy } from 'react'
import type { Icon } from '../types/icon-bar.types'

/**
 * GENERIC: Icon registry mapping to existing pages
 * Each icon can be placed in ANY bar (unless restricted by allowedBars)
 */
export const ICON_REGISTRY: Icon[] = [
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    page: lazy(() => import('../../settings/settings-content')),
  },
  {
    id: 'automations',
    label: 'Automations',
    icon: Zap,
    page: lazy(() => import('../../automations/automations-view')),
  },
  {
    id: 'inbox',
    label: 'Inbox',
    icon: InboxIcon,
    page: lazy(() => import('../../automations/inbox-view')),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: TerminalIcon,
    page: lazy(() => import('../../terminal/terminal-sidebar')),
  },
  {
    id: 'changes',
    label: 'Changes',
    icon: GitBranch,
    page: lazy(() => import('../../agents/ui/agent-diff-view')),
  },
  {
    id: 'preview',
    label: 'Preview',
    icon: Eye,
    page: lazy(() => import('../../agents/ui/agent-preview')),
  },
]

/**
 * GENERIC: Lookup helper for fast icon access by ID
 * Works for ANY number of icons in the registry
 */
export const ICON_MAP = new Map(ICON_REGISTRY.map(icon => [icon.id, icon]))

/**
 * Set of all valid icon IDs (for validation)
 */
export const ICON_IDS = new Set(ICON_REGISTRY.map(icon => icon.id))

/**
 * Get icon definition by ID
 * @param iconId - Icon identifier (e.g., "settings", "terminal")
 * @returns Icon definition or undefined if not found
 */
export function getIcon(iconId: string): Icon | undefined {
  return ICON_MAP.get(iconId)
}

/**
 * Check if an icon can be placed in a specific bar
 * @param iconId - Icon identifier
 * @param barId - Bar identifier
 * @returns true if icon is allowed in the bar, false otherwise
 */
export function canIconBeInBar(iconId: string, barId: string): boolean {
  const icon = getIcon(iconId)
  if (!icon) return false
  if (!icon.allowedBars) return true // No restrictions, can go in any bar
  return icon.allowedBars.includes(barId)
}

/**
 * Validate that an icon ID exists in the registry
 * @param iconId - Icon identifier to validate
 * @returns true if icon exists, false otherwise
 */
export function isValidIconId(iconId: string): boolean {
  return ICON_IDS.has(iconId)
}

/**
 * Get all icon IDs from registry
 * @returns Array of icon identifiers
 */
export function getAllIconIds(): string[] {
  return ICON_REGISTRY.map(icon => icon.id)
}
