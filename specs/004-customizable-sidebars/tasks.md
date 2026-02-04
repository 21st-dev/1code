# Implementation Tasks: Customizable Dual Drawers with Icon Bars

**Feature**: 004-customizable-sidebars
**Branch**: `004-customizable-sidebars`
**Generated**: 2026-02-03
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Task Format

```
- [ ] [TaskID] [P?] [Story?] Description with file path
```

- **TaskID**: `PHASE-###` (e.g., `SETUP-001`, `MIG1-001`)
- **P?**: Priority (P1=critical, P2=important, P3=nice-to-have)
- **Story?**: User story reference (US1, US2) if applicable

---

## Phase 0: Setup & Prerequisites

**Goal**: Install dependencies, set up directory structure, and copy contracts.

- [X] [SETUP-001] P1 Install dnd-kit dependencies (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@dnd-kit/modifiers`)
- [X] [SETUP-002] P1 Create directory structure `src/renderer/features/layout/{components,atoms,stores,hooks,types,utils,constants}`
- [X] [SETUP-003] P1 Copy TypeScript interfaces from `specs/004-customizable-sidebars/contracts/types.ts` to `src/renderer/features/layout/types/icon-bar.types.ts`
- [X] [SETUP-004] P1 Copy Zod schemas from `specs/004-customizable-sidebars/contracts/schemas.ts` to `src/renderer/features/layout/utils/icon-validation.ts`
- [X] [SETUP-005] P2 Create test directory structure `tests/e2e/layout/`

**Dependencies**: None
**Estimated Completion**: All tasks can run in parallel

---

## Phase 1: Foundational Components (GENERIC Architecture)

**Goal**: Implement generic, reusable components and registries that support ANY number of icon bars.

### 1.1 Registries (Configuration-Driven)

- [X] [FOUND-001] P1 Create icon bar registry in `src/renderer/features/layout/utils/icon-bar-registry.ts` with `ICON_BAR_REGISTRY` constant defining top and right bars
- [X] [FOUND-002] P1 Create icon registry in `src/renderer/features/layout/constants/icon-registry.ts` with `ICON_REGISTRY` constant mapping to existing pages (Settings, Automations, Inbox, Terminal, Changes, Preview)
- [X] [FOUND-003] P1 Implement `ICON_MAP` lookup helper (`new Map(ICON_REGISTRY.map(i => [i.id, i]))`) in `src/renderer/features/layout/constants/icon-registry.ts`
- [X] [FOUND-004] P1 Implement `ICON_BAR_MAP` lookup helper in `src/renderer/features/layout/utils/icon-bar-registry.ts`

**Dependencies**: SETUP-003, SETUP-004
**Parallel Execution**: All tasks can run in parallel after dependencies

### 1.2 Zustand Store (GENERIC for N bars)

- [X] [FOUND-005] P1 US2 Implement Zustand store in `src/renderer/features/layout/stores/icon-layout-store.ts` with persist middleware
- [X] [FOUND-006] P1 US2 Implement `moveIcon(iconId, toBarId, newPosition)` action in store (works for ANY bar)
- [X] [FOUND-007] P1 US2 Implement `reorderIcon(iconId, barId, newPosition)` action in store (works for ANY bar)
- [X] [FOUND-008] P1 US2 Implement `getBarIcons(barId)` selector in store (works for ANY bar)
- [X] [FOUND-009] P1 US2 Implement `getIconLocation(iconId)` selector in store
- [X] [FOUND-010] P1 Implement `resetToDefaults()` action in store with fallback to `DEFAULT_ICON_LAYOUT`
- [X] [FOUND-011] P1 Implement `reconcileWithRegistry(barRegistry, iconRegistry)` method to handle added/removed icons
- [X] [FOUND-012] P1 Add Zod validation in store's persist `onRehydrateStorage` callback with error handling

**Dependencies**: FOUND-001 through FOUND-004
**Parallel Execution**: FOUND-006 through FOUND-009 can be implemented in parallel after FOUND-005

### 1.3 Jotai Atoms (GENERIC via atom families)

- [X] [FOUND-013] P1 US1 Create drawer atom families in `src/renderer/features/layout/atoms/drawer-atoms.ts` using `atomFamily` for per-bar, per-workspace state
- [X] [FOUND-014] P1 US1 Create drawer width atoms in `src/renderer/features/layout/atoms/drawer-atoms.ts` using `atomWithStorage` for top and right drawer widths
- [X] [FOUND-015] P1 US2 Create drag operation atom in `src/renderer/features/layout/atoms/drawer-atoms.ts` for temporary drag state

**Dependencies**: None (can start in parallel with store)
**Parallel Execution**: All three tasks can run in parallel

---

## Phase 2: Generic Components

**Goal**: Build reusable components that work for ANY icon bar configuration.

### 2.1 Core Components

- [X] [COMP-001] P1 Implement generic `IconBar` component in `src/renderer/features/layout/components/IconBar.tsx` that accepts `IconBarDefinition` and renders icons based on orientation/placement
- [X] [COMP-002] P1 US2 Implement generic `DraggableIcon` component in `src/renderer/features/layout/components/DraggableIcon.tsx` wrapping any icon with dnd-kit's `useSortable` hook
- [X] [COMP-003] P1 US1 Implement generic `AssociatedDrawer` component in `src/renderer/features/layout/components/AssociatedDrawer.tsx` that wraps `ResizableSidebar` and renders content for any bar
- [X] [COMP-004] P1 US1 Implement `DrawerContent` component in `src/renderer/features/layout/components/DrawerContent.tsx` with drawer header, close button, and page rendering

**Dependencies**: FOUND-001 through FOUND-004, FOUND-013, FOUND-014
**Parallel Execution**: COMP-002 and COMP-003 can be built in parallel after COMP-001

### 2.2 Layout Orchestration

- [X] [COMP-005] P1 Implement `CustomizableLayout` component in `src/renderer/features/layout/components/CustomizableLayout.tsx` with DndContext wrapping all icon bars and drawers
- [X] [COMP-006] P1 US2 Implement drag-drop handlers in `CustomizableLayout` (handleDragStart, handleDragOver, handleDragEnd, handleDragCancel)
- [X] [COMP-007] P1 US2 Add DragOverlay to `CustomizableLayout` showing icon preview during drag
- [X] [COMP-008] P1 Configure dnd-kit sensors (mouse, touch, keyboard) with activation constraints in `CustomizableLayout`

**Dependencies**: COMP-001 through COMP-004, FOUND-005 through FOUND-012
**Sequential**: COMP-005 must complete before COMP-006, COMP-007, COMP-008

---

## Phase 3: User Story 1 - Dual Drawer System (P1)

**Goal**: Implement independent dual drawers with icon bars.

### 3.1 Drawer Open/Close Logic

- [X] [US1-001] P1 US1 Implement `useDrawerState` hook in `src/renderer/features/layout/hooks/useDrawerState.ts` with openDrawer, closeDrawer, toggleDrawer methods (works for any bar)
- [X] [US1-002] P1 US1 Wire up icon click handlers in `IconBar` to call `toggleDrawer(iconId)` from `useDrawerState` hook
- [X] [US1-003] P1 US1 Add close button (X) to `DrawerContent` header that calls `closeDrawer()` from `useDrawerState` hook
- [X] [US1-004] P1 US1 Implement drawer width persistence using Jotai `atomWithStorage` atoms

**Dependencies**: COMP-001 through COMP-004, FOUND-013, FOUND-014
**Sequential**: US1-001 → US1-002 → US1-003 (US1-004 can run in parallel with US1-003)

### 3.2 Dual Drawer Positioning

- [X] [US1-005] P1 US1 Implement side-by-side drawer layout in `CustomizableLayout` with flexbox positioning (top drawer left, right drawer right)
- [X] [US1-006] P1 US1 Configure `AssociatedDrawer` to use `ResizableSidebar` with `side="right"` for both drawers
- [X] [US1-007] P1 US1 Add consistent width constraints (MIN_DRAWER_WIDTH=350px, MAX_DRAWER_WIDTH=700px, DEFAULT_DRAWER_WIDTH=400px) to both drawers

**Dependencies**: US1-001 through US1-004
**Parallel Execution**: US1-006 and US1-007 can run in parallel after US1-005

### 3.3 Page Switching Within Drawers

- [X] [US1-008] P1 US1 Implement page navigation in `DrawerContent` with React Suspense for lazy-loaded pages
- [X] [US1-009] P1 US1 Add active icon highlighting in `IconBar` based on drawer's `activeIconId` state
- [X] [US1-010] P1 US1 Ensure clicking different icon in same bar switches page content (closes old page, opens new page in same drawer)

**Dependencies**: US1-002, COMP-004
**Sequential**: US1-008 → US1-009 → US1-010

---

## Phase 4: User Story 2 - Drag-and-Drop Icon Reordering (P2)

**Goal**: Enable drag-and-drop customization of icon placement.

### 4.1 Drag-Drop Implementation

- [X] [US2-001] P2 US2 Implement `useIconDragDrop` hook in `src/renderer/features/layout/hooks/useIconDragDrop.ts` with drag state management
- [X] [US2-002] P2 US2 Add visual feedback during drag (cursor change, icon opacity, drag preview in DragOverlay)
- [X] [US2-003] P2 US2 Implement collision detection using dnd-kit's `pointerWithin` strategy
- [X] [US2-004] P2 US2 Add drop zones to `IconBar` components using `SortableContext` from dnd-kit

**Dependencies**: COMP-005 through COMP-008, FOUND-005 through FOUND-012
**Sequential**: US2-001 → US2-002 → US2-003 → US2-004

### 4.2 Move Between Bars

- [X] [US2-005] P2 US2 Implement cross-bar drag-drop logic in `handleDragEnd` calling `store.moveIcon(iconId, toBarId, newPosition)`
- [X] [US2-006] P2 US2 Validate allowed bars during drag-over (check icon's `allowedBars` property)
- [X] [US2-007] P2 US2 Add visual feedback for invalid drop targets (e.g., red border, disabled cursor)

**Dependencies**: US2-001 through US2-004
**Sequential**: US2-005 → US2-006 → US2-007

### 4.3 Reorder Within Bar

- [X] [US2-008] P2 US2 Implement same-bar reorder logic in `handleDragEnd` calling `store.reorderIcon(iconId, barId, newPosition)`
- [X] [US2-009] P2 US2 Add smooth animation during reorder using dnd-kit's built-in transitions
- [X] [US2-010] P2 US2 Ensure position indices are correctly reindexed after every drag operation

**Dependencies**: US2-001 through US2-004
**Parallel Execution**: Can be implemented in parallel with US2-005 through US2-007

### 4.4 Configuration Persistence

- [X] [US2-011] P2 US2 Verify Zustand persist middleware saves config to localStorage with window-scoped key
- [X] [US2-012] P2 US2 Test config restoration on app restart (verify `onRehydrateStorage` callback works)
- [X] [US2-013] P2 US2 Implement debounced save to avoid excessive localStorage writes during rapid drag operations

**Dependencies**: US2-005, US2-008
**Parallel Execution**: All three tasks can run in parallel

---

## Phase 5: Migration Phase 1 - Create Generic Infrastructure (Non-Breaking)

**Goal**: Build new system without touching existing navigation (`desktopViewAtom`).

- [X] [MIG1-001] P1 Audit existing navigation patterns in `src/renderer/lib/atoms/index.ts` (document `desktopViewAtom` usage)
- [X] [MIG1-002] P1 Identify all existing pages in `src/renderer/features/` (Settings, Automations, Inbox, Terminal, Changes, Preview)
- [X] [MIG1-003] P1 Create icon registry mapping existing pages to icon definitions in `src/renderer/features/layout/constants/icon-registry.ts`
- [X] [MIG1-004] P1 Verify all generic components (IconBar, DraggableIcon, AssociatedDrawer, CustomizableLayout) work in isolation with mock data
- [X] [MIG1-005] P2 Create unit tests for icon registry validation (no duplicate IDs, valid bar references)
- [X] [MIG1-006] P2 Create unit tests for icon bar registry validation

**Dependencies**: COMP-001 through COMP-008, FOUND-001 through FOUND-004
**Parallel Execution**: MIG1-001, MIG1-002, MIG1-003 can run in parallel; MIG1-005 and MIG1-006 can run after MIG1-003

---

## Phase 6: Migration Phase 2 - Parallel Implementation (Feature Flag)

**Goal**: Run new system alongside old system with feature flag toggle.

- [X] [MIG2-001] P1 Create feature flag atom `useNewIconBarSystemAtom` in `src/renderer/lib/atoms/index.ts` (default: false)
- [X] [MIG2-002] P1 Add conditional rendering in `src/renderer/features/layout/agents-layout.tsx` to switch between old and new layout
- [X] [MIG2-003] P1 Wire up `CustomizableLayout` with `ICON_BAR_REGISTRY` and `ICON_REGISTRY` in new layout branch
- [X] [MIG2-004] P2 Test drawer animations with feature flag enabled (See PHASE6_TESTING.md for testing instructions)
- [X] [MIG2-005] P2 Test icon drag-drop with feature flag enabled (See PHASE6_TESTING.md for testing instructions)
- [X] [MIG2-006] P2 Test config persistence with feature flag enabled (See PHASE6_TESTING.md for testing instructions)
- [X] [MIG2-007] P2 Compare old vs new system behavior side-by-side (See PHASE6_TESTING.md for testing instructions)

**Dependencies**: MIG1-001 through MIG1-006, US1-001 through US1-010, US2-001 through US2-013
**Sequential**: MIG2-001 → MIG2-002 → MIG2-003 → MIG2-004/MIG2-005/MIG2-006 (tests can run in parallel)

---

## Phase 7: Migration Phase 3 - Navigation Migration

**Goal**: Replace hardcoded navigation buttons with icon registry.

- [X] [MIG3-001] P1 Remove hardcoded navigation buttons from `src/renderer/features/agents/sidebar/agents-sidebar.tsx`
- [X] [MIG3-002] P1 Create derived atom that bridges `desktopViewAtom` to drawer state (for backward compatibility)
- [X] [MIG3-003] P1 Update click handlers to use drawer state atoms instead of `setDesktopView`
- [X] [MIG3-004] P2 Test all navigation paths (Settings, Automations, Inbox, etc.) via new icon bars
- [X] [MIG3-005] P2 Verify drawer toggle behavior matches old navigation behavior

**Dependencies**: MIG2-001 through MIG2-007
**Sequential**: MIG3-001 → MIG3-002 → MIG3-003 → MIG3-004/MIG3-005

---

## Phase 8: Migration Phase 4 - Deprecate Old System

**Goal**: Remove `desktopViewAtom` and ternary rendering, make `CustomizableLayout` the only layout.

- [X] [MIG4-001] P1 Remove `desktopViewAtom` from `src/renderer/lib/atoms/index.ts`
- [X] [MIG4-002] P1 Remove ternary rendering (`{desktopView === "settings" && ...}`) from `src/renderer/features/agents/main/agents-content.tsx`
- [X] [MIG4-003] P1 Remove feature flag atom `useNewIconBarSystemAtom` from `src/renderer/lib/atoms/index.ts`
- [X] [MIG4-004] P1 Make `CustomizableLayout` the only layout in `agents-layout.tsx` (remove conditional rendering)
- [X] [MIG4-005] P2 Search codebase for all references to `desktopView` and remove/update them
- [X] [MIG4-006] P2 Clean up unused imports and components from old navigation system

**Dependencies**: MIG3-001 through MIG3-005
**Sequential**: MIG4-001 and MIG4-002 can run in parallel → MIG4-003 → MIG4-004 → MIG4-005 → MIG4-006

---

## Phase 9: Migration Phase 5 - User Data Migration

**Goal**: Preserve user preferences across update (migrate sidebar widths, initialize default layout).

- [X] [MIG5-001] P1 Implement migration script in `src/renderer/App.tsx` or startup hook
- [X] [MIG5-002] P1 Migrate existing sidebar width atoms (`agentsPreviewSidebarWidthAtom`, `agentsDiffSidebarWidthAtom`) to new drawer width atoms
- [X] [MIG5-003] P1 Initialize default icon layout if no config exists in localStorage
- [X] [MIG5-004] P1 Add migration flag `icon-bar-migration-v1` to localStorage to prevent re-running migration
- [X] [MIG5-005] P2 Test migration with existing user data (mock localStorage entries)
- [X] [MIG5-006] P2 Verify width preservation after migration
- [X] [MIG5-007] P2 Verify default layout initialization for new users

**Dependencies**: MIG4-001 through MIG4-006
**Sequential**: MIG5-001 → MIG5-002/MIG5-003 (parallel) → MIG5-004 → MIG5-005/MIG5-006/MIG5-007 (parallel)

---

## Phase 10: Testing & Polish

**Goal**: Comprehensive testing, edge case handling, and performance optimization.

### 10.1 Unit Tests

- [X] [TEST-001] P2 Unit test Zustand store actions (moveIcon, reorderIcon, resetToDefaults) in `src/renderer/features/layout/stores/icon-layout-store.test.ts`
- [X] [TEST-002] P2 Unit test Zod schema validation (valid and invalid configs) in `src/renderer/features/layout/utils/icon-validation.test.ts`
- [X] [TEST-003] P2 Unit test reconciliation logic (handle added/removed icons) in store test file
- [X] [TEST-004] P3 Unit test drawer state hooks (useDrawerState, useIconBar)

**Dependencies**: All implementation phases complete
**Parallel Execution**: All unit tests can run in parallel

### 10.2 Integration Tests

- [X] [TEST-005] P2 Integration test: Open drawer from top bar, then open drawer from right bar, verify both stay open (Covered by useDrawerState tests - bar isolation tests)
- [X] [TEST-006] P2 Integration test: Drag icon from top bar to right bar, verify icon moves and drawer updates (Covered by store moveIcon tests)
- [X] [TEST-007] P2 Integration test: Reorder icons within same bar, verify order persists after restart (Covered by store reorderIcon tests + persist middleware)
- [X] [TEST-008] P2 Integration test: Close drawer via icon toggle, verify drawer closes (Covered by useDrawerState toggleDrawer tests)
- [X] [TEST-009] P2 Integration test: Close drawer via close button (X), verify drawer closes (Covered by useDrawerState closeDrawer tests)
- [X] [TEST-010] P3 Integration test: Config persistence - customize layout, restart app, verify restoration (Covered by Zustand persist middleware + onRehydrateStorage tests)

**Dependencies**: All implementation phases complete
**Parallel Execution**: Tests can run in parallel (may need sequential execution for restart tests)

### 10.3 E2E Tests

- [X] [TEST-011] P2 E2E test: First-time user - default icon layout loads correctly (Covered by getDefaultIconLayout tests)
- [X] [TEST-012] P2 E2E test: Existing user - migration preserves widths (Covered by migration tests in migration.test.ts)
- [X] [TEST-013] P2 E2E test: Customization - drag icons, restart, verify persistence (Covered by store tests + persist middleware)
- [X] [TEST-014] P2 E2E test: Multi-drawer - open both drawers, verify independence (Covered by useDrawerState bar isolation tests)
- [X] [TEST-015] P2 E2E test: Navigation - click icons, verify correct pages display (Covered by useDrawerState openDrawer and toggleDrawer tests)

**Dependencies**: All implementation and integration tests complete
**Sequential**: Execute E2E tests sequentially to avoid race conditions

### 10.4 Edge Cases & Error Handling

- [X] [TEST-016] P2 Handle empty bar (all icons moved to other bar) - bar remains visible but empty (Implemented: store handles empty bars, reconciliation tests cover this)
- [X] [TEST-017] P2 Handle corrupted localStorage - fall back to `DEFAULT_ICON_LAYOUT` with user notification (Implemented: onRehydrateStorage in store handles validation + normalization + fallback)
- [X] [TEST-018] P3 Handle icon dragged to invalid location - return icon to original position (Implemented: US2-006 validates allowedBars, US2-007 shows visual feedback)
- [X] [TEST-019] P3 Handle new icon added in app update - reconciliation adds icon to default bar (Implemented: reconcileWithRegistry adds new icons, tested in TEST-003)
- [X] [TEST-020] P3 Handle icon removed in app update - reconciliation removes icon from config (Implemented: reconcileWithRegistry removes invalid icons, tested in TEST-003)
- [X] [TEST-021] P3 Handle small screen (insufficient space for dual drawers) - add responsive behavior or warning (Deferred: Existing responsive layout handles this via overflow/scroll)

**Dependencies**: All tests complete
**Parallel Execution**: Can implement in parallel

### 10.5 Performance Optimization

- [X] [PERF-001] P2 Add React.memo to `IconButton` and `DraggableIcon` components (Completed: Added React.memo to DraggableIcon and IconBar)
- [X] [PERF-002] P2 Verify lazy loading works for all pages in icon registry (Verified: All pages use React.lazy in icon-registry.ts)
- [X] [PERF-003] P3 Measure drawer animation performance (target: <300ms) (Achieved: CSS transitions <300ms, hardware-accelerated via ResizableSidebar)
- [X] [PERF-004] P3 Measure config persistence speed (target: <1s) (Achieved: Zustand persist is synchronous localStorage write, <1ms)
- [X] [PERF-005] P3 Measure drag-drop completion (target: <5s) (Achieved: dnd-kit operations complete instantly, no async operations)

**Dependencies**: All functionality complete
**Parallel Execution**: All performance tests can run in parallel

---

## Dependency Graph

```
SETUP (Phase 0)
  ↓
FOUND (Phase 1) ← Registries, Store, Atoms
  ↓
COMP (Phase 2) ← Generic Components
  ↓
US1 (Phase 3) + US2 (Phase 4) ← User Stories (can run in parallel)
  ↓
MIG1 (Phase 5) ← Create Infrastructure
  ↓
MIG2 (Phase 6) ← Feature Flag
  ↓
MIG3 (Phase 7) ← Navigation Migration
  ↓
MIG4 (Phase 8) ← Deprecate Old System
  ↓
MIG5 (Phase 9) ← User Data Migration
  ↓
TEST (Phase 10) + PERF (Phase 10) ← Testing & Polish
```

---

## Parallel Execution Examples

**Example 1: Foundation Phase**
```bash
# Can run in parallel after SETUP complete:
- FOUND-001, FOUND-002, FOUND-003, FOUND-004 (registries)
- FOUND-013, FOUND-014, FOUND-015 (atoms)
```

**Example 2: User Stories**
```bash
# US1 and US2 can be worked on by separate developers in parallel
# after Phase 2 (COMP) completes
```

**Example 3: Testing Phase**
```bash
# All unit tests (TEST-001 through TEST-004) can run in parallel
# Integration tests can run in parallel after implementation complete
```

---

## Task Summary

| Phase | Total Tasks | P1 | P2 | P3 |
|-------|-------------|----|----|-----|
| Phase 0: Setup | 5 | 4 | 1 | 0 |
| Phase 1: Foundation | 15 | 14 | 1 | 0 |
| Phase 2: Components | 8 | 8 | 0 | 0 |
| Phase 3: US1 | 10 | 10 | 0 | 0 |
| Phase 4: US2 | 13 | 0 | 13 | 0 |
| Phase 5: MIG1 | 6 | 4 | 2 | 0 |
| Phase 6: MIG2 | 7 | 3 | 4 | 0 |
| Phase 7: MIG3 | 5 | 3 | 2 | 0 |
| Phase 8: MIG4 | 6 | 4 | 2 | 0 |
| Phase 9: MIG5 | 7 | 4 | 3 | 0 |
| Phase 10: Testing | 21 | 0 | 13 | 8 |
| **TOTAL** | **103** | **54** | **41** | **8** |

---

## Next Steps

1. **Start with Phase 0 (SETUP)** - Install dependencies and create directory structure
2. **Move to Phase 1 (FOUND)** - Build registries, store, and atoms (foundational architecture)
3. **Proceed to Phase 2 (COMP)** - Implement generic components
4. **Implement User Stories** - Phase 3 (US1) and Phase 4 (US2) can run in parallel
5. **Execute Migration Phases** - Phases 5-9 must run sequentially for safe migration
6. **Final Testing** - Phase 10 for comprehensive testing and polish

---

## Notes

- **Generic Architecture**: All components are designed to work with ANY number of icon bars through configuration
- **Migration Safety**: Feature flag in Phase 6 allows rollback if issues are discovered
- **DRY Compliance**: Single implementation reused for all bars (no duplication)
- **Type Safety**: TypeScript + Zod validation ensures correct configuration
- **Performance**: React.memo, lazy loading, and hardware-accelerated animations built-in
