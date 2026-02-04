/**
 * Zod Validation Schemas: Customizable Dual Drawers
 * Feature: 004-customizable-sidebars
 *
 * Runtime validation schemas for icon configuration data.
 * Used for:
 * - Validating persisted localStorage data
 * - Type inference for TypeScript
 * - Schema migrations
 */

import { z } from 'zod'
import { CURRENT_SCHEMA_VERSION } from '../types/icon-bar.types'

// ============================================================================
// Core Schemas
// ============================================================================

/**
 * Schema for individual icon configuration
 */
export const IconConfigSchema = z.object({
  iconId: z.string().min(1, 'Icon ID cannot be empty'),
  barId: z.string().min(1, 'Bar ID cannot be empty'),
  position: z.number().int().nonnegative('Position must be non-negative integer'),
})

/**
 * Schema for complete icon layout configuration (GENERIC version)
 */
export const IconLayoutConfigSchema = z.object({
  version: z.literal(CURRENT_SCHEMA_VERSION),
  bars: z.record(z.string(), z.array(IconConfigSchema)),
  lastModified: z.string().datetime('Invalid ISO 8601 timestamp'),
})

// ============================================================================
// Type Inference
// ============================================================================

/**
 * Inferred TypeScript types from Zod schemas
 */
export type IconConfig = z.infer<typeof IconConfigSchema>
export type IconLayoutConfig = z.infer<typeof IconLayoutConfigSchema>

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default icon layout for new users
 */
