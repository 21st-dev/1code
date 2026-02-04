/**
 * Unit Tests: Zod Schema Validation
 * Feature: 004-customizable-sidebars
 * Task: TEST-002
 *
 * Tests for Zod schema validation:
 * - IconConfigSchema validation (valid and invalid)
 * - IconLayoutConfigSchema validation (valid and invalid)
 * - Validation helper functions
 * - Normalization functions
 * - Migration functions
 */

import { describe, it, expect } from 'vitest'
import {
  IconConfigSchema,
  IconLayoutConfigSchema,
  validateIconLayoutConfig,
  validateSequentialPositions,
  validateNoDuplicateIds,
  validateIconLayoutConfigComprehensive,
  normalizeIconConfigs,
  normalizeIconLayoutConfig,
  migrateV0toV1,
  migrateIconLayoutConfig,
  DEFAULT_ICON_LAYOUT,
} from './icon-validation'
import { CURRENT_SCHEMA_VERSION } from '../types/icon-bar.types'
import type { IconConfig, IconLayoutConfig } from './icon-validation'

describe('Icon Validation - IconConfigSchema (TEST-002)', () => {
  describe('Valid Icon Configs', () => {
    it('should accept valid icon config', () => {
      const validConfig = {
        iconId: 'settings',
        barId: 'right',
        position: 0,
      }

      const result = IconConfigSchema.safeParse(validConfig)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validConfig)
      }
    })

    it('should accept icon with position 0', () => {
      const config = {
        iconId: 'terminal',
        barId: 'top',
        position: 0,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(true)
    })

    it('should accept icon with large position number', () => {
      const config = {
        iconId: 'preview',
        barId: 'top',
        position: 99,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(true)
    })
  })

  describe('Invalid Icon Configs', () => {
    it('should reject empty iconId', () => {
      const config = {
        iconId: '',
        barId: 'top',
        position: 0,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Icon ID cannot be empty')
      }
    })

    it('should reject empty barId', () => {
      const config = {
        iconId: 'settings',
        barId: '',
        position: 0,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Bar ID cannot be empty')
      }
    })

    it('should reject negative position', () => {
      const config = {
        iconId: 'settings',
        barId: 'right',
        position: -1,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Position must be non-negative integer')
      }
    })

    it('should reject decimal position', () => {
      const config = {
        iconId: 'settings',
        barId: 'right',
        position: 1.5,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })

    it('should reject missing iconId field', () => {
      const config = {
        barId: 'top',
        position: 0,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })

    it('should reject missing barId field', () => {
      const config = {
        iconId: 'settings',
        position: 0,
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })

    it('should reject missing position field', () => {
      const config = {
        iconId: 'settings',
        barId: 'right',
      }

      const result = IconConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })
  })
})

describe('Icon Validation - IconLayoutConfigSchema (TEST-002)', () => {
  describe('Valid Layout Configs', () => {
    it('should accept valid layout config', () => {
      const validConfig: IconLayoutConfig = {
        version: CURRENT_SCHEMA_VERSION,
        bars: {
          top: [
            { iconId: 'terminal', barId: 'top', position: 0 },
            { iconId: 'preview', barId: 'top', position: 1 },
          ],
          right: [
            { iconId: 'settings', barId: 'right', position: 0 },
          ],
        },
        lastModified: new Date().toISOString(),
      }

      const result = IconLayoutConfigSchema.safeParse(validConfig)

      expect(result.success).toBe(true)
    })

    it('should accept config with empty bars object', () => {
      const config = {
        version: CURRENT_SCHEMA_VERSION,
        bars: {},
        lastModified: new Date().toISOString(),
      }

      const result = IconLayoutConfigSchema.safeParse(config)

      expect(result.success).toBe(true)
    })

    it('should accept config with empty bar array', () => {
      const config = {
        version: CURRENT_SCHEMA_VERSION,
        bars: {
          top: [],
        },
        lastModified: new Date().toISOString(),
      }

      const result = IconLayoutConfigSchema.safeParse(config)

      expect(result.success).toBe(true)
    })

    it('should accept DEFAULT_ICON_LAYOUT', () => {
      const result = IconLayoutConfigSchema.safeParse(DEFAULT_ICON_LAYOUT)

      expect(result.success).toBe(true)
    })
  })

  describe('Invalid Layout Configs', () => {
    it('should reject wrong version number', () => {
      const config = {
        version: 999,
        bars: {},
        lastModified: new Date().toISOString(),
      }

      const result = IconLayoutConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })

    it('should reject missing version field', () => {
      const config = {
        bars: {},
        lastModified: new Date().toISOString(),
      }

      const result = IconLayoutConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })

    it('should reject missing bars field', () => {
      const config = {
        version: CURRENT_SCHEMA_VERSION,
        lastModified: new Date().toISOString(),
      }

      const result = IconLayoutConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })

    it('should reject invalid lastModified timestamp', () => {
      const config = {
        version: CURRENT_SCHEMA_VERSION,
        bars: {},
        lastModified: 'not-a-valid-timestamp',
      }

      const result = IconLayoutConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Invalid ISO 8601 timestamp')
      }
    })

    it('should reject bars with invalid icon configs', () => {
      const config = {
        version: CURRENT_SCHEMA_VERSION,
        bars: {
          top: [
            { iconId: '', barId: 'top', position: 0 }, // Empty iconId
          ],
        },
        lastModified: new Date().toISOString(),
      }

      const result = IconLayoutConfigSchema.safeParse(config)

      expect(result.success).toBe(false)
    })
  })
})

describe('Icon Validation - validateIconLayoutConfig Function (TEST-002)', () => {
  it('should return valid config unchanged', () => {
    const validConfig: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [{ iconId: 'terminal', barId: 'top', position: 0 }],
      },
      lastModified: new Date().toISOString(),
    }

    const result = validateIconLayoutConfig(validConfig)

    expect(result).toEqual(validConfig)
  })

  it('should return DEFAULT_ICON_LAYOUT for invalid config', () => {
    const invalidConfig = {
      version: 999,
      bars: 'not-an-object',
    }

    const result = validateIconLayoutConfig(invalidConfig)

    expect(result).toEqual(DEFAULT_ICON_LAYOUT)
  })

  it('should return DEFAULT_ICON_LAYOUT for null input', () => {
    const result = validateIconLayoutConfig(null)

    expect(result).toEqual(DEFAULT_ICON_LAYOUT)
  })

  it('should return DEFAULT_ICON_LAYOUT for undefined input', () => {
    const result = validateIconLayoutConfig(undefined)

    expect(result).toEqual(DEFAULT_ICON_LAYOUT)
  })
})

