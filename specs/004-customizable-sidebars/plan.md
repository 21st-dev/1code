# Implementation Plan: Customizable Dual Drawers with Icon Bars

**Branch**: `004-customizable-sidebars` | **Date**: 2026-02-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-customizable-sidebars/spec.md`

## Summary

Implement a dual drawer system where users can customize icon placement between a horizontal top action bar and a vertical right icon bar. Each icon bar opens its own independent drawer from the right side. Both drawers can be open simultaneously and position side-by-side. Users drag-and-drop icons to reorganize layout, with preferences persisted locally and restored on app restart.

## Technical Context

**Language/Version**: TypeScript 5.4.5, React 19, Electron 33.4.5
**Primary Dependencies**: Jotai (UI state), Zustand (persistent state), Radix UI (components), dnd-kit (drag-and-drop)
**Storage**: localStorage for icon configuration, Jotai atoms for runtime drawer state
**Testing**: Vitest for unit tests, Playwright for E2E
**Target Platform**: Electron desktop (macOS, Windows, Linux)
**Project Type**: Desktop Electron application with React renderer
**Performance Goals**: <300ms drawer animation, <1s configuration persistence, <5s drag-drop completion
**Constraints**: Must not interfere with existing chat/project functionality, offline-capable, no network dependencies
**Scale/Scope**: ~10-20 configurable icons, 2 icon bars, 2 independent drawers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

**Principle I - Desktop-First Experience**:
- [x] Feature works offline-first with local data storage (localStorage for config)
- [x] Uses native Electron APIs where applicable (not needed for this UI-only feature)
- [x] IPC uses type-safe tRPC patterns (not needed - pure renderer feature)
- [x] State persists across app restarts (Zustand localStorage persistence)
- [x] Platform-specific features degrade gracefully (pure CSS/React, no platform specifics)

**Principle II - Git Worktree Isolation** (NON-NEGOTIABLE):
- [x] Feature respects worktree boundaries (UI-only, no file system operations)
- [x] If modifying worktree logic: N/A (this feature is UI-only)
- [x] If modifying worktree logic: N/A (this feature is UI-only)

**Principle III - Type Safety & Data Integrity**:
- [x] All tRPC routers have Zod input schemas (N/A - no tRPC routes for this feature)
- [x] Database changes use Drizzle migrations only (N/A - no database changes)
- [x] No `any` types without explicit justification (will use strict TypeScript)
- [x] Preload APIs are fully typed (N/A - no preload API changes)

**Principle IV - User Transparency & Control**:
- [x] Tool executions render in real-time (N/A - UI interaction only)
- [x] Changes show diff previews before applying (N/A - layout changes are immediately visible)
- [x] Error messages are actionable with recovery suggestions (will handle corrupted config gracefully)
- [x] Background operations show progress and allow cancellation (N/A - all operations are instant)

**Principle V - Performance & Responsiveness**:
- [x] Operations >100ms run in background/workers (all operations <100ms - UI state updates only)
- [x] Large files stream (N/A - no file operations)
- [x] Database queries use indexes, avoid N+1 patterns (N/A - no database queries)
- [x] React components properly memoized (will use React.memo and useMemo for drawer components)

**Development Standards**:
- [x] Testing strategy defined (E2E for drag-drop flow, unit for state logic)
- [x] Follows code organization patterns (features/layout/ for new components)
- [x] Uses conventional commit format (will follow feat:/fix: conventions)

**Status**: ✅ All gates passed. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/004-customizable-sidebars/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file
├── research.md          # Phase 0: Technology choices and patterns
├── data-model.md        # Phase 1: State shape and persistence
├── quickstart.md        # Phase 1: Developer onboarding
├── contracts/           # Phase 1: TypeScript interfaces
└── tasks.md             # Phase 2: Implementation tasks (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/renderer/
├── features/
│   └── layout/                          # NEW: Generic customizable icon bar system
│       ├── components/
│       │   ├── IconBar.tsx              # GENERIC: Reusable icon bar wrapper (any orientation)
│       │   ├── DraggableIcon.tsx        # GENERIC: Draggable icon wrapper component
│       │   ├── AssociatedDrawer.tsx     # GENERIC: Drawer linked to icon bar
│       │   ├── CustomizableLayout.tsx   # GENERIC: Layout with drag-drop context
│       │   └── DrawerContent.tsx        # Content renderer with page switching
│       ├── atoms/
│       │   └── drawer-atoms.ts          # GENERIC: Atom factories for any drawer
│       ├── stores/
│       │   └── icon-layout-store.ts     # GENERIC: Store for N icon bars
│       ├── hooks/
│       │   ├── useDrawerState.ts        # GENERIC: Drawer logic for any bar
│       │   ├── useIconBar.ts            # GENERIC: Icon bar configuration
│       │   └── useIconDragDrop.ts       # GENERIC: Multi-bar drag-drop
│       ├── types/
│       │   └── icon-bar.types.ts        # GENERIC: Interfaces for any icon bar
│       └── utils/
│           ├── icon-bar-registry.ts     # GENERIC: Register N icon bars
│           └── icon-validation.ts       # GENERIC: Validation helpers
│
├── components/ui/                       # Existing Radix UI components (reuse)
│   └── resizable-sidebar.tsx            # ✅ Reuse for drawer animation
└── lib/
    └── atoms/                           # Existing global atoms

tests/
└── e2e/
    └── layout/
        └── icon-customization.spec.ts   # Test with multiple bars
```

