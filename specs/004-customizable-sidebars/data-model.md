# Data Model: Customizable Dual Drawers

**Feature**: 004-customizable-sidebars
**Date**: 2026-02-03

---

## Overview

This document defines the data structures, state management patterns, and validation rules for the customizable dual drawer system.

---

## 1. Core Entities

### IconBarDefinition

**GENERIC**: Defines an icon bar instance (reusable for any number of bars).

```typescript
interface IconBarDefinition {
  id: string                    // Unique bar identifier (e.g., "top", "right", "bottom")
  label: string                 // Display name for accessibility
  orientation: 'horizontal' | 'vertical'  // Layout direction
  placement: 'top' | 'right' | 'bottom' | 'left'  // Screen position
  drawerSide: 'left' | 'right'  // Which side drawer slides from
  defaultIcons: string[]        // Default icon IDs for this bar (ordered)
}
```

**Example Instances**:
```typescript
const TOP_BAR: IconBarDefinition = {
  id: 'top',
  label: 'Top Action Bar',
  orientation: 'horizontal',
  placement: 'top',
  drawerSide: 'right',
  defaultIcons: ['agents', 'terminal', 'files'],
}

const RIGHT_BAR: IconBarDefinition = {
  id: 'right',
  label: 'Right Icon Bar',
  orientation: 'vertical',
  placement: 'right',
  drawerSide: 'right',
  defaultIcons: ['settings', 'help'],
}
```

### Icon

**GENERIC**: Represents a draggable icon that can be placed in ANY icon bar.

```typescript
interface Icon {
  id: string                    // Unique identifier (e.g., "agents", "terminal", "settings")
  label: string                 // Display name for accessibility
  icon: LucideIcon | ReactNode  // Icon component (Lucide or custom)
  page: ReactNode               // Page content to display in drawer
  allowedBars?: string[]        // Optional: restrict to specific bars (default: all bars)
}
```

**Validation Rules**:
- `id` must be unique across all icons
- `id` must be non-empty string
- `label` required for screen readers
- `page` can be lazy-loaded component

**Example**:
```typescript
const agentsIcon: Icon = {
  id: 'agents',
  label: 'AI Agents',
  icon: Bot,
  page: <AgentsPage />,
  defaultBar: 'topBar',
}
```

### IconConfig

**GENERIC**: Represents the position of an icon within ANY bar (persisted configuration).

```typescript
interface IconConfig {
  iconId: string    // Icon identifier (references Icon.id)
  barId: string     // Bar identifier (references IconBarDefinition.id)
  position: number  // 0-indexed position within the bar
}
```

**Validation Rules** (Zod):
```typescript
const IconConfigSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().nonnegative(),
})
```

**Invariants**:
- Positions must be sequential (0, 1, 2, ..., n-1)
- No duplicate `id` values within same bar
- No gaps in position sequence

### IconLayoutConfig

**GENERIC**: Complete icon placement configuration for a user (persisted to localStorage).
Supports ANY number of icon bars dynamically.

```typescript
interface IconLayoutConfig {
  version: number                        // Schema version for migrations (currently 1)
  bars: Record<string, IconConfig[]>     // GENERIC: Map of barId → icons
  lastModified: string                   // ISO 8601 timestamp
}
```

**Validation Rules** (Zod):
```typescript
const IconLayoutConfigSchema = z.object({
  version: z.literal(1),
  bars: z.record(z.string(), z.array(IconConfigSchema)),  // GENERIC: any bar ID
  lastModified: z.string().datetime(),
})
```

**Default Configuration** (built from IconBarDefinition registry):
```typescript
const DEFAULT_ICON_LAYOUT: IconLayoutConfig = {
  version: 1,
  bars: {
    top: [
      { iconId: 'agents', barId: 'top', position: 0 },
      { iconId: 'terminal', barId: 'top', position: 1 },
      { iconId: 'files', barId: 'top', position: 2 },
    ],
    right: [
      { iconId: 'settings', barId: 'right', position: 0 },
      { iconId: 'help', barId: 'right', position: 1 },
    ],
  },
  lastModified: new Date().toISOString(),
}

// FUTURE: Easy to add new bars
// bottom: [{ iconId: 'status', barId: 'bottom', position: 0 }],
```