describe('Icon Validation - validateSequentialPositions Function (TEST-002)', () => {
  it('should return true for sequential positions starting at 0', () => {
    const configs: IconConfig[] = [
      { iconId: 'a', barId: 'top', position: 0 },
      { iconId: 'b', barId: 'top', position: 1 },
      { iconId: 'c', barId: 'top', position: 2 },
    ]

    const result = validateSequentialPositions(configs)

    expect(result).toBe(true)
  })

  it('should return true for single icon at position 0', () => {
    const configs: IconConfig[] = [{ iconId: 'a', barId: 'top', position: 0 }]

    const result = validateSequentialPositions(configs)

    expect(result).toBe(true)
  })

  it('should return true for empty array', () => {
    const result = validateSequentialPositions([])

    expect(result).toBe(true)
  })

  it('should return false for non-sequential positions', () => {
    const configs: IconConfig[] = [
      { iconId: 'a', barId: 'top', position: 0 },
      { iconId: 'b', barId: 'top', position: 2 }, // Gap: missing position 1
      { iconId: 'c', barId: 'top', position: 3 },
    ]

    const result = validateSequentialPositions(configs)

    expect(result).toBe(false)
  })

  it('should return false for positions not starting at 0', () => {
    const configs: IconConfig[] = [
      { iconId: 'a', barId: 'top', position: 1 }, // Should start at 0
      { iconId: 'b', barId: 'top', position: 2 },
    ]

    const result = validateSequentialPositions(configs)

    expect(result).toBe(false)
  })
})

describe('Icon Validation - validateNoDuplicateIds Function (TEST-002)', () => {
  it('should return true for unique icon IDs', () => {
    const configs: IconConfig[] = [
      { iconId: 'terminal', barId: 'top', position: 0 },
      { iconId: 'preview', barId: 'top', position: 1 },
      { iconId: 'changes', barId: 'top', position: 2 },
    ]

    const result = validateNoDuplicateIds(configs)

    expect(result).toBe(true)
  })

  it('should return true for empty array', () => {
    const result = validateNoDuplicateIds([])

    expect(result).toBe(true)
  })

  it('should return true for single icon', () => {
    const configs: IconConfig[] = [{ iconId: 'settings', barId: 'right', position: 0 }]

    const result = validateNoDuplicateIds(configs)

    expect(result).toBe(true)
  })

  it('should return false for duplicate icon IDs', () => {
    const configs: IconConfig[] = [
      { iconId: 'terminal', barId: 'top', position: 0 },
      { iconId: 'preview', barId: 'top', position: 1 },
      { iconId: 'terminal', barId: 'top', position: 2 }, // Duplicate
    ]

    const result = validateNoDuplicateIds(configs)

    expect(result).toBe(false)
  })
})

