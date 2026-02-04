# Phase 7 Testing Guide: Navigation Migration (MIG3-001 through MIG3-005)

**Feature**: 004-customizable-sidebars
**Date**: 2026-02-03
**Status**: Implementation Complete - Ready for Testing

## Summary

Phase 7 replaces hardcoded navigation buttons (Settings, Automations, Inbox) with the new icon bar system. The navigation icons now appear in the right icon bar and can be opened via drawers instead of full-screen views.

## Changes Made

### MIG3-001: Remove hardcoded navigation buttons
- ✅ Hid `InboxButton` and `AutomationsButton` components when feature flag is enabled
- ✅ Hid `SettingsIcon` button in sidebar footer when feature flag is enabled
- ✅ Components remain functional in legacy mode (flag disabled)

### MIG3-002: Bridge desktopViewAtom to drawer state
- ✅ Created bidirectional sync in `CustomizableLayout`:
  - When `desktopView` changes → opens corresponding drawer with icon
  - When drawer closes → clears `desktopView`
- ✅ Mapping:
  - `desktopView: "settings"` → right bar, settings icon
  - `desktopView: "automations"` → right bar, automations icon
  - `desktopView: "automations-detail"` → right bar, automations icon
  - `desktopView: "inbox"` → right bar, inbox icon
  - `desktopView: null` → closes navigation drawers

### MIG3-003: Update click handlers
- ✅ Icon bars use `useDrawerState` hook with drawer atoms
- ✅ Bridge syncs drawer state with `desktopViewAtom` automatically
- ✅ Legacy code using `setDesktopView` continues to work via bridge

## Testing Instructions

### Prerequisites

1. Enable the feature flag in Settings → Beta → "Enable new icon bar system"
   OR set `localStorage.setItem("preferences:use-new-icon-bar-system", "true")` in DevTools
2. Restart the app after enabling the feature flag

### MIG3-004: Test all navigation paths

#### Test 1: Settings Navigation
1. Click the Settings icon in the right icon bar (gear icon)
2. **Expected**: Right drawer opens showing Settings content
3. Click Settings icon again
4. **Expected**: Drawer closes
5. Press `Cmd+,` (Settings hotkey)
6. **Expected**: Drawer opens with Settings content (tests backward compat)

#### Test 2: Automations Navigation
1. Enable Automations in Settings → Beta → "Enable Automations & Inbox"
2. Click the Automations icon in the right icon bar (lightning bolt icon)
3. **Expected**: Right drawer opens showing Automations content
4. Click Automations icon again
5. **Expected**: Drawer closes
6. Test legacy code paths that set `desktopView = "automations"`
7. **Expected**: Drawer opens (tests bridge sync)

#### Test 3: Inbox Navigation
1. Click the Inbox icon in the right icon bar (inbox icon)
2. **Expected**: Right drawer opens showing Inbox content
3. If there are unread messages, verify badge appears on icon
4. Click Inbox icon again
5. **Expected**: Drawer closes

#### Test 4: Multiple Icons in Same Bar
1. Click Settings icon (opens drawer)
2. Click Automations icon (without closing drawer first)
3. **Expected**: Drawer content switches to Automations (stays open)
4. Click Inbox icon
5. **Expected**: Drawer content switches to Inbox (stays open)
6. Click Inbox icon again
7. **Expected**: Drawer closes

#### Test 5: Independent Drawers (Top vs Right Bar)
1. Click Preview icon in top bar (opens top drawer)
2. Click Settings icon in right bar (opens right drawer)
3. **Expected**: Both drawers open simultaneously
4. Verify both drawers can be closed independently

#### Test 6: Terminal, Changes, Preview (Top Bar)
1. Open a workspace with a worktree
2. Click Terminal icon in top bar
3. **Expected**: Top drawer opens with terminal
4. Click Changes icon in top bar
5. **Expected**: Drawer content switches to Changes (git diff)
6. Click Preview icon in top bar (if available)
7. **Expected**: Drawer content switches to Preview

### MIG3-005: Verify drawer toggle behavior matches old navigation

#### Test 1: Hotkey Navigation
1. Press `Cmd+,` (Settings hotkey)
2. **Expected**: Right drawer opens with Settings
3. Press `Cmd+,` again
4. **Expected**: Drawer closes (same as old behavior where Settings dialog would close)

#### Test 2: Navigation from Chat
1. From active chat, trigger Settings via any legacy code path
2. **Expected**: Right drawer opens with Settings
3. Close drawer via X button
4. **Expected**: Returns to chat (same as old behavior)

#### Test 3: Settings Tab Navigation
1. Open Settings drawer
2. Navigate to different settings tabs (Appearance, Models, etc.)
3. **Expected**: Tab navigation works identically to old system
4. Close drawer
5. Reopen Settings
6. **Expected**: Same tab is selected (state persisted)

#### Test 4: Drawer Width Persistence
1. Open Settings drawer
2. Resize drawer to 500px wide
3. Close drawer
4. Open Automations drawer
5. **Expected**: Automations drawer uses same width (500px)
6. Restart app
7. Open any right bar drawer
8. **Expected**: Width persisted across restart

#### Test 5: Legacy Sidebar Navigation (Hidden)
1. Look for old Inbox/Automations buttons in sidebar
2. **Expected**: Buttons are hidden when feature flag is enabled
3. Look for Settings icon in sidebar footer
4. **Expected**: Settings icon is hidden when feature flag is enabled

## Known Issues / Expected Behavior

1. **Lazy Loading**: First time opening each drawer may have a slight delay as the page component loads
2. **Multiple Drawers**: Top and right drawers can be open simultaneously (this is by design)
3. **Width Sharing**: All drawers on the same side (e.g., both right drawers) share the same width preference

## Rollback Plan

If issues are found:
1. Disable feature flag: `localStorage.setItem("preferences:use-new-icon-bar-system", "false")`
2. Restart app
3. Old navigation buttons will reappear
4. Report issues in tasks.md

## Success Criteria

- [ ] All 6 navigation paths work (Settings, Automations, Inbox, Terminal, Changes, Preview)
- [ ] Drawer toggle behavior matches old navigation (open/close/switch)
- [ ] Hotkeys work correctly (Cmd+, for Settings)
- [ ] Backward compatibility maintained (desktopView sync)
- [ ] No console errors during navigation
- [ ] Width persistence works across restarts
- [ ] Independent drawers work (top + right simultaneously)

## Next Steps

After successful testing:
- Proceed to Phase 8 (MIG4): Deprecate old system
- Remove `desktopViewAtom` completely
- Remove ternary rendering in `agents-content.tsx`
- Make `CustomizableLayout` the only layout