### DrawerState

**GENERIC**: Runtime state for ANY drawer (not persisted).

```typescript
interface DrawerState {
  barId: string        // Which bar this drawer belongs to
  isOpen: boolean      // Whether drawer is visible
  activeIconId: string | null  // Currently displayed icon id
  width: number        // Current width in pixels
}
```

**State Transitions**:
```
CLOSED (isOpen=false, activePageId=null)
  ↓ [user clicks icon]
OPEN (isOpen=true, activePageId="iconId")
  ↓ [user clicks different icon in same bar]
OPEN (isOpen=true, activePageId="newIconId")  // Page switches
  ↓ [user clicks same icon again OR clicks close button]
CLOSED (isOpen=false, activePageId=null)
```

### DragOperation

**GENERIC**: Temporary state during drag-and-drop operation (works for ANY bars).

```typescript
interface DragOperation {
  activeIconId: string | null  // Icon being dragged (null when not dragging)
  overIconId: string | null    // Icon being hovered over
  sourceBarId: string | null   // Origin bar ID
  targetBarId: string | null   // Destination bar ID
}
```

**State Lifecycle**:
```
IDLE (all null)
  ↓ [onDragStart]
DRAGGING (activeId set, sourceBar set)
  ↓ [onDragOver]
HOVERING (overId set, targetBar set)
  ↓ [onDragEnd]
  → COMMITTED (update IconLayoutConfig) → IDLE
  OR
  → CANCELED (revert to original) → IDLE
```

---

## 2. State Management Architecture

### Jotai Atoms (Runtime Drawer State)

```typescript
// atoms/drawer-atoms.ts
import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

// Per-workspace drawer open/close state
export const topDrawerOpenAtomFamily = atomFamily((workspaceId: string) =>
  atom<boolean>(false)
)

export const rightDrawerOpenAtomFamily = atomFamily((workspaceId: string) =>
  atom<boolean>(false)
)

// Per-workspace active page (which icon's page is shown)
export const topDrawerPageAtomFamily = atomFamily((workspaceId: string) =>
  atom<string | null>(null)
)

export const rightDrawerPageAtomFamily = atomFamily((workspaceId: string) =>
  atom<string | null>(null)
)

// Global drawer widths (persisted via atomWithStorage)
export const topDrawerWidthAtom = atomWithStorage('top-drawer-width', 400)
export const rightDrawerWidthAtom = atomWithStorage('right-drawer-width', 400)

// Drag operation state (global, transient)
export const dragOperationAtom = atom<DragOperation>({
  activeId: null,
  overId: null,
  sourceBar: null,
  targetBar: null,
})
```

**Rationale**:
- `atomFamily` for per-workspace isolation (matches existing pattern in codebase)
- `atomWithStorage` for drawer widths (persisted, but independent of icon layout)
- Transient drag state separate from persisted config

### Zustand Store (Persisted Icon Configuration)

**GENERIC**: Store works for ANY number of icon bars.

