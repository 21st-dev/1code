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
import { CURRENT_SCHEMA_VERSION } from './types'

// ============================================================================
// Core Schemas
// ============================================================================

/**
 * Schema for individual icon configuration
 */
export const IconConfigSchema = z.object({
  id: z.string().min(1, 'Icon ID cannot be empty'),
  position: z.number().int().nonnegative('Position must be non-negative integer'),
})

/**
 * Schema for complete icon layout configuration
 */
export const IconLayoutConfigSchema = z.object({
  version: z.literal(CURRENT_SCHEMA_VERSION),
  topBar: z.array(IconConfigSchema),
  rightBar: z.array(IconConfigSchema),
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
  topBar: [
    { id: 'agents', position: 0 },
    { id: 'terminal', position: 1 },
    { id: 'files', position: 2 },
  ],
  rightBar: [
    { id: 'settings', position: 0 },
    { id: 'help', position: 1 },
  ],
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
  const ids = new Set(configs.map(c => c.id))
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

  // Check sequential positions in topBar
  if (!validateSequentialPositions(config.topBar)) {
    errors.push({
      field: 'topBar',
      message: 'Positions are not sequential (must be 0, 1, 2, ...)',
    })
  }

  // Check sequential positions in rightBar
  if (!validateSequentialPositions(config.rightBar)) {
    errors.push({
      field: 'rightBar',
      message: 'Positions are not sequential (must be 0, 1, 2, ...)',
    })
  }

  // Check for duplicate IDs in topBar
  if (!validateNoDuplicateIds(config.topBar)) {
    errors.push({
      field: 'topBar',
      message: 'Duplicate icon IDs found',
    })
  }

  // Check for duplicate IDs in rightBar
  if (!validateNoDuplicateIds(config.rightBar)) {
    errors.push({
      field: 'rightBar',
      message: 'Duplicate icon IDs found',
    })
  }

  // Check for icons appearing in both bars
  const topBarIds = new Set(config.topBar.map(c => c.id))
  const rightBarIds = new Set(config.rightBar.map(c => c.id))
  const intersection = [...topBarIds].filter(id => rightBarIds.has(id))

  if (intersection.length > 0) {
    errors.push({
      field: 'both',
      message: `Icons appear in both bars: ${intersection.join(', ')}`,
    })
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
    if (seen.has(config.id)) {
      return false
    }
    seen.add(config.id)
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
  return {
    ...config,
    topBar: normalizeIconConfigs(config.topBar),
    rightBar: normalizeIconConfigs(config.rightBar),
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

  const topBar = result.data.icons
    .filter(icon => icon.bar === 'top')
    .sort((a, b) => a.order - b.order)
    .map((icon, index) => ({ id: icon.id, position: index }))

  const rightBar = result.data.icons
    .filter(icon => icon.bar === 'right')
    .sort((a, b) => a.order - b.order)
    .map((icon, index) => ({ id: icon.id, position: index }))

  return {
    version: CURRENT_SCHEMA_VERSION,
    topBar,
    rightBar,
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
