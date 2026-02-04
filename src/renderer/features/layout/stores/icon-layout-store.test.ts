/**
 * Unit Tests: Zustand Store Actions
 * Feature: 004-customizable-sidebars
 * Task: TEST-001
 *
 * Tests for icon layout store actions:
 * - moveIcon (moving icons between bars)
 * - reorderIcon (reordering within same bar)
 * - resetToDefaults
 * - getIconLocation
 * - getBarIcons
 * - reconcileWithRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIconLayoutStore, getDefaultIconLayout, DEFAULT_ICON_LAYOUT } from './icon-layout-store'
import type { IconBarDefinition, Icon } from '../types/icon-bar.types'

// Mock getWindowId to return consistent value
vi.mock('../../../contexts/WindowContext', () => ({
  getWindowId: () => 'test-window',
}))

describe('Icon Layout Store - Core Actions', () => {
  beforeEach(() => {
    // Reset store to default before each test
    const { result } = renderHook(() => useIconLayoutStore())
    act(() => {
      result.current.resetToDefaults()
    })
    localStorage.clear()
  })

  describe('getDefaultIconLayout()', () => {
    it('should generate default layout from registry', () => {
      const defaultLayout = getDefaultIconLayout()

      expect(defaultLayout).toBeDefined()
      expect(defaultLayout.version).toBe(1)
      expect(defaultLayout.bars).toBeDefined()
      expect(defaultLayout.lastModified).toBeDefined()
    })

    it('should have top and right bars', () => {
      const defaultLayout = getDefaultIconLayout()

      expect(defaultLayout.bars.top).toBeDefined()
      expect(defaultLayout.bars.right).toBeDefined()
    })

    it('should have correct icons in top bar', () => {
      const defaultLayout = getDefaultIconLayout()

      const topBarIconIds = defaultLayout.bars.top.map(ic => ic.iconId)
      expect(topBarIconIds).toEqual(['terminal', 'preview', 'changes'])
    })

    it('should have correct icons in right bar', () => {
      const defaultLayout = getDefaultIconLayout()

      const rightBarIconIds = defaultLayout.bars.right.map(ic => ic.iconId)
      expect(rightBarIconIds).toEqual(['settings', 'inbox', 'automations'])
    })

    it('should have sequential positions starting from 0', () => {
      const defaultLayout = getDefaultIconLayout()

      Object.values(defaultLayout.bars).forEach(icons => {
        icons.forEach((icon, index) => {
          expect(icon.position).toBe(index)
        })
      })
    })

    it('should set correct barId for each icon', () => {
      const defaultLayout = getDefaultIconLayout()

      Object.entries(defaultLayout.bars).forEach(([barId, icons]) => {
        icons.forEach(icon => {
          expect(icon.barId).toBe(barId)
        })
      })
    })
  })

  describe('DEFAULT_ICON_LAYOUT constant', () => {
    it('should be defined and match structure from getDefaultIconLayout', () => {
      expect(DEFAULT_ICON_LAYOUT).toBeDefined()
      expect(DEFAULT_ICON_LAYOUT.version).toBe(1)
      expect(DEFAULT_ICON_LAYOUT.bars).toBeDefined()
    })
  })

  describe('Initial State', () => {
    it('should start with default configuration', () => {
      const { result } = renderHook(() => useIconLayoutStore())

      expect(result.current.config.version).toBe(1)
      expect(result.current.config.bars.top).toBeDefined()
      expect(result.current.config.bars.right).toBeDefined()
    })

    it('should have all 6 icons distributed across bars', () => {
      const { result } = renderHook(() => useIconLayoutStore())

      const allIcons = [
        ...result.current.config.bars.top,
        ...result.current.config.bars.right,
      ]

      expect(allIcons).toHaveLength(6)
    })
  })
})

describe('Icon Layout Store - moveIcon Action (TEST-001)', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useIconLayoutStore())
    act(() => {
      result.current.resetToDefaults()
    })
    localStorage.clear()
  })

  it('should move icon from top bar to right bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Move 'terminal' from top to right bar at position 0
    act(() => {
      result.current.moveIcon('terminal', 'right', 0)
    })

    const rightBarIcons = result.current.getBarIcons('right')
    const topBarIcons = result.current.getBarIcons('top')

    expect(rightBarIcons[0].iconId).toBe('terminal')
    expect(topBarIcons.find(ic => ic.iconId === 'terminal')).toBeUndefined()
  })

  it('should move icon from right bar to top bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Move 'settings' from right to top bar at position 1
    act(() => {
      result.current.moveIcon('settings', 'top', 1)
    })

    const topBarIcons = result.current.getBarIcons('top')
    const rightBarIcons = result.current.getBarIcons('right')

    expect(topBarIcons[1].iconId).toBe('settings')
    expect(rightBarIcons.find(ic => ic.iconId === 'settings')).toBeUndefined()
  })

  it('should correctly reindex positions in source bar after move', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Top bar starts with: [terminal(0), preview(1), changes(2)]
    // Move terminal out
    act(() => {
      result.current.moveIcon('terminal', 'right', 0)
    })

    const topBarIcons = result.current.getBarIcons('top')

    // After move: [preview(0), changes(1)]
    expect(topBarIcons).toHaveLength(2)
    expect(topBarIcons[0].iconId).toBe('preview')
    expect(topBarIcons[0].position).toBe(0)
    expect(topBarIcons[1].iconId).toBe('changes')
    expect(topBarIcons[1].position).toBe(1)
  })

  it('should correctly reindex positions in target bar after move', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Right bar starts with: [settings(0), inbox(1), automations(2)]
    // Move terminal to position 1
    act(() => {
      result.current.moveIcon('terminal', 'right', 1)
    })

    const rightBarIcons = result.current.getBarIcons('right')

    // After move: [settings(0), terminal(1), inbox(2), automations(3)]
    expect(rightBarIcons).toHaveLength(4)
    expect(rightBarIcons[0].iconId).toBe('settings')
    expect(rightBarIcons[0].position).toBe(0)
    expect(rightBarIcons[1].iconId).toBe('terminal')
    expect(rightBarIcons[1].position).toBe(1)
    expect(rightBarIcons[2].iconId).toBe('inbox')
    expect(rightBarIcons[2].position).toBe(2)
  })

  it('should move icon to end of target bar when position is out of bounds', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Move to position 100 (out of bounds)
    act(() => {
      result.current.moveIcon('terminal', 'right', 100)
    })

    const rightBarIcons = result.current.getBarIcons('right')
    const lastIcon = rightBarIcons[rightBarIcons.length - 1]

    // Should be added at the end
    expect(lastIcon.iconId).toBe('terminal')
  })

  it('should update lastModified timestamp after move', async () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const beforeTimestamp = result.current.config.lastModified

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10))

    act(() => {
      result.current.moveIcon('terminal', 'right', 0)
    })

    const afterTimestamp = result.current.config.lastModified
    expect(afterTimestamp).not.toBe(beforeTimestamp)
  })

  it('should not move icon if it does not exist', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const beforeConfig = result.current.config

    act(() => {
      result.current.moveIcon('non-existent-icon', 'right', 0)
    })

    // Config should remain unchanged
    expect(result.current.config).toEqual(beforeConfig)
  })

  it('should warn and not move if trying to move to same bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const consoleSpy = vi.spyOn(console, 'warn')

    act(() => {
      result.current.moveIcon('terminal', 'top', 1) // terminal is already in top
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Use reorderIcon for same-bar moves')
    )
  })

  it('should update barId property of moved icon', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.moveIcon('terminal', 'right', 0)
    })

    const location = result.current.getIconLocation('terminal')
    expect(location?.barId).toBe('right')
  })
})

describe('Icon Layout Store - reorderIcon Action (TEST-001)', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useIconLayoutStore())
    act(() => {
      result.current.resetToDefaults()
    })
    localStorage.clear()
  })

  it('should reorder icon within same bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Top bar: [terminal(0), preview(1), changes(2)]
    // Move terminal from 0 to 2
    act(() => {
      result.current.reorderIcon('terminal', 'top', 2)
    })

    const topBarIcons = result.current.getBarIcons('top')

    // Result: [preview(0), changes(1), terminal(2)]
    expect(topBarIcons[0].iconId).toBe('preview')
    expect(topBarIcons[1].iconId).toBe('changes')
    expect(topBarIcons[2].iconId).toBe('terminal')
  })

  it('should reorder icon forward (from position 0 to 1)', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Top bar: [terminal(0), preview(1), changes(2)]
    act(() => {
      result.current.reorderIcon('terminal', 'top', 1)
    })

    const topBarIcons = result.current.getBarIcons('top')

    // Result: [preview(0), terminal(1), changes(2)]
    expect(topBarIcons[0].iconId).toBe('preview')
    expect(topBarIcons[1].iconId).toBe('terminal')
    expect(topBarIcons[2].iconId).toBe('changes')
  })

  it('should reorder icon backward (from position 2 to 0)', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Top bar: [terminal(0), preview(1), changes(2)]
    act(() => {
      result.current.reorderIcon('changes', 'top', 0)
    })

    const topBarIcons = result.current.getBarIcons('top')

    // Result: [changes(0), terminal(1), preview(2)]
    expect(topBarIcons[0].iconId).toBe('changes')
    expect(topBarIcons[1].iconId).toBe('terminal')
    expect(topBarIcons[2].iconId).toBe('preview')
  })

  it('should correctly reindex all positions after reorder', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.reorderIcon('preview', 'top', 0)
    })

    const topBarIcons = result.current.getBarIcons('top')

    topBarIcons.forEach((icon, index) => {
      expect(icon.position).toBe(index)
    })
  })

  it('should not change order if new position equals current position', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const beforeIcons = result.current.getBarIcons('top')

    act(() => {
      result.current.reorderIcon('terminal', 'top', 0) // Already at position 0
    })

    const afterIcons = result.current.getBarIcons('top')

    expect(afterIcons).toEqual(beforeIcons)
  })

  it('should update lastModified timestamp after reorder', async () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const beforeTimestamp = result.current.config.lastModified

    await new Promise(resolve => setTimeout(resolve, 10))

    act(() => {
      result.current.reorderIcon('terminal', 'top', 1)
    })

    const afterTimestamp = result.current.config.lastModified
    expect(afterTimestamp).not.toBe(beforeTimestamp)
  })

  it('should not reorder if bar does not exist', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const consoleSpy = vi.spyOn(console, 'warn')

    act(() => {
      result.current.reorderIcon('terminal', 'non-existent-bar', 0)
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Bar non-existent-bar not found')
    )
  })

  it('should not reorder if icon not in specified bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const consoleSpy = vi.spyOn(console, 'warn')

    act(() => {
      result.current.reorderIcon('settings', 'top', 0) // settings is in right bar, not top
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Icon settings not found in bar top')
    )
  })
})

describe('Icon Layout Store - resetToDefaults Action (TEST-001)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should reset config to default layout', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Make some changes
    act(() => {
      result.current.moveIcon('terminal', 'right', 0)
      result.current.reorderIcon('settings', 'right', 2)
    })

    // Reset to defaults
    act(() => {
      result.current.resetToDefaults()
    })

    const defaultLayout = getDefaultIconLayout()

    expect(result.current.config.bars.top.map(ic => ic.iconId)).toEqual(
      defaultLayout.bars.top.map(ic => ic.iconId)
    )
    expect(result.current.config.bars.right.map(ic => ic.iconId)).toEqual(
      defaultLayout.bars.right.map(ic => ic.iconId)
    )
  })

  it('should update lastModified timestamp on reset', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.resetToDefaults()
    })

    expect(result.current.config.lastModified).toBeDefined()
    expect(new Date(result.current.config.lastModified).getTime()).toBeLessThanOrEqual(
      Date.now()
    )
  })

  it('should restore version number', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.resetToDefaults()
    })

    expect(result.current.config.version).toBe(1)
  })
})

describe('Icon Layout Store - getIconLocation Selector (TEST-001)', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useIconLayoutStore())
    act(() => {
      result.current.resetToDefaults()
    })
  })

  it('should return correct location for icon in top bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const location = result.current.getIconLocation('terminal')

    expect(location).toEqual({ barId: 'top', position: 0 })
  })

  it('should return correct location for icon in right bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const location = result.current.getIconLocation('settings')

    expect(location).toEqual({ barId: 'right', position: 0 })
  })

  it('should return null for non-existent icon', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const location = result.current.getIconLocation('non-existent-icon')

    expect(location).toBeNull()
  })

  it('should return updated location after icon is moved', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.moveIcon('terminal', 'right', 1)
    })

    const location = result.current.getIconLocation('terminal')

    expect(location).toEqual({ barId: 'right', position: 1 })
  })

  it('should return updated location after icon is reordered', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.reorderIcon('terminal', 'top', 2)
    })

    const location = result.current.getIconLocation('terminal')

    expect(location).toEqual({ barId: 'top', position: 2 })
  })
})

describe('Icon Layout Store - getBarIcons Selector (TEST-001)', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useIconLayoutStore())
    act(() => {
      result.current.resetToDefaults()
    })
  })

  it('should return all icons for top bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const topBarIcons = result.current.getBarIcons('top')

    expect(topBarIcons).toHaveLength(3)
    expect(topBarIcons.map(ic => ic.iconId)).toEqual(['terminal', 'preview', 'changes'])
  })

  it('should return all icons for right bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const rightBarIcons = result.current.getBarIcons('right')

    expect(rightBarIcons).toHaveLength(3)
    expect(rightBarIcons.map(ic => ic.iconId)).toEqual(['settings', 'inbox', 'automations'])
  })

  it('should return empty array for non-existent bar', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const icons = result.current.getBarIcons('non-existent-bar')

    expect(icons).toEqual([])
  })

  it('should return updated icons after move operation', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.moveIcon('terminal', 'right', 0)
    })

    const rightBarIcons = result.current.getBarIcons('right')

    expect(rightBarIcons).toHaveLength(4)
    expect(rightBarIcons[0].iconId).toBe('terminal')
  })

  it('should return icons in correct order (sorted by position)', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const topBarIcons = result.current.getBarIcons('top')

    topBarIcons.forEach((icon, index) => {
      expect(icon.position).toBe(index)
    })
  })
})

describe('Icon Layout Store - reconcileWithRegistry Action (TEST-003)', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useIconLayoutStore())
    act(() => {
      result.current.resetToDefaults()
    })
    localStorage.clear()
  })

  it('should remove invalid bars from config', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Manually add invalid bar to config
    act(() => {
      result.current.config.bars['invalid-bar'] = [
        { iconId: 'terminal', barId: 'invalid-bar', position: 0 },
      ]
    })

    // Reconcile with current registries (top and right only)
    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: [] },
          { id: 'right', label: 'Right Bar', orientation: 'vertical', placement: 'right', drawerSide: 'right', defaultIcons: [] },
        ],
        []
      )
    })

    expect(result.current.config.bars['invalid-bar']).toBeUndefined()
  })

  it('should remove invalid icons from bars', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Reconcile with limited icon registry (only terminal and settings)
    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: ['terminal'] },
          { id: 'right', label: 'Right Bar', orientation: 'vertical', placement: 'right', drawerSide: 'right', defaultIcons: ['settings'] },
        ],
        [
          { id: 'terminal', label: 'Terminal', icon: () => null, page: () => null },
          { id: 'settings', label: 'Settings', icon: () => null, page: () => null },
        ]
      )
    })

    const topBarIcons = result.current.getBarIcons('top')
    const rightBarIcons = result.current.getBarIcons('right')

    // Should only have valid icons
    expect(topBarIcons.every(ic => ['terminal'].includes(ic.iconId))).toBe(true)
    expect(rightBarIcons.every(ic => ['settings'].includes(ic.iconId))).toBe(true)
  })

  it('should add new bars with default icons', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Start with empty config
    act(() => {
      result.current.config.bars = {}
    })

    // Reconcile with registries
    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: ['terminal'] },
          { id: 'bottom', label: 'Bottom Bar', orientation: 'horizontal', placement: 'bottom', drawerSide: 'right', defaultIcons: ['settings'] },
        ],
        [
          { id: 'terminal', label: 'Terminal', icon: () => null, page: () => null },
          { id: 'settings', label: 'Settings', icon: () => null, page: () => null },
        ]
      )
    })

    expect(result.current.config.bars.top).toBeDefined()
    expect(result.current.config.bars.bottom).toBeDefined()
    expect(result.current.config.bars.top[0].iconId).toBe('terminal')
    expect(result.current.config.bars.bottom[0].iconId).toBe('settings')
  })

  it('should add new icons to their default bars', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    // Start with config that only has terminal
    act(() => {
      result.current.config.bars = {
        top: [{ iconId: 'terminal', barId: 'top', position: 0 }],
      }
    })

    // Reconcile with expanded icon registry
    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: ['terminal', 'preview'] },
        ],
        [
          { id: 'terminal', label: 'Terminal', icon: () => null, page: () => null },
          { id: 'preview', label: 'Preview', icon: () => null, page: () => null },
        ]
      )
    })

    const topBarIcons = result.current.getBarIcons('top')

    expect(topBarIcons).toHaveLength(2)
    expect(topBarIcons.some(ic => ic.iconId === 'preview')).toBe(true)
  })

  it('should respect allowedBars restrictions when adding new icons', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.config.bars = {
        top: [],
        right: [],
      }
    })

    // Reconcile with icon that's only allowed in right bar
    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: ['restricted-icon'] },
          { id: 'right', label: 'Right Bar', orientation: 'vertical', placement: 'right', drawerSide: 'right', defaultIcons: [] },
        ],
        [
          { id: 'restricted-icon', label: 'Restricted', icon: () => null, page: () => null, allowedBars: ['right'] },
        ]
      )
    })

    const topBarIcons = result.current.getBarIcons('top')
    const rightBarIcons = result.current.getBarIcons('right')

    // Icon should be in right bar, not top (even though top is default)
    expect(topBarIcons.find(ic => ic.iconId === 'restricted-icon')).toBeUndefined()
    expect(rightBarIcons.find(ic => ic.iconId === 'restricted-icon')).toBeDefined()
  })

  it('should reindex positions after reconciliation', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.config.bars = {
        top: [
          { iconId: 'a', barId: 'top', position: 5 },
          { iconId: 'b', barId: 'top', position: 10 },
        ],
      }
    })

    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: [] },
        ],
        [
          { id: 'a', label: 'A', icon: () => null, page: () => null },
          { id: 'b', label: 'B', icon: () => null, page: () => null },
        ]
      )
    })

    const topBarIcons = result.current.getBarIcons('top')

    expect(topBarIcons[0].position).toBe(0)
    expect(topBarIcons[1].position).toBe(1)
  })

  it('should update lastModified timestamp after reconciliation', async () => {
    const { result } = renderHook(() => useIconLayoutStore())

    const beforeTimestamp = result.current.config.lastModified

    await new Promise(resolve => setTimeout(resolve, 10))

    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: [] },
        ],
        []
      )
    })

    const afterTimestamp = result.current.config.lastModified
    expect(afterTimestamp).not.toBe(beforeTimestamp)
  })

  it('should handle empty bar registry', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.reconcileWithRegistry([], [])
    })

    // All bars should be removed
    expect(Object.keys(result.current.config.bars)).toHaveLength(0)
  })

  it('should handle empty icon registry', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: [] },
        ],
        []
      )
    })

    // Bar should exist but be empty
    expect(result.current.config.bars.top).toEqual([])
  })

  it('should not duplicate icons that already exist in config', () => {
    const { result } = renderHook(() => useIconLayoutStore())

    act(() => {
      result.current.config.bars = {
        top: [{ iconId: 'terminal', barId: 'top', position: 0 }],
      }
    })

    act(() => {
      result.current.reconcileWithRegistry(
        [
          { id: 'top', label: 'Top Bar', orientation: 'horizontal', placement: 'top', drawerSide: 'right', defaultIcons: ['terminal'] },
        ],
        [
          { id: 'terminal', label: 'Terminal', icon: () => null, page: () => null },
        ]
      )
    })

    const topBarIcons = result.current.getBarIcons('top')

    // Should still only have one terminal icon
    expect(topBarIcons).toHaveLength(1)
    expect(topBarIcons[0].iconId).toBe('terminal')
  })
})
