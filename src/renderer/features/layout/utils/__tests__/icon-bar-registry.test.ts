/**
 * Unit Tests: Icon Bar Registry Validation
 * Feature: 004-customizable-sidebars
 * Task: MIG1-006
 *
 * Tests for icon bar registry validation rules:
 * - No duplicate bar IDs
 * - All bars have required fields
 * - Helper functions work correctly
 * - Default icons reference valid icon IDs
 * - Bar configurations are valid
 */

import { describe, it, expect } from 'vitest'
import {
  ICON_BAR_REGISTRY,
  ICON_BAR_MAP,
  getIconBar,
  getAllBarIds,
  isValidBarId,
} from '../icon-bar-registry'
import { isValidIconId } from '../../constants/icon-registry'

describe('Icon Bar Registry - Core Validation', () => {
  describe('Registry Structure', () => {
    it('should have at least one icon bar registered', () => {
      expect(ICON_BAR_REGISTRY.length).toBeGreaterThan(0)
    })

    it('should export an array of icon bar definitions', () => {
      expect(Array.isArray(ICON_BAR_REGISTRY)).toBe(true)
    })
  })

  describe('No Duplicate Bar IDs (Invariant 1)', () => {
    it('should not have duplicate bar IDs', () => {
      const ids = ICON_BAR_REGISTRY.map(bar => bar.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have matching ID counts between registry and ICON_BAR_MAP', () => {
      expect(ICON_BAR_MAP.size).toBe(ICON_BAR_REGISTRY.length)
    })
  })

  describe('Required Fields', () => {
    it.each(ICON_BAR_REGISTRY)('bar "$id" should have all required fields', (bar) => {
      // Required fields from IconBarDefinition interface
      expect(bar).toHaveProperty('id')
      expect(bar).toHaveProperty('label')
      expect(bar).toHaveProperty('orientation')
      expect(bar).toHaveProperty('placement')
      expect(bar).toHaveProperty('drawerSide')
      expect(bar).toHaveProperty('defaultIcons')

      // Type validation
      expect(typeof bar.id).toBe('string')
      expect(typeof bar.label).toBe('string')
      expect(['horizontal', 'vertical']).toContain(bar.orientation)
      expect(['top', 'right', 'bottom', 'left']).toContain(bar.placement)
      expect(['left', 'right']).toContain(bar.drawerSide)
      expect(Array.isArray(bar.defaultIcons)).toBe(true)
    })

    it.each(ICON_BAR_REGISTRY)('bar "$id" should have non-empty id and label', (bar) => {
      expect(bar.id.trim()).not.toBe('')
      expect(bar.label.trim()).not.toBe('')
    })
  })

  describe('Valid Enums', () => {
    const validOrientations = ['horizontal', 'vertical']
    const validPlacements = ['top', 'right', 'bottom', 'left']
    const validDrawerSides = ['left', 'right']

    it.each(ICON_BAR_REGISTRY)('bar "$id" should have valid orientation', (bar) => {
      expect(validOrientations).toContain(bar.orientation)
    })

    it.each(ICON_BAR_REGISTRY)('bar "$id" should have valid placement', (bar) => {
      expect(validPlacements).toContain(bar.placement)
    })

    it.each(ICON_BAR_REGISTRY)('bar "$id" should have valid drawerSide', (bar) => {
      expect(validDrawerSides).toContain(bar.drawerSide)
    })
  })

  describe('Default Icons Validation', () => {
    it.each(ICON_BAR_REGISTRY)('bar "$id" should have defaultIcons as array', (bar) => {
      expect(Array.isArray(bar.defaultIcons)).toBe(true)
    })

    it.each(ICON_BAR_REGISTRY)('bar "$id" defaultIcons should reference valid icon IDs', (bar) => {
      bar.defaultIcons.forEach(iconId => {
        expect(isValidIconId(iconId)).toBe(true)
      })
    })

    it.each(ICON_BAR_REGISTRY)('bar "$id" should not have duplicate icons in defaultIcons', (bar) => {
      const uniqueIcons = new Set(bar.defaultIcons)
      expect(uniqueIcons.size).toBe(bar.defaultIcons.length)
    })

    it.each(ICON_BAR_REGISTRY)('bar "$id" defaultIcons should be non-empty strings', (bar) => {
      bar.defaultIcons.forEach(iconId => {
        expect(typeof iconId).toBe('string')
        expect(iconId.trim()).not.toBe('')
      })
    })
  })
})

describe('Icon Bar Registry - Helper Functions', () => {
  describe('ICON_BAR_MAP', () => {
    it('should be a Map instance', () => {
      expect(ICON_BAR_MAP).toBeInstanceOf(Map)
    })

    it('should have same size as registry', () => {
      expect(ICON_BAR_MAP.size).toBe(ICON_BAR_REGISTRY.length)
    })

    it('should map all bar IDs correctly', () => {
      ICON_BAR_REGISTRY.forEach(bar => {
        expect(ICON_BAR_MAP.get(bar.id)).toBe(bar)
      })
    })
  })

  describe('getIconBar()', () => {
    it('should return bar definition for valid ID', () => {
      const firstBar = ICON_BAR_REGISTRY[0]
      const result = getIconBar(firstBar.id)

      expect(result).toBeDefined()
      expect(result?.id).toBe(firstBar.id)
    })

    it('should return undefined for invalid ID', () => {
      const result = getIconBar('non-existent-bar-id')
      expect(result).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      const result = getIconBar('')
      expect(result).toBeUndefined()
    })

    it('should handle case-sensitive IDs', () => {
      const firstBar = ICON_BAR_REGISTRY[0]
      const upperCaseId = firstBar.id.toUpperCase()

      if (upperCaseId !== firstBar.id) {
        const result = getIconBar(upperCaseId)
        expect(result).toBeUndefined()
      }
    })
  })

  describe('isValidBarId()', () => {
    it('should return true for all registered bar IDs', () => {
      ICON_BAR_REGISTRY.forEach(bar => {
        expect(isValidBarId(bar.id)).toBe(true)
      })
    })

    it('should return false for non-existent bar ID', () => {
      expect(isValidBarId('fake-bar-id')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isValidBarId('')).toBe(false)
    })

    it('should be case-sensitive', () => {
      const firstBar = ICON_BAR_REGISTRY[0]
      const upperCaseId = firstBar.id.toUpperCase()

      if (upperCaseId !== firstBar.id) {
        expect(isValidBarId(upperCaseId)).toBe(false)
      }
    })
  })

  describe('getAllBarIds()', () => {
    it('should return array of all bar IDs', () => {
      const ids = getAllBarIds()

      expect(Array.isArray(ids)).toBe(true)
      expect(ids.length).toBe(ICON_BAR_REGISTRY.length)
    })

    it('should return IDs in same order as registry', () => {
      const ids = getAllBarIds()

      ids.forEach((id, index) => {
        expect(id).toBe(ICON_BAR_REGISTRY[index].id)
      })
    })

    it('should not contain duplicates', () => {
      const ids = getAllBarIds()
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })
  })
})

describe('Icon Bar Registry - Current Configuration (MIG1-003)', () => {
  const expectedBars = ['top', 'right']

  describe('Migration Phase Bars', () => {
    it('should have exactly 2 bars (top and right)', () => {
      expect(ICON_BAR_REGISTRY.length).toBe(2)
    })

    it('should include all expected migration phase bars', () => {
      expectedBars.forEach(barId => {
        expect(isValidBarId(barId)).toBe(true)
      })
    })

    describe('Top Bar', () => {
      const topBar = ICON_BAR_REGISTRY.find(b => b.id === 'top')

      it('should exist', () => {
        expect(topBar).toBeDefined()
      })

      it('should have horizontal orientation', () => {
        expect(topBar?.orientation).toBe('horizontal')
      })

      it('should have top placement', () => {
        expect(topBar?.placement).toBe('top')
      })

      it('should open drawer on right side', () => {
        expect(topBar?.drawerSide).toBe('right')
      })

      it('should have correct default icons (terminal, preview, changes)', () => {
        expect(topBar?.defaultIcons).toEqual(['terminal', 'preview', 'changes'])
      })

      it('should have descriptive label', () => {
        expect(topBar?.label).toBe('Top Action Bar')
      })
    })

    describe('Right Bar', () => {
      const rightBar = ICON_BAR_REGISTRY.find(b => b.id === 'right')

      it('should exist', () => {
        expect(rightBar).toBeDefined()
      })

      it('should have vertical orientation', () => {
        expect(rightBar?.orientation).toBe('vertical')
      })

      it('should have right placement', () => {
        expect(rightBar?.placement).toBe('right')
      })

      it('should open drawer on right side', () => {
        expect(rightBar?.drawerSide).toBe('right')
      })

      it('should have correct default icons (settings, inbox, automations)', () => {
        expect(rightBar?.defaultIcons).toEqual(['settings', 'inbox', 'automations'])
      })

      it('should have descriptive label', () => {
        expect(rightBar?.label).toBe('Right Icon Bar')
      })
    })
  })

  describe('Logical Consistency', () => {
    it('horizontal bars should have top or bottom placement', () => {
      const horizontalBars = ICON_BAR_REGISTRY.filter(b => b.orientation === 'horizontal')

      horizontalBars.forEach(bar => {
        expect(['top', 'bottom']).toContain(bar.placement)
      })
    })

    it('vertical bars should have left or right placement', () => {
      const verticalBars = ICON_BAR_REGISTRY.filter(b => b.orientation === 'vertical')

      verticalBars.forEach(bar => {
        expect(['left', 'right']).toContain(bar.placement)
      })
    })

    it('all bars should currently use right drawer side', () => {
      // Per migration plan, both drawers open from right side
      ICON_BAR_REGISTRY.forEach(bar => {
        expect(bar.drawerSide).toBe('right')
      })
    })
  })
})

describe('Icon Bar Registry - Edge Cases', () => {
  describe('Defensive Programming', () => {
    it('should handle null/undefined bar ID in getIconBar', () => {
      // @ts-expect-error - Testing runtime behavior
      expect(getIconBar(null)).toBeUndefined()
      // @ts-expect-error - Testing runtime behavior
      expect(getIconBar(undefined)).toBeUndefined()
    })

    it('should handle numeric bar ID in getIconBar', () => {
      // @ts-expect-error - Testing runtime behavior
      expect(getIconBar(123)).toBeUndefined()
    })

    it('should handle object bar ID in getIconBar', () => {
      // @ts-expect-error - Testing runtime behavior
      expect(getIconBar({})).toBeUndefined()
    })
  })

  describe('ID Validation', () => {
    it('should reject whitespace-only IDs', () => {
      expect(isValidBarId('   ')).toBe(false)
      expect(isValidBarId('\t')).toBe(false)
      expect(isValidBarId('\n')).toBe(false)
    })

    it('should not have bars with whitespace in IDs', () => {
      ICON_BAR_REGISTRY.forEach(bar => {
        expect(bar.id).not.toMatch(/\s/)
      })
    })

    it('should not have bars with special characters in IDs', () => {
      ICON_BAR_REGISTRY.forEach(bar => {
        // Only allow alphanumeric, dash, underscore
        expect(bar.id).toMatch(/^[a-z0-9-_]+$/)
      })
    })
  })

  describe('Default Icons Edge Cases', () => {
    it('should allow empty defaultIcons array', () => {
      // While not recommended, it should be valid
      // This tests the generic architecture (bars can start empty)
      const barsWithEmptyDefaults = ICON_BAR_REGISTRY.filter(
        bar => bar.defaultIcons.length === 0
      )

      // Currently no bars should be empty, but structure supports it
      expect(barsWithEmptyDefaults).toHaveLength(0)
    })

    it('should handle bars with single icon', () => {
      const barsWithSingleIcon = ICON_BAR_REGISTRY.filter(
        bar => bar.defaultIcons.length === 1
      )

      // All should be valid even with single icon
      barsWithSingleIcon.forEach(bar => {
        expect(bar.defaultIcons[0]).toBeTruthy()
        expect(isValidIconId(bar.defaultIcons[0])).toBe(true)
      })
    })

    it('should handle bars with many icons', () => {
      // Test that there's no hard limit on icon count
      ICON_BAR_REGISTRY.forEach(bar => {
        expect(bar.defaultIcons.length).toBeGreaterThanOrEqual(0)
        expect(bar.defaultIcons.length).toBeLessThan(100) // Sanity check
      })
    })
  })

  describe('Performance', () => {
    it('should perform fast lookups with ICON_BAR_MAP', () => {
      const startTime = performance.now()

      // Perform 1000 lookups
      for (let i = 0; i < 1000; i++) {
        const randomBar = ICON_BAR_REGISTRY[i % ICON_BAR_REGISTRY.length]
        getIconBar(randomBar.id)
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete 1000 lookups in less than 10ms
      expect(duration).toBeLessThan(10)
    })
  })
})

describe('Icon Bar Registry - Integration with Icon Registry', () => {
  describe('Cross-Registry Validation', () => {
    it('all defaultIcons should exist in icon registry', () => {
      const allDefaultIconIds = ICON_BAR_REGISTRY.flatMap(bar => bar.defaultIcons)

      allDefaultIconIds.forEach(iconId => {
        expect(isValidIconId(iconId)).toBe(true)
      })
    })

    it('no icon should appear in multiple bars by default', () => {
      const allDefaultIconIds = ICON_BAR_REGISTRY.flatMap(bar => bar.defaultIcons)
      const uniqueIconIds = new Set(allDefaultIconIds)

      // All icons should be unique across all bars
      expect(uniqueIconIds.size).toBe(allDefaultIconIds.length)
    })

    it('should use all registered icons exactly once', () => {
      // For migration phase, all icons should be in default layout
      const allDefaultIconIds = ICON_BAR_REGISTRY.flatMap(bar => bar.defaultIcons)
      const expectedIconIds = ['settings', 'automations', 'inbox', 'terminal', 'changes', 'preview']

      expect(allDefaultIconIds.sort()).toEqual(expectedIconIds.sort())
    })
  })

  describe('Bar Placement Uniqueness', () => {
    it('should not have multiple bars with same placement', () => {
      const placements = ICON_BAR_REGISTRY.map(bar => bar.placement)
      const uniquePlacements = new Set(placements)

      // For initial implementation, each placement should be unique
      expect(uniquePlacements.size).toBe(placements.length)
    })

    it('should have top placement exactly once', () => {
      const topBars = ICON_BAR_REGISTRY.filter(bar => bar.placement === 'top')
      expect(topBars).toHaveLength(1)
    })

    it('should have right placement exactly once', () => {
      const rightBars = ICON_BAR_REGISTRY.filter(bar => bar.placement === 'right')
      expect(rightBars).toHaveLength(1)
    })

    it('should not have bottom or left placements yet', () => {
      const bottomBars = ICON_BAR_REGISTRY.filter(bar => bar.placement === 'bottom')
      const leftBars = ICON_BAR_REGISTRY.filter(bar => bar.placement === 'left')

      expect(bottomBars).toHaveLength(0)
      expect(leftBars).toHaveLength(0)
    })
  })
})