```typescript
// stores/icon-layout-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface IconLayoutStore {
  // State
  config: IconLayoutConfig

  // Actions - GENERIC: work with any barId
  moveIcon: (iconId: string, toBarId: string, newPosition: number) => void
  reorderIcon: (iconId: string, barId: string, newPosition: number) => void
  resetToDefaults: () => void
  getIconLocation: (iconId: string) => { barId: string; position: number } | null
  getBarIcons: (barId: string) => IconConfig[]  // Get all icons for a bar

  // Utility
  reconcileWithRegistry: (barRegistry: IconBarDefinition[], iconRegistry: Icon[]) => void
}

export const useIconLayoutStore = create<IconLayoutStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_ICON_LAYOUT,

      moveIcon: (iconId, toBarId, newPosition) => {
        // GENERIC: Move icon to ANY bar
        const { config } = get()
        const sourceBarId = Object.keys(config.bars).find(barId =>
          config.bars[barId].some(ic => ic.iconId === iconId)
        )

        if (!sourceBarId) return

        const sourceBars = { ...config.bars }
        sourceBars[sourceBarId] = sourceBars[sourceBarId].filter(ic => ic.iconId !== iconId)

        if (!sourceBars[toBarId]) sourceBars[toBarId] = []
        sourceBars[toBarId].splice(newPosition, 0, {
          iconId,
          barId: toBarId,
          position: newPosition,
        })

        // Reindex positions for both bars
        Object.keys(sourceBars).forEach(barId => {
          sourceBars[barId] = sourceBars[barId].map((ic, idx) => ({
            ...ic,
            position: idx,
          }))
        })

        set({
          config: {
            ...config,
            bars: sourceBars,
            lastModified: new Date().toISOString(),
          },
        })
      },

      reorderIcon: (iconId, barId, newPosition) => {
        // GENERIC: Reorder within ANY bar
        const { config } = get()
        const barIcons = [...(config.bars[barId] || [])]
        const currentIndex = barIcons.findIndex(ic => ic.iconId === iconId)

        if (currentIndex === -1) return

        const [removed] = barIcons.splice(currentIndex, 1)
        barIcons.splice(newPosition, 0, removed)

        set({
          config: {
            ...config,
            bars: {
              ...config.bars,
              [barId]: barIcons.map((ic, idx) => ({ ...ic, position: idx })),
            },
            lastModified: new Date().toISOString(),
          },
        })
      },

      resetToDefaults: () => {
        set({ config: { ...DEFAULT_ICON_LAYOUT, lastModified: new Date().toISOString() } })
      },

      getIconLocation: (iconId) => {
        const { config } = get()
        for (const [barId, icons] of Object.entries(config.bars)) {
          const iconConfig = icons.find(ic => ic.iconId === iconId)
          if (iconConfig) {
            return { barId, position: iconConfig.position }
          }
        }
        return null
      },

      getBarIcons: (barId) => {
        return get().config.bars[barId] || []
      },

      reconcileWithRegistry: (barRegistry, iconRegistry) => {
        // GENERIC: Handle new/removed bars and icons
        const { config } = get()
        const validBarIds = new Set(barRegistry.map(b => b.id))
        const validIconIds = new Set(iconRegistry.map(i => i.id))

        // Remove invalid bars
        const validBars: Record<string, IconConfig[]> = {}
        Object.keys(config.bars).forEach(barId => {
          if (validBarIds.has(barId)) {
            // Keep only valid icons
            validBars[barId] = config.bars[barId].filter(ic =>
              validIconIds.has(ic.iconId)
            )
          }
        })

        // Add new bars with default icons
        barRegistry.forEach(bar => {
          if (!validBars[bar.id]) {
            validBars[bar.id] = bar.defaultIcons.map((iconId, idx) => ({
              iconId,
              barId: bar.id,
              position: idx,
            }))
          }
        })

        // Add new icons to their default bars
        const configuredIconIds = new Set(
          Object.values(validBars).flatMap(icons => icons.map(ic => ic.iconId))
        )
        iconRegistry.forEach(icon => {
          if (!configuredIconIds.has(icon.id)) {
            // Find default bar for this icon
            const defaultBar = barRegistry.find(b => b.defaultIcons.includes(icon.id))
            if (defaultBar && validBars[defaultBar.id]) {
              validBars[defaultBar.id].push({
                iconId: icon.id,
                barId: defaultBar.id,
                position: validBars[defaultBar.id].length,
              })
            }
          }
        })

        set({
          config: {
            ...config,
            bars: validBars,
            lastModified: new Date().toISOString(),
          },
        })
      },
    }),
    {
      name: `${getWindowId()}:icon-layout-config`,
      version: 1,
      migrate: migrateConfig,
    }
  )
)
```

