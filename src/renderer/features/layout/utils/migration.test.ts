/**
 * Migration Tests: Icon Bar System
 * Feature: 004-customizable-sidebars
 * Phase: MIG5 (User Data Migration)
 *
 * Tests for user preference migration from old system to new icon bar system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Setup minimal window mock BEFORE any imports that might use it
if (typeof window === 'undefined') {
  ;(global as any).window = {
    location: { search: '' },
  }
}

if (typeof URLSearchParams === 'undefined') {
  ;(global as any).URLSearchParams = class MockURLSearchParams {
    constructor(search: string) {}
    get(key: string) {
      return null
    }
  }
}

// Now import migration functions
import {
  runMigration,
  migrateDrawerWidths,
  initializeDefaultLayout,
  hasMigrationRun,
  setMigrationComplete,
  _resetMigrationForTesting,
} from './migration'

// Mock localStorage for tests
let mockStorage: Map<string, string>

beforeEach(() => {
  // Reset localStorage mock before each test
  mockStorage = new Map<string, string>()

  global.localStorage = {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    removeItem: (key: string) => {
      mockStorage.delete(key)
    },
    clear: () => {
      mockStorage.clear()
    },
    get length() {
      return mockStorage.size
    },
    key: (index: number) => {
      return Array.from(mockStorage.keys())[index] ?? null
    },
  } as Storage
})

afterEach(() => {
  // Clean up after each test
  mockStorage.clear()
})

describe('Migration Flag Management', () => {
  it('should return false when migration has not run', () => {
    expect(hasMigrationRun()).toBe(false)
  })

  it('should return true after migration is marked complete', () => {
    setMigrationComplete()
    expect(hasMigrationRun()).toBe(true)
  })

  it('should allow resetting migration flag for testing', () => {
    setMigrationComplete()
    expect(hasMigrationRun()).toBe(true)

    _resetMigrationForTesting()
    expect(hasMigrationRun()).toBe(false)
  })
})

describe('MIG5-002: Migrate Drawer Widths', () => {
  it('should migrate preview sidebar width to top drawer width', () => {
    // Setup: old preview sidebar width exists
    mockStorage.set('agentsPreviewSidebarWidth', JSON.stringify(450))

    const results = migrateDrawerWidths()

    expect(results.top).toBe(450)
    expect(mockStorage.get('layout:drawer-width:top')).toBe(JSON.stringify(450))
  })

  it('should migrate diff sidebar width to right drawer width', () => {
    // Setup: old diff sidebar width exists
    mockStorage.set('agentsDiffSidebarWidth', JSON.stringify(500))

    const results = migrateDrawerWidths()

    expect(results.right).toBe(500)
    expect(mockStorage.get('layout:drawer-width:right')).toBe(JSON.stringify(500))
  })

  it('should migrate both widths when both exist', () => {
    // Setup: both old widths exist
    mockStorage.set('agentsPreviewSidebarWidth', JSON.stringify(450))
    mockStorage.set('agentsDiffSidebarWidth', JSON.stringify(500))

    const results = migrateDrawerWidths()

    expect(results.top).toBe(450)
    expect(results.right).toBe(500)
    expect(mockStorage.get('layout:drawer-width:top')).toBe(JSON.stringify(450))
    expect(mockStorage.get('layout:drawer-width:right')).toBe(JSON.stringify(500))
  })

  it('should return null for widths that do not exist', () => {
    // Setup: no old widths exist
    const results = migrateDrawerWidths()

    expect(results.top).toBeNull()
    expect(results.right).toBeNull()
  })

  it('should skip invalid width values', () => {
    // Setup: invalid width values
    mockStorage.set('agentsPreviewSidebarWidth', JSON.stringify(-100))
    mockStorage.set('agentsDiffSidebarWidth', JSON.stringify(0))

    const results = migrateDrawerWidths()

    expect(results.top).toBeNull()
    expect(results.right).toBeNull()
    expect(mockStorage.has('layout:drawer-width:top')).toBe(false)
    expect(mockStorage.has('layout:drawer-width:right')).toBe(false)
  })

  it('should handle corrupted width data gracefully', () => {
    // Setup: corrupted JSON data
    mockStorage.set('agentsPreviewSidebarWidth', 'not-json')
    mockStorage.set('agentsDiffSidebarWidth', '{invalid}')

    const results = migrateDrawerWidths()

    expect(results.top).toBeNull()
    expect(results.right).toBeNull()
  })
})

describe('MIG5-003: Initialize Default Layout', () => {
  it('should initialize default layout when no config exists', () => {
    const initialized = initializeDefaultLayout()

    expect(initialized).toBe(true)
    const storedConfig = mockStorage.get('icon-layout-store')
    expect(storedConfig).toBeTruthy()

    if (storedConfig) {
      const parsed = JSON.parse(storedConfig)
      expect(parsed.state.config.version).toBe(1)
      expect(parsed.state.config.bars).toBeDefined()
      expect(parsed.version).toBe(1)
    }
  })

  it('should skip initialization when config already exists', () => {
    // Setup: existing config
    const existingConfig = {
      state: {
        config: {
          version: 1,
          bars: {
            top: [{ iconId: 'custom', barId: 'top', position: 0 }],
            right: [],
          },
          lastModified: new Date().toISOString(),
        },
      },
      version: 1,
    }
    mockStorage.set('icon-layout-store', JSON.stringify(existingConfig))

    const initialized = initializeDefaultLayout()

    expect(initialized).toBe(false)
    // Config should remain unchanged
    const storedConfig = mockStorage.get('icon-layout-store')
    expect(storedConfig).toBe(JSON.stringify(existingConfig))
  })
})

describe('MIG5-001: Complete Migration', () => {
  it('should skip migration if already completed', () => {
    // Setup: migration already completed
    setMigrationComplete()

    const result = runMigration()

    expect(result.success).toBe(true)
    expect(result.alreadyMigrated).toBe(true)
    expect(result.widthsMigrated.top).toBeNull()
    expect(result.widthsMigrated.right).toBeNull()
    expect(result.layoutInitialized).toBe(false)
  })

  it('should migrate widths and initialize layout for new users', () => {
    // Setup: new user (no existing data)
    const result = runMigration()

    expect(result.success).toBe(true)
    expect(result.alreadyMigrated).toBe(false)
    expect(result.widthsMigrated.top).toBeNull() // No old widths to migrate
    expect(result.widthsMigrated.right).toBeNull()
    expect(result.layoutInitialized).toBe(true) // Default layout initialized
    expect(hasMigrationRun()).toBe(true) // Flag set
  })

  it('should migrate existing user data (MIG5-005)', () => {
    // Setup: existing user with old widths
    mockStorage.set('agentsPreviewSidebarWidth', JSON.stringify(475))
    mockStorage.set('agentsDiffSidebarWidth', JSON.stringify(525))

    const result = runMigration()

    expect(result.success).toBe(true)
    expect(result.alreadyMigrated).toBe(false)
    expect(result.widthsMigrated.top).toBe(475)
    expect(result.widthsMigrated.right).toBe(525)
    expect(result.layoutInitialized).toBe(true)
    expect(hasMigrationRun()).toBe(true)
  })

  it('should verify width preservation after migration (MIG5-006)', () => {
    // Setup: existing user with specific widths
    const originalPreviewWidth = 650
    const originalDiffWidth = 380
    mockStorage.set('agentsPreviewSidebarWidth', JSON.stringify(originalPreviewWidth))
    mockStorage.set('agentsDiffSidebarWidth', JSON.stringify(originalDiffWidth))

    runMigration()

    // Verify widths are preserved in new storage keys
    const topWidth = mockStorage.get('layout:drawer-width:top')
    const rightWidth = mockStorage.get('layout:drawer-width:right')

    expect(topWidth).toBe(JSON.stringify(originalPreviewWidth))
    expect(rightWidth).toBe(JSON.stringify(originalDiffWidth))

    // Verify widths match exactly
    expect(JSON.parse(topWidth!)).toBe(originalPreviewWidth)
    expect(JSON.parse(rightWidth!)).toBe(originalDiffWidth)
  })

  it('should verify default layout initialization for new users (MIG5-007)', () => {
    // Setup: new user (no existing config)
    runMigration()

    // Verify default layout was created
    const storedConfig = mockStorage.get('icon-layout-store')
    expect(storedConfig).toBeTruthy()

    if (storedConfig) {
      const parsed = JSON.parse(storedConfig)
      const config = parsed.state.config

      // Verify structure
      expect(config.version).toBe(1)
      expect(config.bars).toBeDefined()
      expect(typeof config.bars).toBe('object')

      // Verify bars exist
      expect(config.bars.top).toBeDefined()
      expect(config.bars.right).toBeDefined()
      expect(Array.isArray(config.bars.top)).toBe(true)
      expect(Array.isArray(config.bars.right)).toBe(true)

      // Verify icons have correct structure
      config.bars.top.forEach((icon: any, index: number) => {
        expect(icon.iconId).toBeDefined()
        expect(icon.barId).toBe('top')
        expect(icon.position).toBe(index)
      })

      config.bars.right.forEach((icon: any, index: number) => {
        expect(icon.iconId).toBeDefined()
        expect(icon.barId).toBe('right')
        expect(icon.position).toBe(index)
      })
    }
  })

  it('should set migration flag to prevent re-running (MIG5-004)', () => {
    // First migration
    runMigration()
    expect(hasMigrationRun()).toBe(true)

    // Clear storage except migration flag
    const flagValue = mockStorage.get('icon-bar-migration-v1')
    mockStorage.clear()
    mockStorage.set('icon-bar-migration-v1', flagValue!)

    // Second migration attempt should skip
    const result = runMigration()
    expect(result.alreadyMigrated).toBe(true)
    expect(result.widthsMigrated.top).toBeNull()
    expect(result.widthsMigrated.right).toBeNull()
    expect(result.layoutInitialized).toBe(false)
  })

  it('should handle migration errors gracefully', () => {
    // Override localStorage.setItem to throw error
    const originalSetItem = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('Storage quota exceeded')
    }

    const result = runMigration()

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()

    // Restore original method
    localStorage.setItem = originalSetItem
  })
})

describe('Edge Cases and Error Handling', () => {
  it('should handle missing localStorage gracefully', () => {
    // Simulate localStorage unavailable
    const originalLocalStorage = global.localStorage
    // @ts-ignore - intentionally setting to undefined
    global.localStorage = undefined

    expect(() => hasMigrationRun()).not.toThrow()

    // Restore localStorage
    global.localStorage = originalLocalStorage
  })

  it('should handle SecurityError (private browsing)', () => {
    // Simulate SecurityError when accessing localStorage
    global.localStorage = {
      getItem: () => {
        const error = new DOMException('SecurityError')
        error.name = 'SecurityError'
        throw error
      },
      setItem: () => {
        const error = new DOMException('SecurityError')
        error.name = 'SecurityError'
        throw error
      },
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as Storage

    expect(() => hasMigrationRun()).not.toThrow()
    expect(() => runMigration()).not.toThrow()
  })

  it('should handle QuotaExceededError', () => {
    // Simulate QuotaExceededError when writing to localStorage
    global.localStorage = {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: () => {
        const error = new DOMException('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      },
      removeItem: (key: string) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
      length: mockStorage.size,
      key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
    } as Storage

    const result = runMigration()
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
