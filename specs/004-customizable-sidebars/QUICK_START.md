# Quick Start Guide - Phase 6
## Customizable Icon Bar System

**TL;DR**: Phase 6 is complete. The new icon bar system runs alongside the old system via feature flag.

---

## 🚀 Try It Now

### 1. Build & Run

```bash
cd /Users/caronex/.21st/worktrees/ii-client/miniature-inlet
bun run dev
```

### 2. Enable Feature Flag

**Option A: Via Console**
```javascript
localStorage.setItem('preferences:use-new-icon-bar-system', 'true')
location.reload()
```

**Option B: Via Settings** (future)
- Settings → Beta → "Use New Icon Bar System" toggle

### 3. See It Work

You should now see:
- **Top Bar**: Horizontal icons (Terminal, Preview, Changes)
- **Right Bar**: Vertical icons (Settings, Inbox, Automations)

Click any icon to open its drawer!

---

## 🧪 Quick Tests

### Test 1: Drawers (30 seconds)
```
1. Click Terminal icon → Drawer opens
2. Click Terminal again → Drawer closes
3. Click Settings → Second drawer opens
4. Both drawers are visible ✅
```

### Test 2: Drag-Drop (30 seconds)
```
1. Drag Terminal icon to different position
2. Drop it → Icon moves ✅
3. Drag Settings from right bar to top bar
4. Drop it → Icon moves to new bar ✅
```

### Test 3: Persistence (1 minute)
```
1. Customize layout (move icons around)
2. Close app
3. Reopen app
4. Layout is restored ✅
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `src/renderer/lib/atoms/index.ts` | Feature flag atom |
| `src/renderer/features/layout/agents-layout.tsx` | Conditional rendering |
| `src/renderer/features/layout/components/CustomizableLayout.tsx` | Main layout component |
| `src/renderer/features/layout/utils/icon-bar-registry.ts` | Bar definitions |
| `src/renderer/features/layout/constants/icon-registry.ts` | Icon definitions |

---

## 🔄 Toggle Back to Old System

```javascript
localStorage.setItem('preferences:use-new-icon-bar-system', 'false')
location.reload()
```

---

## 📋 Tasks Completed

- [X] MIG2-001: Feature flag atom
- [X] MIG2-002: Conditional rendering
- [X] MIG2-003: Wire up registries
- [X] MIG2-004: Drawer animations (ready to test)
- [X] MIG2-005: Icon drag-drop (ready to test)
- [X] MIG2-006: Config persistence (ready to test)
- [X] MIG2-007: Old vs new comparison (ready to test)

---

## 📚 Full Documentation

- **Testing Guide**: `PHASE6_TESTING.md` (detailed test procedures)
- **Summary**: `PHASE6_SUMMARY.md` (technical details)
- **This File**: `QUICK_START.md` (quick reference)

---

## 🐛 Issues?

1. Check console for errors
2. Verify feature flag: `localStorage.getItem('preferences:use-new-icon-bar-system')`
3. Review `PHASE6_TESTING.md` debugging section
4. File issue with reproduction steps

---

## ⏭️ Next Phase

**Phase 7**: Navigation Migration
- Remove hardcoded navigation
- Bridge old and new systems
- Migrate all navigation to icon bars

**ETA**: 3-4 hours

---

**Status**: ✅ Phase 6 Complete | **Date**: 2026-02-03 | **Branch**: `004-customizable-sidebars`