**Rationale for GENERIC design**:
- `moveIcon` works with any `barId` (not hardcoded to 'topBar' | 'rightBar')
- `config.bars` is a `Record<string, IconConfig[]>` - supports unlimited bars
- `reconcileWithRegistry` dynamically handles new bars and icons
- Adding a 3rd bar requires only updating the registry, no store changes

**Rationale**:
- Zustand for complex, multi-action state (matches `sub-chat-store.ts` pattern)
- Persist middleware for localStorage integration
- Window-scoped keys for multi-window support

---

## 3. Data Flow

### Icon Drag Operation Flow

```
1. User starts drag
   ↓
   dnd-kit onDragStart
   ↓
   Update dragOperationAtom (activeId, sourceBar)
   ↓
2. User drags over target
   ↓
   dnd-kit onDragOver
   ↓
   Update dragOperationAtom (overId, targetBar)
   ↓
   [Visual feedback: DragOverlay, drop zone highlights]
   ↓
3. User releases
   ↓
   dnd-kit onDragEnd
   ↓
   if (validDrop):
     - iconLayoutStore.moveIcon() OR iconLayoutStore.reorderIcon()
     - Persisted to localStorage automatically (Zustand persist)
   else:
     - Revert (no-op)
   ↓
   Reset dragOperationAtom to null values
   ↓
   [UI updates: icons rerender in new positions]
```

### Drawer Open/Close Flow

```
1. User clicks icon in top action bar
   ↓
   Check topDrawerPageAtom
   ↓
   if (atom === iconId):
     - Toggle: setTopDrawerOpen(false)
     - setTopDrawerPage(null)
   else:
     - Switch page: setTopDrawerPage(iconId)
     - Ensure open: setTopDrawerOpen(true)
   ↓
   [ResizableSidebar animates, DrawerContent renders new page]

2. User clicks close button (X)
   ↓
   setTopDrawerOpen(false)
   setTopDrawerPage(null)
   ↓
   [ResizableSidebar animates out]
```

### Icon Configuration Persistence Flow

```
App Startup
↓
Zustand persist middleware loads from localStorage
↓
Validate with Zod schema (IconLayoutConfigSchema.safeParse)
↓
if (valid):
  - Use loaded config
  - Run reconcileWithAvailableIcons() (handle new/removed icons)
else:
  - Fallback to DEFAULT_ICON_LAYOUT
  - Clear corrupted data from localStorage
↓
[Icon bars render with loaded configuration]

On Configuration Change (drag-drop)
↓
User action → Store method (moveIcon/reorderIcon)
↓
Update store.config (reindex positions, update lastModified)
↓
Zustand persist middleware auto-saves to localStorage
↓
[Icon bars rerender with new positions]
```

---

## 4. Validation Rules & Invariants

### Icon Configuration Invariants

**Invariant 1: No Duplicate Icons**
```typescript
// Within same bar
const uniqueIds = new Set(config.topBar.map(i => i.id))
assert(uniqueIds.size === config.topBar.length, "No duplicate icon IDs")
```

**Invariant 2: Sequential Positions**
```typescript
// Positions must be 0, 1, 2, ..., n-1
config.topBar.forEach((icon, index) => {
  assert(icon.position === index, `Position ${icon.position} should be ${index}`)
})
```

**Invariant 3: No Orphaned Icons**
```typescript
// Every IconConfig.id must reference a valid Icon
const availableIds = new Set(AVAILABLE_ICONS.map(i => i.id))
config.topBar.forEach(icon => {
  assert(availableIds.has(icon.id), `Icon ${icon.id} not found in available icons`)
})
```

