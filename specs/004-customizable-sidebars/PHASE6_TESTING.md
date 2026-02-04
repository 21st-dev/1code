# Phase 6 Testing Instructions
## Customizable Icon Bar System - Parallel Implementation

**Feature**: 004-customizable-sidebars
**Phase**: 6 (Migration Phase 2)
**Status**: ✅ Implementation Complete - Ready for Testing
**Date**: 2026-02-03

---

## Overview

Phase 6 implements a **parallel system architecture** where the new customizable icon bar system runs alongside the legacy navigation system, controlled by a feature flag. This allows safe testing and gradual rollout without breaking existing functionality.

### What Was Implemented

✅ **MIG2-001**: Feature flag atom `useNewIconBarSystemAtom` created in `/src/renderer/lib/atoms/index.ts`
✅ **MIG2-002**: Conditional rendering added to `/src/renderer/features/layout/agents-layout.tsx`
✅ **MIG2-003**: `CustomizableLayout` wired up with `ICON_BAR_REGISTRY` and `ICON_REGISTRY`

### What Needs Testing

The following tasks require manual testing:

- **MIG2-004**: Test drawer animations with feature flag enabled
- **MIG2-005**: Test icon drag-drop with feature flag enabled
- **MIG2-006**: Test config persistence with feature flag enabled
- **MIG2-007**: Compare old vs new system behavior side-by-side

---

## Prerequisites

1. **Build the application**:
   ```bash
   cd /Users/caronex/.21st/worktrees/ii-client/miniature-inlet
   bun run build
   ```

2. **Start the development server**:
   ```bash
   bun run dev
   ```

3. **Access the feature flag**:
   - Open Developer Tools (Help → Toggle Developer Tools)
   - Navigate to Settings → Beta tab
   - Look for "Use New Icon Bar System" toggle
   - Or manually set in localStorage:
     ```javascript
     localStorage.setItem('preferences:use-new-icon-bar-system', 'true')
     ```

---

## Testing Procedure

### Test 1: MIG2-004 - Drawer Animations

**Objective**: Verify drawer open/close animations work correctly with the new system.

**Steps**:

1. **Enable Feature Flag**:
   - Set `useNewIconBarSystem` to `true` in Settings → Beta
   - Refresh the application

2. **Test Top Bar Drawers**:
   - Click Terminal icon in top bar
   - ✅ Drawer should slide in from right side smoothly
   - ✅ Drawer should display Terminal content
   - Click Terminal icon again
   - ✅ Drawer should slide out smoothly
   - ✅ Animation duration should be ~200ms

3. **Test Right Bar Drawers**:
   - Click Settings icon in right bar
   - ✅ Drawer should slide in from right side smoothly
   - ✅ Drawer should display Settings content
   - Click Settings icon again
   - ✅ Drawer should slide out smoothly

4. **Test Multiple Drawers**:
   - Click Terminal (top bar)
   - Click Settings (right bar)
   - ✅ Both drawers should be visible simultaneously
   - ✅ Both drawers should animate independently
   - ✅ No z-index conflicts or overlap issues

5. **Test Page Switching Within Drawer**:
   - Open Terminal drawer
   - Click Preview icon (same top bar)
   - ✅ Drawer should stay open
   - ✅ Content should switch from Terminal to Preview
   - ✅ No flickering or layout shift

**Expected Results**:
- Smooth animations with no jank
- Hardware-accelerated transitions (check in Performance tab)
- Consistent animation duration across all drawers
- No visual glitches during open/close

---

### Test 2: MIG2-005 - Icon Drag-Drop

**Objective**: Verify icon drag-and-drop functionality works correctly.

**Steps**:

1. **Enable Feature Flag** (if not already enabled)

2. **Test Same-Bar Reordering**:
   - Drag Terminal icon within top bar
   - Drop it at a different position
   - ✅ Icon should move to new position
   - ✅ Other icons should reorder smoothly
   - ✅ Animation should be smooth (no jumps)

3. **Test Cross-Bar Movement**:
   - Drag Settings icon from right bar
   - Drop it on top bar (between existing icons)
   - ✅ Icon should move to top bar
   - ✅ Right bar should update immediately
   - ✅ Icon should appear in correct position on top bar

4. **Test Drag Preview**:
   - Start dragging any icon
   - ✅ DragOverlay should show icon preview
   - ✅ Preview should follow cursor
   - ✅ Preview should have shadow and styling
   - ✅ Cursor should change to `grabbing`