describe('Icon Validation - validateIconLayoutConfigComprehensive Function (TEST-002)', () => {
  it('should return empty array for valid config', () => {
    const validConfig: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [
          { iconId: 'terminal', barId: 'top', position: 0 },
          { iconId: 'preview', barId: 'top', position: 1 },
        ],
        right: [
          { iconId: 'settings', barId: 'right', position: 0 },
        ],
      },
      lastModified: new Date().toISOString(),
    }

    const errors = validateIconLayoutConfigComprehensive(validConfig)

    expect(errors).toHaveLength(0)
  })

  it('should detect invalid schema', () => {
    const invalidConfig = {
      version: 999, // Wrong version
      bars: {},
      lastModified: new Date().toISOString(),
    } as unknown as IconLayoutConfig

    const errors = validateIconLayoutConfigComprehensive(invalidConfig)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].field).toBe('schema')
  })

  it('should detect non-sequential positions', () => {
    const config: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [
          { iconId: 'a', barId: 'top', position: 0 },
          { iconId: 'b', barId: 'top', position: 2 }, // Gap
        ],
      },
      lastModified: new Date().toISOString(),
    }

    const errors = validateIconLayoutConfigComprehensive(config)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.message.includes('sequential'))).toBe(true)
  })

  it('should detect duplicate icon IDs in same bar', () => {
    const config: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [
          { iconId: 'terminal', barId: 'top', position: 0 },
          { iconId: 'terminal', barId: 'top', position: 1 }, // Duplicate
        ],
      },
      lastModified: new Date().toISOString(),
    }

    const errors = validateIconLayoutConfigComprehensive(config)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.message.includes('Duplicate'))).toBe(true)
  })

  it('should detect icon appearing in multiple bars', () => {
    const config: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [{ iconId: 'terminal', barId: 'top', position: 0 }],
        right: [{ iconId: 'terminal', barId: 'right', position: 0 }], // Same icon
      },
      lastModified: new Date().toISOString(),
    }

    const errors = validateIconLayoutConfigComprehensive(config)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.message.includes('multiple bars'))).toBe(true)
  })
})

describe('Icon Validation - normalizeIconConfigs Function (TEST-002)', () => {
  it('should remove duplicate icon IDs (keep first)', () => {
    const configs: IconConfig[] = [
      { iconId: 'terminal', barId: 'top', position: 0 },
      { iconId: 'preview', barId: 'top', position: 1 },
      { iconId: 'terminal', barId: 'top', position: 2 }, // Duplicate
    ]

    const normalized = normalizeIconConfigs(configs)

    expect(normalized).toHaveLength(2)
    expect(normalized.map(c => c.iconId)).toEqual(['terminal', 'preview'])
  })

  it('should reindex positions to be sequential', () => {
    const configs: IconConfig[] = [
      { iconId: 'a', barId: 'top', position: 5 },
      { iconId: 'b', barId: 'top', position: 10 },
      { iconId: 'c', barId: 'top', position: 15 },
    ]

    const normalized = normalizeIconConfigs(configs)

    expect(normalized[0].position).toBe(0)
    expect(normalized[1].position).toBe(1)
    expect(normalized[2].position).toBe(2)
  })

  it('should handle empty array', () => {
    const normalized = normalizeIconConfigs([])

    expect(normalized).toEqual([])
  })

  it('should not modify already-valid config', () => {
    const configs: IconConfig[] = [
      { iconId: 'terminal', barId: 'top', position: 0 },
      { iconId: 'preview', barId: 'top', position: 1 },
    ]

    const normalized = normalizeIconConfigs(configs)

    expect(normalized).toEqual(configs)
  })
})