export const DEFAULT_ICON_LAYOUT: IconLayoutConfig = {
  version: CURRENT_SCHEMA_VERSION,
  bars: {
    top: [
      { iconId: 'agents', barId: 'top', position: 0 },
      { iconId: 'terminal', barId: 'top', position: 1 },
      { iconId: 'files', barId: 'top', position: 2 },
    ],
    right: [
      { iconId: 'settings', barId: 'right', position: 0 },
      { iconId: 'help', barId: 'right', position: 1 },
    ],
  },
  lastModified: new Date().toISOString(),
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates and parses icon layout config from unknown source
 * Returns default config if validation fails
 */
export function validateIconLayoutConfig(data: unknown): IconLayoutConfig {
  const result = IconLayoutConfigSchema.safeParse(data)

  if (result.success) {
    return result.data
  }

  console.warn('[IconLayoutConfig] Validation failed:', result.error.errors)
  return DEFAULT_ICON_LAYOUT
}

/**
 * Validates that positions are sequential (0, 1, 2, ..., n-1)
 */
export function validateSequentialPositions(configs: IconConfig[]): boolean {
  return configs.every((config, index) => config.position === index)
}

/**
 * Validates that no duplicate icon IDs exist in array
 */
export function validateNoDuplicateIds(configs: IconConfig[]): boolean {
  const ids = new Set(configs.map(c => c.iconId))
  return ids.size === configs.length
}

/**
 * Comprehensive validation of icon layout config
 * Returns array of validation errors (empty if valid)
 */
export function validateIconLayoutConfigComprehensive(
  config: IconLayoutConfig
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = []

  // Check schema validity
  const schemaResult = IconLayoutConfigSchema.safeParse(config)
  if (!schemaResult.success) {
    errors.push({
      field: 'schema',
      message: 'Configuration does not match expected schema',
    })
    return errors // Don't continue if schema is invalid
  }

  // Check each bar
  for (const [barId, barIcons] of Object.entries(config.bars)) {
    // Check sequential positions
    if (!validateSequentialPositions(barIcons)) {
      errors.push({
        field: barId,
        message: 'Positions are not sequential (must be 0, 1, 2, ...)',
      })
    }

    // Check for duplicate IDs
    if (!validateNoDuplicateIds(barIcons)) {
      errors.push({
        field: barId,
        message: 'Duplicate icon IDs found',
      })
    }
  }

  // Check for icons appearing in multiple bars
  const allIconIds = new Map<string, string[]>()
  for (const [barId, barIcons] of Object.entries(config.bars)) {
    for (const icon of barIcons) {
      if (!allIconIds.has(icon.iconId)) {
        allIconIds.set(icon.iconId, [])
      }
      allIconIds.get(icon.iconId)!.push(barId)
    }
  }

  for (const [iconId, bars] of allIconIds.entries()) {
    if (bars.length > 1) {
      errors.push({
        field: 'multiple',
        message: `Icon "${iconId}" appears in multiple bars: ${bars.join(', ')}`,
      })
    }
  }

  return errors
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalizes icon config array by:
 * - Removing duplicates (keeps first occurrence)
 * - Reindexing positions to be sequential
 */
export function normalizeIconConfigs(configs: IconConfig[]): IconConfig[] {
  // Remove duplicates
  const seen = new Set<string>()
  const unique = configs.filter(config => {
    if (seen.has(config.iconId)) {
      return false
    }
    seen.add(config.iconId)
    return true
  })

  // Reindex positions
  return unique.map((config, index) => ({
    ...config,
    position: index,
  }))
}

/**
 * Normalizes complete icon layout config
 */
export function normalizeIconLayoutConfig(config: IconLayoutConfig): IconLayoutConfig {
  const normalizedBars: Record<string, IconConfig[]> = {}

  for (const [barId, barIcons] of Object.entries(config.bars)) {
    normalizedBars[barId] = normalizeIconConfigs(barIcons)
  }

  return {
    ...config,
    bars: normalizedBars,
    lastModified: new Date().toISOString(),
  }
}

// ============================================================================
// Migration Schemas (Future)
// ============================================================================

/**
 * Schema for version 0 (legacy format, if needed)
 * Example: If migrating from an older system
 */
export const IconLayoutConfigSchemaV0 = z.object({
  // version field didn't exist in v0
  icons: z.array(
    z.object({
      id: z.string(),
      bar: z.enum(['top', 'right']),
      order: z.number(),
    })
  ),
})

/**
 * Migrates v0 config to v1
 */
export function migrateV0toV1(v0Config: unknown): IconLayoutConfig {
  const result = IconLayoutConfigSchemaV0.safeParse(v0Config)

  if (!result.success) {
    console.warn('[Migration] Invalid v0 config, using defaults')
    return DEFAULT_ICON_LAYOUT
  }

  const bars: Record<string, IconConfig[]> = {
    top: [],
    right: [],
  }

  const topIcons = result.data.icons
    .filter(icon => icon.bar === 'top')
    .sort((a, b) => a.order - b.order)
    .map((icon, index) => ({ iconId: icon.id, barId: 'top', position: index }))

  const rightIcons = result.data.icons
    .filter(icon => icon.bar === 'right')
    .sort((a, b) => a.order - b.order)
    .map((icon, index) => ({ iconId: icon.id, barId: 'right', position: index }))

  bars.top = topIcons
  bars.right = rightIcons

  return {
    version: CURRENT_SCHEMA_VERSION,
    bars,
    lastModified: new Date().toISOString(),
  }
}

/**
 * Master migration function
 * Routes to appropriate migration based on version
 */
export function migrateIconLayoutConfig(
  persistedState: unknown,
  version: number
): IconLayoutConfig {
  console.log(`[IconLayoutConfig] Migrating from version ${version}`)

  switch (version) {
    case 0:
      return migrateV0toV1(persistedState)

    case CURRENT_SCHEMA_VERSION:
      // Already current version, just validate
      return validateIconLayoutConfig(persistedState)

    default:
      console.warn(`[IconLayoutConfig] Unknown version ${version}, using defaults`)
      return DEFAULT_ICON_LAYOUT
  }
}

// ============================================================================
// Export All
// ============================================================================

export default {
  IconConfigSchema,
  IconLayoutConfigSchema,
  DEFAULT_ICON_LAYOUT,
  validateIconLayoutConfig,
  validateSequentialPositions,
  validateNoDuplicateIds,
  validateIconLayoutConfigComprehensive,
  normalizeIconConfigs,
  normalizeIconLayoutConfig,
  migrateIconLayoutConfig,
}