**Structure Decision**: This feature creates a **GENERIC icon bar system** that can be reused for ANY number of icon bars in any orientation. The implementation follows DRY principles:

1. **Generic Components**: `IconBar`, `DraggableIcon`, `AssociatedDrawer` work for ANY icon bar instance
2. **Configuration-Driven**: Icon bars defined in registry, not hardcoded
3. **Reuses Existing Code**: Leverages `ResizableSidebar` for drawer animation
4. **Scalable**: Adding a 3rd, 4th, or Nth icon bar requires only configuration, no new components

**Example Usage** (in consuming code):
```typescript
<CustomizableLayout>
  <IconBar id="top" orientation="horizontal" placement="top" />
  <IconBar id="right" orientation="vertical" placement="right" />
  {/* Easy to add more bars in future */}
  <MainContent />
</CustomizableLayout>
```

## Migration Strategy

**CRITICAL**: This feature requires migrating existing navigation patterns to the new generic architecture.

### Current System Analysis

#### Existing Navigation Patterns

**1. Desktop View Atom System** (`desktopViewAtom`):
```typescript
// Current: src/renderer/lib/atoms/index.ts
type DesktopView = "automations" | "automations-detail" | "inbox" | "settings" | null

// Used in agents-content.tsx with ternary rendering:
{desktopView === "settings" && <SettingsContent />}
{desktopView === "automations" && <AutomationsView />}
// etc.
```

**2. Sidebar Width Atoms** (already using Jotai):
- `agentsSidebarWidthAtom` - Left chat sidebar
- `agentsPreviewSidebarWidthAtom` - Preview sidebar
- `agentsDiffSidebarWidthAtom` - Diff sidebar
- ✅ **Can be reused** for new drawer widths

**3. Current Pages** (identified in codebase):
- Settings (`SettingsContent`) - 12 tabs, full-screen
- Automations (`AutomationsView`) - full-screen
- Automations Detail (`AutomationsDetailView`) - full-screen
- Inbox (`InboxView`) - full-screen
- Terminal (`TerminalSidebar`) - existing sidebar panel
- Changes/Diff (`AgentDiffView`) - existing sidebar panel
- Preview (`AgentPreview`) - existing sidebar panel

### Migration Path

#### Phase 1: Create Generic Infrastructure (Non-Breaking)

**Goal**: Build new system WITHOUT breaking existing navigation