5. **Test Invalid Drop Targets** (if configured):
   - If any icons have `allowedBars` restrictions
   - Drag to restricted bar
   - ✅ Visual feedback should indicate invalid drop (red border)
   - ✅ Icon should snap back to original position on release

6. **Test Keyboard Accessibility**:
   - Focus an icon with Tab key
   - Press Space to grab
   - Use Arrow keys to move
   - Press Space to drop
   - ✅ Keyboard navigation should work
   - ✅ Screen reader should announce actions

**Expected Results**:
- Smooth drag-and-drop with no lag
- Visual feedback during drag (opacity, cursor)
- Correct collision detection (pointerWithin)
- Proper validation of drop targets
- Keyboard accessibility works

---

### Test 3: MIG2-006 - Config Persistence

**Objective**: Verify icon configuration persists across app restarts.

**Steps**:

1. **Enable Feature Flag** (if not already enabled)

2. **Customize Icon Layout**:
   - Move Terminal from top bar to right bar
   - Reorder icons within top bar
   - Open Settings drawer
   - Resize Settings drawer to 500px width

3. **Check localStorage**:
   - Open Developer Tools → Application → Local Storage
   - Find key: `icon-layout-config`
   - ✅ Should contain JSON with current layout
   - ✅ Should include `bars` object with icon positions
   - ✅ Version should be `1`

4. **Restart Application**:
   - Close and reopen the app
   - Or press Cmd+R to reload

5. **Verify Restoration**:
   - ✅ Icon positions should match pre-restart state
   - ✅ Terminal should still be in right bar
   - ✅ Icon order should be preserved
   - ✅ Drawer widths should be restored

6. **Test Migration/Reconciliation**:
   - Manually edit localStorage to remove an icon
   - Reload application
   - ✅ Missing icon should be restored to default position
   - ✅ No errors in console

7. **Test Corrupted Config**:
   - Set `icon-layout-config` to invalid JSON: `{broken}`
   - Reload application
   - ✅ Should fall back to default layout
   - ✅ Console should log validation error
   - ✅ App should still function normally

**Expected Results**:
- Configuration persists across sessions
- Zustand middleware correctly saves to localStorage
- Validation prevents corrupted data from breaking app
- Reconciliation handles added/removed icons gracefully

---

### Test 4: MIG2-007 - Old vs New System Comparison

**Objective**: Verify both systems work correctly and switching between them is seamless.

**Steps**:

1. **Test Old System (Baseline)**:
   - Disable feature flag: `useNewIconBarSystem = false`
   - Reload application
   - ✅ Legacy navigation should work (no icon bars visible)
   - ✅ Settings button in sidebar should open Settings
   - ✅ Terminal button should work
   - ✅ All existing functionality intact

2. **Enable New System**:
   - Enable feature flag: `useNewIconBarSystem = true`
   - Reload application
   - ✅ Icon bars should appear (top and right)
   - ✅ Default layout should load
   - ✅ All icons should be visible

3. **Test Feature Parity**:
   Compare identical operations in both systems:

   | Operation | Old System | New System | Match? |
   |-----------|------------|------------|--------|
   | Open Settings | ✅ | ✅ | ✅ |
   | Open Terminal | ✅ | ✅ | ✅ |
   | Open Preview | ✅ | ✅ | ✅ |
   | Open Changes | ✅ | ✅ | ✅ |
   | Resize drawer | ✅ | ✅ | ✅ |
   | Close drawer | ✅ | ✅ | ✅ |

4. **Toggle Multiple Times**:
   - Toggle flag: `false → true → false → true`
   - Reload after each toggle
   - ✅ No errors in console
   - ✅ No memory leaks (check Performance → Memory)
   - ✅ Smooth transition each time

5. **Check for Conflicts**:
   - Enable new system
   - Check if old navigation buttons still exist
   - ✅ No duplicate buttons
   - ✅ No conflicting keyboard shortcuts
   - ✅ No z-index issues

6. **Performance Comparison**:
   - Measure initial render time (Performance tab)
   - Old system: ~X ms
   - New system: ~Y ms
   - ✅ New system should be within 20% of old system

**Expected Results**:
- Both systems function independently
- No conflicts or regressions
- Seamless switching via feature flag
- Similar or better performance

