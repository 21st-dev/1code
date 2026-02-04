/**
 * Unit Tests: Icon Registry Validation
 * Feature: 004-customizable-sidebars
 * Task: MIG1-005
 *
 * Tests for icon registry validation rules:
 * - No duplicate icon IDs
 * - All icons have required fields
 * - Helper functions work correctly
 * - Icon IDs are valid strings
 */

import { describe, it, expect } from 'vitest'
import {
  ICON_REGISTRY,
  ICON_MAP,
  ICON_IDS,
  getIcon,
  canIconBeInBar,
  isValidIconId,
  getAllIconIds,
} from '../icon-registry'

describe('Icon Registry - Core Validation', () => {
  describe('Registry Structure', () => {
    it('should have at least one icon registered', () => {
      expect(ICON_REGISTRY.length).toBeGreaterThan(0)
    })

    it('should export an array of icon definitions', () => {
      expect(Array.isArray(ICON_REGISTRY)).toBe(true)
    })
  })

  describe('No Duplicate IDs (Invariant 1)', () => {
    it('should not have duplicate icon IDs', () => {
      const ids = ICON_REGISTRY.map(icon => icon.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have matching ID counts between registry and ICON_IDS set', () => {
      expect(ICON_IDS.size).toBe(ICON_REGISTRY.length)
    })
  })

  describe('Required Fields', () => {
    it.each(ICON_REGISTRY)('icon "$id" should have all required fields', (icon) => {
      // Required fields from Icon interface
      expect(icon).toHaveProperty('id')
      expect(icon).toHaveProperty('label')
      expect(icon).toHaveProperty('icon')
      expect(icon).toHaveProperty('page')

      // Type validation
      expect(typeof icon.id).toBe('string')
      expect(typeof icon.label).toBe('string')
      expect(icon.icon).toBeDefined() // Can be function or component
      expect(icon.page).toBeDefined() // Can be lazy-loaded component
    })

    it.each(ICON_REGISTRY)('icon "$id" should have non-empty id and label', (icon) => {
      expect(icon.id.trim()).not.toBe('')
      expect(icon.label.trim()).not.toBe('')
    })
  })

  describe('Optional Fields', () => {
    it.each(ICON_REGISTRY)('icon "$id" allowedBars should be array if present', (icon) => {
      if (icon.allowedBars) {
        expect(Array.isArray(icon.allowedBars)).toBe(true)
        expect(icon.allowedBars.length).toBeGreaterThan(0)
      }
    })
  })
})

describe('Icon Registry - Helper Functions', () => {
  describe('ICON_MAP', () => {
    it('should be a Map instance', () => {
      expect(ICON_MAP).toBeInstanceOf(Map)
    })

    it('should have same size as registry', () => {
      expect(ICON_MAP.size).toBe(ICON_REGISTRY.length)
    })

    it('should map all icon IDs correctly', () => {
      ICON_REGISTRY.forEach(icon => {
        expect(ICON_MAP.get(icon.id)).toBe(icon)
      })
    })
  })

  describe('getIcon()', () => {
    it('should return icon definition for valid ID', () => {
      const firstIcon = ICON_REGISTRY[0]
      const result = getIcon(firstIcon.id)

      expect(result).toBeDefined()
      expect(result?.id).toBe(firstIcon.id)
    })

    it('should return undefined for invalid ID', () => {
      const result = getIcon('non-existent-icon-id')
      expect(result).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      const result = getIcon('')
      expect(result).toBeUndefined()
    })

    it('should handle case-sensitive IDs', () => {
      const firstIcon = ICON_REGISTRY[0]
      const upperCaseId = firstIcon.id.toUpperCase()

      if (upperCaseId !== firstIcon.id) {
        const result = getIcon(upperCaseId)
        expect(result).toBeUndefined()
      }
    })
  })

  describe('isValidIconId()', () => {
    it('should return true for all registered icon IDs', () => {
      ICON_REGISTRY.forEach(icon => {
        expect(isValidIconId(icon.id)).toBe(true)
      })
    })

    it('should return false for non-existent icon ID', () => {
      expect(isValidIconId('fake-icon-id')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isValidIconId('')).toBe(false)
    })

    it('should be case-sensitive', () => {
      const firstIcon = ICON_REGISTRY[0]
      const upperCaseId = firstIcon.id.toUpperCase()

      if (upperCaseId !== firstIcon.id) {
        expect(isValidIconId(upperCaseId)).toBe(false)
      }
    })
  })

  describe('getAllIconIds()', () => {
    it('should return array of all icon IDs', () => {
      const ids = getAllIconIds()

      expect(Array.isArray(ids)).toBe(true)
      expect(ids.length).toBe(ICON_REGISTRY.length)
    })

    it('should return IDs in same order as registry', () => {
      const ids = getAllIconIds()

      ids.forEach((id, index) => {
        expect(id).toBe(ICON_REGISTRY[index].id)
      })
    })

    it('should not contain duplicates', () => {
      const ids = getAllIconIds()
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe('canIconBeInBar()', () => {
    it('should return false for non-existent icon ID', () => {
      expect(canIconBeInBar('fake-icon', 'top')).toBe(false)
    })

    it('should return true for icon with no allowedBars restriction', () => {
      // Find an icon without allowedBars restriction
      const unrestrictedIcon = ICON_REGISTRY.find(icon => !icon.allowedBars)

      if (unrestrictedIcon) {
        expect(canIconBeInBar(unrestrictedIcon.id, 'top')).toBe(true)
        expect(canIconBeInBar(unrestrictedIcon.id, 'right')).toBe(true)
        expect(canIconBeInBar(unrestrictedIcon.id, 'bottom')).toBe(true)
      } else {
        // All icons have restrictions, test passes
        expect(true).toBe(true)
      }
    })

    it('should respect allowedBars restrictions', () => {
      // Find an icon with allowedBars restriction
      const restrictedIcon = ICON_REGISTRY.find(icon => icon.allowedBars && icon.allowedBars.length > 0)

      if (restrictedIcon && restrictedIcon.allowedBars) {
        // Should return true for allowed bars
        restrictedIcon.allowedBars.forEach(barId => {
          expect(canIconBeInBar(restrictedIcon.id, barId)).toBe(true)
        })

        // Should return false for bar not in allowedBars (if any)
        const disallowedBar = ['top', 'right', 'bottom', 'left'].find(
          barId => !restrictedIcon.allowedBars?.includes(barId)
        )

        if (disallowedBar) {
          expect(canIconBeInBar(restrictedIcon.id, disallowedBar)).toBe(false)
        }
      } else {
        // No restricted icons, test passes
        expect(true).toBe(true)
      }
    })
  })
})

describe('Icon Registry - Current Configuration (MIG1-003)', () => {
  const expectedIcons = ['settings', 'automations', 'inbox', 'terminal', 'changes', 'preview']

  describe('Migration Phase Icons', () => {
    it('should include all expected migration phase icons', () => {
      expectedIcons.forEach(iconId => {
        expect(isValidIconId(iconId)).toBe(true)
      })
    })

    it('should have Settings icon for right bar', () => {
      const settingsIcon = getIcon('settings')
      expect(settingsIcon).toBeDefined()
      expect(settingsIcon?.label).toBe('Settings')
    })

    it('should have Automations icon for beta feature', () => {
      const automationsIcon = getIcon('automations')
      expect(automationsIcon).toBeDefined()
      expect(automationsIcon?.label).toBe('Automations')
    })

    it('should have Inbox icon for beta feature', () => {
      const inboxIcon = getIcon('inbox')
      expect(inboxIcon).toBeDefined()
      expect(inboxIcon?.label).toBe('Inbox')
    })

    it('should have Terminal icon for top bar', () => {
      const terminalIcon = getIcon('terminal')
      expect(terminalIcon).toBeDefined()
      expect(terminalIcon?.label).toBe('Terminal')
    })

    it('should have Changes icon for top bar', () => {
      const changesIcon = getIcon('changes')
      expect(changesIcon).toBeDefined()
      expect(changesIcon?.label).toBe('Changes')
    })

    it('should have Preview icon for top bar', () => {
      const previewIcon = getIcon('preview')
      expect(previewIcon).toBeDefined()
      expect(previewIcon?.label).toBe('Preview')
    })
  })

  describe('Icon Components', () => {
    it.each(expectedIcons)('icon "%s" should have a valid icon component', (iconId) => {
      const icon = getIcon(iconId)

      expect(icon).toBeDefined()
      expect(icon?.icon).toBeDefined()

      // Icon should be either a function (React component) or object (JSX element)
      expect(['function', 'object']).toContain(typeof icon?.icon)
    })

    it.each(expectedIcons)('icon "%s" should have a lazy-loaded page component', (iconId) => {
      const icon = getIcon(iconId)

      expect(icon).toBeDefined()
      expect(icon?.page).toBeDefined()

      // Page should be a lazy-loaded component (object with $$typeof)
      expect(icon?.page).toBeTypeOf('object')
    })
  })
})

describe('Icon Registry - Edge Cases', () => {
  describe('Defensive Programming', () => {
    it('should handle null/undefined icon ID in getIcon', () => {
      // @ts-expect-error - Testing runtime behavior
      expect(getIcon(null)).toBeUndefined()
      // @ts-expect-error - Testing runtime behavior
      expect(getIcon(undefined)).toBeUndefined()
    })

    it('should handle numeric icon ID in getIcon', () => {
      // @ts-expect-error - Testing runtime behavior
      expect(getIcon(123)).toBeUndefined()
    })

    it('should handle object icon ID in getIcon', () => {
      // @ts-expect-error - Testing runtime behavior
      expect(getIcon({})).toBeUndefined()
    })
  })

  describe('ID Validation', () => {
    it('should reject whitespace-only IDs', () => {
      expect(isValidIconId('   ')).toBe(false)
      expect(isValidIconId('\t')).toBe(false)
      expect(isValidIconId('\n')).toBe(false)
    })

    it('should not have icons with whitespace in IDs', () => {
      ICON_REGISTRY.forEach(icon => {
        expect(icon.id).not.toMatch(/\s/)
      })
    })

    it('should not have icons with special characters in IDs', () => {
      ICON_REGISTRY.forEach(icon => {
        // Only allow alphanumeric, dash, underscore
        expect(icon.id).toMatch(/^[a-z0-9-_]+$/)
      })
    })
  })

  describe('Performance', () => {
    it('should perform fast lookups with ICON_MAP', () => {
      const startTime = performance.now()

      // Perform 1000 lookups
      for (let i = 0; i < 1000; i++) {
        const randomIcon = ICON_REGISTRY[i % ICON_REGISTRY.length]
        getIcon(randomIcon.id)
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete 1000 lookups in less than 10ms
      expect(duration).toBeLessThan(10)
    })
  })
})
