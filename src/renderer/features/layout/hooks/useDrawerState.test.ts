/**
 * Unit Tests: Drawer State Hooks
 * Feature: 004-customizable-sidebars
 * Task: TEST-004
 *
 * Tests for drawer state hooks:
 * - useDrawerState: open, close, toggle operations
 * - Workspace and bar isolation
 * - Page switching behavior
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDrawerState } from './useDrawerState'

describe('useDrawerState Hook (TEST-004)', () => {
  describe('Initial State', () => {
    it('should start with drawer closed', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIconId).toBeNull()
    })

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      expect(result.current.openDrawer).toBeInstanceOf(Function)
      expect(result.current.closeDrawer).toBeInstanceOf(Function)
      expect(result.current.toggleDrawer).toBeInstanceOf(Function)
    })
  })

  describe('openDrawer Method', () => {
    it('should open drawer with specified icon', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('settings')
    })

    it('should switch to different icon when drawer is already open', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('settings')
      })

      expect(result.current.activeIconId).toBe('settings')

      act(() => {
        result.current.openDrawer('terminal')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('terminal')
    })

    it('should handle opening same icon multiple times', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('settings')
        result.current.openDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('settings')
    })
  })

  describe('closeDrawer Method', () => {
    it('should close drawer and clear active icon', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)

      act(() => {
        result.current.closeDrawer()
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIconId).toBeNull()
    })

    it('should handle closing already-closed drawer', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.closeDrawer()
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIconId).toBeNull()
    })

    it('should close drawer multiple times without error', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('settings')
        result.current.closeDrawer()
        result.current.closeDrawer()
      })

      expect(result.current.isOpen).toBe(false)
    })
  })

  describe('toggleDrawer Method', () => {
    it('should open drawer when closed', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.toggleDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('settings')
    })

    it('should close drawer when same icon is clicked again', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.toggleDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)

      act(() => {
        result.current.toggleDrawer('settings')
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIconId).toBeNull()
    })

    it('should switch page when different icon is clicked', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.toggleDrawer('settings')
      })

      expect(result.current.activeIconId).toBe('settings')

      act(() => {
        result.current.toggleDrawer('terminal')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('terminal')
    })

    it('should handle rapid toggles correctly', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.toggleDrawer('settings')
        result.current.toggleDrawer('settings')
        result.current.toggleDrawer('settings')
      })

      // Odd number of toggles = open
      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('settings')
    })

    it('should handle toggle sequence: open → switch → close', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      // Open with settings
      act(() => {
        result.current.toggleDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('settings')

      // Switch to terminal
      act(() => {
        result.current.toggleDrawer('terminal')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('terminal')

      // Close by toggling terminal again
      act(() => {
        result.current.toggleDrawer('terminal')
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIconId).toBeNull()
    })
  })

  describe('Workspace Isolation', () => {
    it('should maintain separate state for different workspaces', () => {
      const { result: mainResult } = renderHook(() => useDrawerState('main', 'top'))
      const { result: altResult } = renderHook(() => useDrawerState('alt', 'top'))

      act(() => {
        mainResult.current.openDrawer('settings')
      })

      expect(mainResult.current.isOpen).toBe(true)
      expect(mainResult.current.activeIconId).toBe('settings')

      // Alt workspace should remain independent
      expect(altResult.current.isOpen).toBe(false)
      expect(altResult.current.activeIconId).toBeNull()
    })

    it('should allow different workspaces to have different active icons', () => {
      const { result: mainResult } = renderHook(() => useDrawerState('main', 'top'))
      const { result: altResult } = renderHook(() => useDrawerState('alt', 'top'))

      act(() => {
        mainResult.current.openDrawer('settings')
        altResult.current.openDrawer('terminal')
      })

      expect(mainResult.current.activeIconId).toBe('settings')
      expect(altResult.current.activeIconId).toBe('terminal')
    })
  })

  describe('Bar Isolation', () => {
    it('should maintain separate state for different bars in same workspace', () => {
      const { result: topResult } = renderHook(() => useDrawerState('main', 'top'))
      const { result: rightResult } = renderHook(() => useDrawerState('main', 'right'))

      act(() => {
        topResult.current.openDrawer('terminal')
      })

      expect(topResult.current.isOpen).toBe(true)
      expect(topResult.current.activeIconId).toBe('terminal')

      // Right bar should remain independent
      expect(rightResult.current.isOpen).toBe(false)
      expect(rightResult.current.activeIconId).toBeNull()
    })

    it('should allow both drawers to be open simultaneously', () => {
      const { result: topResult } = renderHook(() => useDrawerState('main', 'top'))
      const { result: rightResult } = renderHook(() => useDrawerState('main', 'right'))

      act(() => {
        topResult.current.openDrawer('terminal')
        rightResult.current.openDrawer('settings')
      })

      expect(topResult.current.isOpen).toBe(true)
      expect(topResult.current.activeIconId).toBe('terminal')
      expect(rightResult.current.isOpen).toBe(true)
      expect(rightResult.current.activeIconId).toBe('settings')
    })

    it('should not affect other bars when closing one drawer', () => {
      const { result: topResult } = renderHook(() => useDrawerState('main', 'top'))
      const { result: rightResult } = renderHook(() => useDrawerState('main', 'right'))

      act(() => {
        topResult.current.openDrawer('terminal')
        rightResult.current.openDrawer('settings')
      })

      act(() => {
        topResult.current.closeDrawer()
      })

      expect(topResult.current.isOpen).toBe(false)
      // Right bar should still be open
      expect(rightResult.current.isOpen).toBe(true)
      expect(rightResult.current.activeIconId).toBe('settings')
    })
  })

  describe('Method Stability', () => {
    it('should maintain stable function references across renders', () => {
      const { result, rerender } = renderHook(() => useDrawerState('main', 'top'))

      const initialOpenDrawer = result.current.openDrawer
      const initialCloseDrawer = result.current.closeDrawer
      const initialToggleDrawer = result.current.toggleDrawer

      rerender()

      expect(result.current.openDrawer).toBe(initialOpenDrawer)
      expect(result.current.closeDrawer).toBe(initialCloseDrawer)
      expect(result.current.toggleDrawer).toBe(initialToggleDrawer)
    })

    it('should maintain stable function references after state changes', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      const initialOpenDrawer = result.current.openDrawer

      act(() => {
        result.current.openDrawer('settings')
      })

      expect(result.current.openDrawer).toBe(initialOpenDrawer)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string as iconId', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe('')
    })

    it('should handle very long iconId strings', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      const longIconId = 'a'.repeat(1000)

      act(() => {
        result.current.openDrawer(longIconId)
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).toBe(longIconId)
    })

    it('should handle special characters in iconId', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      const specialIconId = 'icon-with-special_chars.123!@#$%'

      act(() => {
        result.current.openDrawer(specialIconId)
      })

      expect(result.current.activeIconId).toBe(specialIconId)
    })

    it('should handle empty string workspaceId and barId', () => {
      const { result } = renderHook(() => useDrawerState('', ''))

      act(() => {
        result.current.openDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)
    })
  })

  describe('State Consistency', () => {
    it('should always have activeIconId when drawer is open', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('settings')
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIconId).not.toBeNull()
    })

    it('should always have null activeIconId when drawer is closed', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('settings')
        result.current.closeDrawer()
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIconId).toBeNull()
    })

    it('should maintain consistent state after multiple operations', () => {
      const { result } = renderHook(() => useDrawerState('main', 'top'))

      act(() => {
        result.current.openDrawer('a')
        result.current.toggleDrawer('b')
        result.current.toggleDrawer('b')
        result.current.toggleDrawer('c')
        result.current.closeDrawer()
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIconId).toBeNull()
    })
  })
})