### Drawer State Invariants

**Invariant 4: Single Active Page per Drawer**
```typescript
// Only one page visible per drawer at a time
if (isTopDrawerOpen) {
  assert(topDrawerPageId !== null, "Open drawer must have active page")
} else {
  assert(topDrawerPageId === null, "Closed drawer cannot have active page")
}
```

**Invariant 5: Independent Drawer States**
```typescript
// Both drawers can be open simultaneously
// No mutual exclusion required
```

---

## 5. Migration Strategy

### Version 1 (Current)

Initial schema version.

### Future Migration Example: Version 1 → Version 2

Scenario: Add optional `pinnedIcons` array (icons that cannot be moved).

```typescript
const migrateV1toV2 = (v1Config: any): IconLayoutConfigV2 => {
  return {
    version: 2,
    topBar: v1Config.topBar,
    rightBar: v1Config.rightBar,
    pinnedIcons: [], // New field with default
    lastModified: new Date().toISOString(),
  }
}

// In Zustand persist config:
{
  version: 2,
  migrate: (persistedState, version) => {
    if (version === 1) {
      return migrateV1toV2(persistedState)
    }
    return DEFAULT_ICON_LAYOUT_V2
  }
}
```

---

## 6. Icon Bar Registry

**GENERIC**: Central registry defining ALL icon bars in the application.

```typescript
// constants/icon-bar-registry.ts
import type { IconBarDefinition } from '../types'

export const ICON_BAR_REGISTRY: IconBarDefinition[] = [
  {
    id: 'top',
    label: 'Top Action Bar',
    orientation: 'horizontal',
    placement: 'top',
    drawerSide: 'right',
    defaultIcons: ['agents', 'terminal', 'files'],
  },
  {
    id: 'right',
    label: 'Right Icon Bar',
    orientation: 'vertical',
    placement: 'right',
    drawerSide: 'right',
    defaultIcons: ['settings', 'help'],
  },
  // FUTURE: Easy to add more bars
  // {
  //   id: 'bottom',
  //   label: 'Bottom Status Bar',
  //   orientation: 'horizontal',
  //   placement: 'bottom',
  //   drawerSide: 'left',
  //   defaultIcons: ['status', 'notifications'],
  // },
]

export const ICON_BAR_MAP = new Map(ICON_BAR_REGISTRY.map(bar => [bar.id, bar]))

export function getIconBar(barId: string): IconBarDefinition | undefined {
  return ICON_BAR_MAP.get(barId)
}
```

## 7. Icon Registry

Central registry of all available icons in the application.

```typescript
// constants/icon-registry.ts
import { Bot, Terminal, FileText, Settings, HelpCircle } from 'lucide-react'
import { lazy } from 'react'
import type { Icon } from '../types'

export const ICON_REGISTRY: Icon[] = [
  {
    id: 'agents',
    label: 'AI Agents',
    icon: Bot,
    page: lazy(() => import('../pages/AgentsPage')),
    // No allowedBars restriction - can go in any bar
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: Terminal,
    page: lazy(() => import('../pages/TerminalPage')),
  },
  {
    id: 'files',
    label: 'Files',
    icon: FileText,
    page: lazy(() => import('../pages/FilesPage')),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    page: lazy(() => import('../pages/SettingsPage')),
    allowedBars: ['right'], // Optional: restrict to specific bars
  },
  {
    id: 'help',
    label: 'Help',
    icon: HelpCircle,
    page: lazy(() => import('../pages/HelpPage')),
  },
]

export const ICON_MAP = new Map(ICON_REGISTRY.map(icon => [icon.id, icon]))
export const ICON_IDS = new Set(ICON_REGISTRY.map(icon => icon.id))

export function getIcon(iconId: string): Icon | undefined {
  return ICON_MAP.get(iconId)
}

export function canIconBeInBar(iconId: string, barId: string): boolean {
  const icon = getIcon(iconId)
  if (!icon) return false
  if (!icon.allowedBars) return true // No restrictions
  return icon.allowedBars.includes(barId)
}
```