**Steps**:
1. Create `features/layout/` directory structure
2. Implement generic components (`IconBar`, `DraggableIcon`, `AssociatedDrawer`)
3. Create icon registry with placeholder icons:
```typescript
// Initially map existing functionality
export const ICON_REGISTRY: Icon[] = [
  { id: 'settings', label: 'Settings', icon: Settings, page: lazy(() => import('../../settings/settings-content')) },
  { id: 'automations', label: 'Automations', icon: Zap, page: lazy(() => import('../../automations/automations-view')) },
  { id: 'inbox', label: 'Inbox', icon: Inbox, page: lazy(() => import('../../automations/inbox-view')) },
  // Add existing sidebar panels
  { id: 'terminal', label: 'Terminal', icon: Terminal, page: lazy(() => import('../../terminal/terminal-sidebar')) },
  { id: 'changes', label: 'Changes', icon: GitBranch, page: lazy(() => import('../../changes/agent-diff-view')) },
  { id: 'preview', label: 'Preview', icon: Eye, page: lazy(() => import('../../agents/ui/agent-preview')) },
]
```
4. Create icon bar registry (top + right)
5. Implement Zustand store for icon configuration
6. **DO NOT touch existing routing yet**

**Test**: Generic components work in isolation with mock data

---

#### Phase 2: Parallel Implementation (Feature Flag)

**Goal**: Run new system in parallel with old system

**Steps**:
1. Add feature flag atom: `useNewIconBarSystemAtom` (default: false)
2. In `agents-layout.tsx`, add conditional rendering:
```typescript
const useNewSystem = useAtomValue(useNewIconBarSystemAtom)

return (
  <div>
    {useNewSystem ? (
      <CustomizableLayout iconBars={ICON_BAR_REGISTRY} icons={ICON_REGISTRY}>
        <MainContent />
      </CustomizableLayout>
    ) : (
      // Existing layout
      <>
        <ResizableSidebar>...</ResizableSidebar>
        <AgentsContent />
      </>
    )}
  </div>
)
```
3. Test new system by toggling feature flag
4. Verify icon drag-drop works
5. Verify drawer animations work
6. Verify config persistence works

**Test**: Toggle feature flag, compare behaviors

---

#### Phase 3: Migration of Navigation Buttons

**Goal**: Replace hardcoded navigation buttons with icon registry

**Current State** (in `agents-sidebar.tsx`):
```typescript
// Hardcoded buttons in left sidebar
<Button onClick={() => setDesktopView("settings")}>
  <Settings size={20} />
</Button>
<Button onClick={() => setDesktopView("automations")}>
  <Zap size={20} />
</Button>
```

**Migration**:
1. Remove hardcoded buttons from `agents-sidebar.tsx`
2. Ensure icons appear in top/right bars via registry
3. Update `desktopViewAtom` usage:
   - Keep atom for backward compatibility initially
   - Make it derived from drawer state: `drawerStateAtom.activeIconId === 'settings' ? 'settings' : null`
4. Update click handlers to use drawer state atoms instead of `setDesktopView`

**Test**: Navigation still works via new icon bars

---

#### Phase 4: Deprecate Old System

**Goal**: Remove `desktopViewAtom` and ternary rendering

**Steps**:
1. Remove `desktopViewAtom` from `lib/atoms/index.ts`
2. Remove ternary rendering from `agents-content.tsx`:
```typescript
// DELETE:
{desktopView === "settings" && <SettingsContent />}
{desktopView === "automations" && <AutomationsView />}

// Pages now render in drawers via icon registry
```
3. Remove feature flag atom (`useNewIconBarSystemAtom`)
4. Make `CustomizableLayout` the only layout
5. Update all references to `desktopView` (search codebase)
6. Clean up unused imports

**Test**: E2E tests for navigation, drawer behavior, config persistence

---

#### Phase 5: User Data Migration

**Goal**: Preserve user preferences across update

**Existing State** (if any):
- Left sidebar width: `agentsSidebarWidthAtom` → Keep for left chat sidebar
- Preview sidebar width: `agentsPreviewSidebarWidthAtom` → Migrate to drawer width
- Diff sidebar width: `agentsDiffSidebarWidthAtom` → Migrate to drawer width

**New State**:
- Icon layout config: `{windowId}:icon-layout-config` in localStorage
- Drawer widths: New atoms per bar (e.g., `topDrawerWidthAtom`, `rightDrawerWidthAtom`)