describe('Icon Validation - normalizeIconLayoutConfig Function (TEST-002)', () => {
  it('should normalize all bars', () => {
    const config: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [
          { iconId: 'a', barId: 'top', position: 5 },
          { iconId: 'b', barId: 'top', position: 10 },
        ],
        right: [
          { iconId: 'c', barId: 'right', position: 100 },
        ],
      },
      lastModified: '2025-01-01T00:00:00.000Z',
    }

    const normalized = normalizeIconLayoutConfig(config)

    expect(normalized.bars.top[0].position).toBe(0)
    expect(normalized.bars.top[1].position).toBe(1)
    expect(normalized.bars.right[0].position).toBe(0)
  })

  it('should update lastModified timestamp', () => {
    const config: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [{ iconId: 'terminal', barId: 'top', position: 0 }],
      },
      lastModified: '2020-01-01T00:00:00.000Z', // Old timestamp
    }

    const normalized = normalizeIconLayoutConfig(config)

    expect(new Date(normalized.lastModified).getTime()).toBeGreaterThan(
      new Date('2020-01-01').getTime()
    )
  })

  it('should remove duplicate icons across normalization', () => {
    const config: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [
          { iconId: 'terminal', barId: 'top', position: 0 },
          { iconId: 'terminal', barId: 'top', position: 1 }, // Duplicate
        ],
      },
      lastModified: new Date().toISOString(),
    }

    const normalized = normalizeIconLayoutConfig(config)

    expect(normalized.bars.top).toHaveLength(1)
    expect(normalized.bars.top[0].iconId).toBe('terminal')
  })
})

describe('Icon Validation - migrateV0toV1 Function (TEST-002)', () => {
  it('should migrate valid v0 config to v1', () => {
    const v0Config = {
      icons: [
        { id: 'terminal', bar: 'top', order: 0 },
        { id: 'preview', bar: 'top', order: 1 },
        { id: 'settings', bar: 'right', order: 0 },
      ],
    }

    const v1Config = migrateV0toV1(v0Config)

    expect(v1Config.version).toBe(CURRENT_SCHEMA_VERSION)
    expect(v1Config.bars.top).toHaveLength(2)
    expect(v1Config.bars.right).toHaveLength(1)
    expect(v1Config.bars.top[0].iconId).toBe('terminal')
    expect(v1Config.bars.right[0].iconId).toBe('settings')
  })

  it('should sort icons by order field during migration', () => {
    const v0Config = {
      icons: [
        { id: 'c', bar: 'top', order: 2 },
        { id: 'a', bar: 'top', order: 0 },
        { id: 'b', bar: 'top', order: 1 },
      ],
    }

    const v1Config = migrateV0toV1(v0Config)

    expect(v1Config.bars.top[0].iconId).toBe('a')
    expect(v1Config.bars.top[1].iconId).toBe('b')
    expect(v1Config.bars.top[2].iconId).toBe('c')
  })

  it('should use DEFAULT_ICON_LAYOUT for invalid v0 config', () => {
    const invalidConfig = { invalid: 'data' }

    const result = migrateV0toV1(invalidConfig)

    expect(result).toEqual(DEFAULT_ICON_LAYOUT)
  })

  it('should set correct positions in migrated config', () => {
    const v0Config = {
      icons: [
        { id: 'terminal', bar: 'top', order: 5 },
        { id: 'preview', bar: 'top', order: 10 },
      ],
    }

    const v1Config = migrateV0toV1(v0Config)

    expect(v1Config.bars.top[0].position).toBe(0)
    expect(v1Config.bars.top[1].position).toBe(1)
  })
})

describe('Icon Validation - migrateIconLayoutConfig Function (TEST-002)', () => {
  it('should route v0 config to migrateV0toV1', () => {
    const v0Config = {
      icons: [{ id: 'terminal', bar: 'top', order: 0 }],
    }

    const result = migrateIconLayoutConfig(v0Config, 0)

    expect(result.version).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('should validate current version config', () => {
    const currentConfig: IconLayoutConfig = {
      version: CURRENT_SCHEMA_VERSION,
      bars: {
        top: [{ iconId: 'terminal', barId: 'top', position: 0 }],
      },
      lastModified: new Date().toISOString(),
    }

    const result = migrateIconLayoutConfig(currentConfig, CURRENT_SCHEMA_VERSION)

    expect(result).toEqual(currentConfig)
  })

  it('should return DEFAULT_ICON_LAYOUT for unknown version', () => {
    const unknownConfig = { unknown: 'format' }

    const result = migrateIconLayoutConfig(unknownConfig, 999)

    expect(result).toEqual(DEFAULT_ICON_LAYOUT)
  })

  it('should handle null config', () => {
    const result = migrateIconLayoutConfig(null, 0)

    expect(result).toEqual(DEFAULT_ICON_LAYOUT)
  })
})