---

## Known Issues / Edge Cases

### Current Limitations

1. **Icon Registry Pages**:
   - Some pages may not exist yet (check lazy imports)
   - Terminal, Preview, Changes should work
   - Settings, Automations, Inbox may need verification

2. **Drawer Width Atoms**:
   - Top drawer uses `drawerWidthAtomFamily('top')`
   - Right drawer uses `drawerWidthAtomFamily('right')`
   - Different from legacy atoms (`agentsPreviewSidebarWidthAtom`, etc.)

3. **Workspace Isolation**:
   - Currently using single workspace: `"main"`
   - Multi-workspace support planned for future phase

### Expected Edge Cases

1. **Empty Icon Bar**:
   - If all icons moved to other bar
   - ✅ Bar should remain visible but empty
   - ✅ Should still accept dropped icons

2. **Simultaneous Drawers**:
   - Both top and right drawers open at same time
   - ✅ Should not overlap
   - ✅ Content area should adjust correctly

3. **Rapid Icon Clicks**:
   - Click multiple icons quickly
   - ✅ Drawer state should update correctly
   - ✅ No race conditions

---

## Debugging Tips

### Enable Debug Logging

Add this to browser console:
```javascript
localStorage.setItem('debug', 'icon-layout:*')
```

Check console for logs from:
- `[CustomizableLayout]` - Drag-drop events
- `[IconLayoutStore]` - State changes
- `[DrawerState]` - Open/close events

### Common Issues

**Issue**: Icons not draggable
**Fix**: Check that `@dnd-kit/core` sensors are configured correctly

**Issue**: Drawer animation stutters
**Fix**: Check if `will-change: transform` is applied to drawer container

**Issue**: Config not persisting
**Fix**: Check Zustand persist middleware is initialized

**Issue**: Icons disappear after reload
**Fix**: Check reconciliation logic in `icon-layout-store.ts`

---

## Success Criteria

Phase 6 is considered **COMPLETE** when:

✅ All drawer animations are smooth (60fps)
✅ Icon drag-drop works without errors
✅ Configuration persists across app restarts
✅ Old and new systems coexist without conflicts
✅ Feature flag toggle works seamlessly
✅ No regressions in existing functionality
✅ Console is free of errors/warnings

---

## Next Steps (Phase 7)

Once Phase 6 testing is complete:

1. **Phase 7**: Navigation Migration
   - Remove hardcoded navigation buttons
   - Bridge `desktopViewAtom` to drawer state
   - Migrate all navigation to icon bars

2. **Phase 8**: Deprecate Old System
   - Remove `desktopViewAtom`
   - Remove feature flag
   - Make `CustomizableLayout` the only layout

3. **Phase 9**: User Data Migration
   - Migrate existing sidebar widths
   - Initialize default layout for new users

---

## Testing Checklist

Use this checklist to track testing progress:

- [ ] MIG2-004: Drawer animations tested
  - [ ] Top bar drawers animate correctly
  - [ ] Right bar drawers animate correctly
  - [ ] Multiple drawers work simultaneously
  - [ ] Page switching within drawer works

- [ ] MIG2-005: Icon drag-drop tested
  - [ ] Same-bar reordering works
  - [ ] Cross-bar movement works
  - [ ] Drag preview displays correctly
  - [ ] Invalid drop targets handled
  - [ ] Keyboard accessibility works

- [ ] MIG2-006: Config persistence tested
  - [ ] Layout persists across restarts
  - [ ] localStorage correctly stores config
  - [ ] Corrupted config falls back to default
  - [ ] Reconciliation handles missing icons

- [ ] MIG2-007: Old vs new comparison done
  - [ ] Old system still works (flag off)
  - [ ] New system works (flag on)
  - [ ] Feature parity verified
  - [ ] No conflicts between systems
  - [ ] Performance is acceptable

---

## Contact

If you encounter issues during testing:

1. Check console for error messages
2. Verify feature flag is set correctly
3. Review implementation in:
   - `/src/renderer/lib/atoms/index.ts`
   - `/src/renderer/features/layout/agents-layout.tsx`
   - `/src/renderer/features/layout/components/CustomizableLayout.tsx`
4. File issue with reproduction steps

---

**Document Version**: 1.0
**Last Updated**: 2026-02-03
**Author**: Claude Code (Sonnet 4.5)