**Migration Script** (runs on app startup):
```typescript
// In main App component or startup hook
useEffect(() => {
  const hasRunMigration = localStorage.getItem('icon-bar-migration-v1')

  if (!hasRunMigration) {
    // Migrate existing sidebar widths to new drawer widths
    const previewWidth = localStorage.getItem('agentsPreviewSidebarWidth')
    const diffWidth = localStorage.getItem('agentsDiffSidebarWidth')

    if (previewWidth) {
      localStorage.setItem('top-drawer-width', previewWidth)
    }
    if (diffWidth) {
      localStorage.setItem('right-drawer-width', diffWidth)
    }

    // Initialize default icon layout if none exists
    const layoutConfig = localStorage.getItem(`${getWindowId()}:icon-layout-config`)
    if (!layoutConfig) {
      localStorage.setItem(
        `${getWindowId()}:icon-layout-config`,
        JSON.stringify(DEFAULT_ICON_LAYOUT)
      )
    }

    localStorage.setItem('icon-bar-migration-v1', 'true')
  }
}, [])
```

**Test**: Existing users see drawers with preserved widths

---

### Migration Checklist

#### Pre-Migration (Phase 0)
- [ ] Audit existing pages and components
- [ ] Identify all navigation entry points
- [ ] Document current state management patterns
- [ ] Create icon registry mapping table

#### Generic Infrastructure (Phase 1)
- [ ] Create `features/layout/` directory
- [ ] Implement `IconBar` component
- [ ] Implement `DraggableIcon` component
- [ ] Implement `AssociatedDrawer` component
- [ ] Implement `CustomizableLayout` component
- [ ] Create icon registry
- [ ] Create icon bar registry
- [ ] Implement Zustand store for config
- [ ] Test components in isolation

#### Parallel System (Phase 2)
- [ ] Add feature flag atom
- [ ] Wire up new layout in `agents-layout.tsx`
- [ ] Test with feature flag enabled
- [ ] Verify drag-drop works
- [ ] Verify config persistence works
- [ ] Verify drawer animations work

#### Navigation Migration (Phase 3)
- [ ] Remove hardcoded navigation buttons
- [ ] Update click handlers
- [ ] Bridge `desktopViewAtom` to new state
- [ ] Test all navigation paths

#### Deprecation (Phase 4)
- [ ] Remove `desktopViewAtom`
- [ ] Remove ternary rendering
- [ ] Remove feature flag
- [ ] Clean up unused code
- [ ] Update all references
- [ ] E2E test pass

#### User Data (Phase 5)
- [ ] Implement migration script
- [ ] Test with existing user data
- [ ] Verify width preservation
- [ ] Verify default layout initialization

---

### Rollback Plan

If issues are discovered post-migration:

**Option 1: Revert via Feature Flag**
```typescript
// Temporarily re-enable old system
const forceOldSystem = true // or from remote config
return forceOldSystem ? <OldLayout /> : <CustomizableLayout />
```

**Option 2: Database Rollback**
```typescript
// Clear new config, restore old atoms
localStorage.removeItem(`${getWindowId()}:icon-layout-config`)
localStorage.removeItem('icon-bar-migration-v1')
// User gets old system on next app restart
```

---

### Testing Strategy

#### Unit Tests
- Icon registry validation (no duplicate IDs)
- Icon bar registry validation (valid bar configs)
- Store actions (moveIcon, reorderIcon, reconcile)
- Zod schema validation

#### Integration Tests
- Drawer open/close with icon clicks
- Drag icon between bars
- Reorder icons within same bar
- Config persistence and restoration
- Migration script execution

#### E2E Tests
1. **First-time user**: Default icon layout loads
2. **Existing user**: Migration preserves widths
3. **Customization**: Drag icons, restart, verify persistence
4. **Multi-drawer**: Open both drawers, verify independence
5. **Navigation**: Click icons, verify correct pages display

---

### Risk Mitigation

**Risk 1**: Breaking existing navigation
- **Mitigation**: Feature flag + parallel implementation
- **Fallback**: Revert via feature flag

**Risk 2**: Lost user preferences
- **Mitigation**: Migration script + localStorage backup
- **Fallback**: Default layout + manual reconfiguration

**Risk 3**: Performance regression (many icons)
- **Mitigation**: React.memo + lazy loading
- **Fallback**: Limit max icons per bar

**Risk 4**: Incompatibility with future bars
- **Mitigation**: Generic architecture + schema versioning
- **Fallback**: Reconciliation logic handles new/removed bars

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table empty.