**Reconciliation on App Update**:
```typescript
// Called on app startup after loading persisted config
reconcileWithAvailableIcons(availableIconIds: string[]) {
  const { config } = get()

  // Remove icons that no longer exist
  const validTopBar = config.topBar.filter(icon => availableIconIds.includes(icon.id))
  const validRightBar = config.rightBar.filter(icon => availableIconIds.includes(icon.id))

  // Find new icons not in config
  const configuredIds = new Set([
    ...validTopBar.map(i => i.id),
    ...validRightBar.map(i => i.id),
  ])
  const newIcons = availableIconIds.filter(id => !configuredIds.has(id))

  // Add new icons to their default bars
  const updatedTopBar = [...validTopBar]
  const updatedRightBar = [...validRightBar]

  newIcons.forEach(id => {
    const icon = ICON_MAP.get(id)
    if (icon.defaultBar === 'topBar') {
      updatedTopBar.push({ id, position: updatedTopBar.length })
    } else {
      updatedRightBar.push({ id, position: updatedRightBar.length })
    }
  })

  set({
    config: {
      ...config,
      topBar: updatedTopBar.map((icon, idx) => ({ ...icon, position: idx })),
      rightBar: updatedRightBar.map((icon, idx) => ({ ...icon, position: idx })),
      lastModified: new Date().toISOString(),
    },
  })
}
```

---

## 7. Error Handling

### Corrupted Configuration

```typescript
// In Zustand persist onRehydrateStorage callback
{
  onRehydrateStorage: () => (state, error) => {
    if (error) {
      console.error('[IconLayoutStore] Rehydration error:', error)
      // Use defaults
      state.config = DEFAULT_ICON_LAYOUT
      // Show user notification
      toast.error('Icon layout reset to defaults due to corrupted data')
    }
  }
}
```

### localStorage Unavailable

```typescript
// Fallback to in-memory state only
if (!checkLocalStorageAvailability()) {
  console.warn('[IconLayoutStore] localStorage unavailable, using in-memory state')
  // Continue with defaults, but changes won't persist
  toast.warning('Icon layout will reset when you close the app (private browsing mode?)')
}
```

### Invalid Icon References

```typescript
// Remove invalid icon IDs during reconciliation
const validTopBar = config.topBar.filter(icon => {
  const isValid = AVAILABLE_ICON_IDS.has(icon.id)
  if (!isValid) {
    console.warn(`[IconLayoutStore] Removing invalid icon: ${icon.id}`)
  }
  return isValid
})
```

---

## 8. Performance Considerations

### Memoization

```typescript
// Icon bar components should memoize expensive renders
export const IconButton = React.memo(({ icon, isActive, onClick }: IconButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={cn('icon-button', isActive && 'active')}
      aria-label={icon.label}
    >
      <icon.icon size={20} />
    </button>
  )
})
```

### Lazy Loading

```typescript
// Page components lazy-loaded to reduce initial bundle size
const AgentsPage = lazy(() => import('./pages/AgentsPage'))

// In drawer content:
<Suspense fallback={<LoadingSpinner />}>
  {activeIcon?.page}
</Suspense>
```

### Debounced Persistence

```typescript
// Already handled by Zustand persist middleware
// Writes are batched and debounced automatically
```

---

## Summary

**Core Entities**: Icon, IconConfig, IconLayoutConfig, DrawerState, DragOperation

**State Management**:
- **Jotai**: Runtime drawer state (open/close, active page, widths)
- **Zustand**: Persisted icon configuration (layout)

**Validation**: Zod schemas with runtime checks

**Persistence**: localStorage via Zustand persist middleware

**Migration**: Version-based with fallback to defaults

**Error Handling**: Multi-layered defense with user notifications
