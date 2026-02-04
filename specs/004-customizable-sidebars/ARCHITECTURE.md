# Architecture Overview: Generic Customizable Icon Bar System

**Feature**: 004-customizable-sidebars
**Design Philosophy**: DRY, GENERIC, REUSABLE

---

## Core Principle: Configuration Over Implementation

This system is built on **configuration-driven architecture** where:
- **Components are generic** - work for ANY icon bar configuration
- **Adding new bars requires ONLY configuration**, not new components
- **All logic is reusable** - drag-drop, drawer state, persistence work for N bars
- **Follows DRY** - single implementation, infinite use cases

---

## Generic Components

### 1. `IconBar` Component (GENERIC)

**Purpose**: Reusable icon bar that works for ANY orientation, placement, or configuration.

**Usage**:
```tsx
// Horizontal top bar
<IconBar
  bar={{ id: 'top', orientation: 'horizontal', placement: 'top', ... }}
  iconConfigs={config.bars['top']}
  iconRegistry={ICON_REGISTRY}
  activeIconId={activeIconId}
  onIconClick={handleClick}
/>

// Vertical right bar
<IconBar
  bar={{ id: 'right', orientation: 'vertical', placement: 'right', ... }}
  iconConfigs={config.bars['right']}
  iconRegistry={ICON_REGISTRY}
  activeIconId={activeIconId}
  onIconClick={handleClick}
/>

// Future: Any other bar (bottom, left, etc.)
<IconBar
  bar={{ id: 'bottom', orientation: 'horizontal', placement: 'bottom', ... }}
  iconConfigs={config.bars['bottom']}
  iconRegistry={ICON_REGISTRY}
  activeIconId={activeIconId}
  onIconClick={handleClick}
/>
```

**Key Point**: Same component, different configuration.

---

### 2. `DraggableIcon` Component (GENERIC)

**Purpose**: Wraps ANY icon to make it draggable, works in ANY icon bar.

**Usage**:
```tsx
<DraggableIcon
  icon={ICON_MAP.get(iconId)}
  config={{ iconId, barId, position }}
  isActive={activeIconId === iconId}
  onClick={() => handleIconClick(iconId)}
  isDragging={dragOperation.activeIconId === iconId}
/>
```

**Key Point**: Drag-drop logic is encapsulated, reusable for any icon in any bar.

---

### 3. `AssociatedDrawer` Component (GENERIC)

**Purpose**: Drawer component that can be associated with ANY icon bar.

**Usage**:
```tsx
// Drawer for top bar
<AssociatedDrawer
  bar={ICON_BAR_MAP.get('top')}
  isOpen={isTopDrawerOpen}
  activeIconId={topActiveIconId}
  widthAtom={topDrawerWidthAtom}
  onClose={() => setTopDrawerOpen(false)}
  icons={ICON_REGISTRY}
  onPageChange={setTopActiveIconId}
  workspaceId={workspaceId}
/>

// Drawer for right bar
<AssociatedDrawer
  bar={ICON_BAR_MAP.get('right')}
  isOpen={isRightDrawerOpen}
  activeIconId={rightActiveIconId}
  widthAtom={rightDrawerWidthAtom}
  onClose={() => setRightDrawerOpen(false)}
  icons={ICON_REGISTRY}
  onPageChange={setRightActiveIconId}
  workspaceId={workspaceId}
/>
```

**Key Point**: Same drawer component, different bar associations. Reuses `ResizableSidebar` internally.

---

### 4. `CustomizableLayout` Component (GENERIC)

**Purpose**: Top-level layout that orchestrates N icon bars and N drawers via drag-drop context.

**Usage**:
```tsx
<CustomizableLayout
  workspaceId={workspaceId}
  iconBars={ICON_BAR_REGISTRY}  // Define ANY number of bars
  icons={ICON_REGISTRY}
>
  <MainContent />
</CustomizableLayout>
```

**Key Point**: Automatically renders all bars and drawers from configuration. No hardcoding.

---

## Configuration Files (The Source of Truth)

### 1. Icon Bar Registry

**File**: `constants/icon-bar-registry.ts`

**Purpose**: Defines ALL icon bars in the application.

```typescript
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
  // ADD MORE BARS HERE - NO CODE CHANGES NEEDED
  // {
  //   id: 'bottom',
  //   label: 'Bottom Status Bar',
  //   orientation: 'horizontal',
  //   placement: 'bottom',
  //   drawerSide: 'left',
  //   defaultIcons: ['status', 'notifications'],
  // },
]
```

**Adding a new bar**:
1. Add entry to `ICON_BAR_REGISTRY` ✅
2. That's it. No component changes needed. ✅

---

### 2. Icon Registry

**File**: `constants/icon-registry.ts`

**Purpose**: Defines ALL draggable icons in the application.

```typescript
export const ICON_REGISTRY: Icon[] = [
  {
    id: 'agents',
    label: 'AI Agents',
    icon: Bot,
    page: lazy(() => import('../pages/AgentsPage')),
    // No allowedBars - can go in ANY bar
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    page: lazy(() => import('../pages/SettingsPage')),
    allowedBars: ['right'], // Optional: restrict to specific bars
  },
  // ADD MORE ICONS HERE
]
```

**Adding a new icon**:
1. Add entry to `ICON_REGISTRY` ✅
2. Add to `defaultIcons` in appropriate bar(s) ✅
3. That's it. Drag-drop, persistence, rendering all work automatically. ✅

---

## Generic State Management

### Zustand Store (GENERIC)

**Works for ANY number of bars**:

```typescript
interface IconLayoutConfig {
  version: number
  bars: Record<string, IconConfig[]>  // ← GENERIC: any bar ID
  lastModified: string
}

// Example with 2 bars
{
  bars: {
    top: [{ iconId: 'agents', barId: 'top', position: 0 }],
    right: [{ iconId: 'settings', barId: 'right', position: 0 }],
  }
}

// Example with 4 bars (future)
{
  bars: {
    top: [...],
    right: [...],
    bottom: [...],
    left: [...],
  }
}
```

**Key Methods** (all generic):
```typescript
moveIcon(iconId: string, toBarId: string, newPosition: number)  // Move to ANY bar
reorderIcon(iconId: string, barId: string, newPosition: number)  // Reorder in ANY bar
getBarIcons(barId: string)  // Get icons for ANY bar
```

---

### Jotai Atoms (GENERIC)

**Atom factories for ANY bar**:

```typescript
// GENERIC: Create drawer state atom for ANY bar
const drawerStateAtomFamily = atomFamily((barId: string, workspaceId: string) =>
  atom<DrawerState>({
    barId,
    isOpen: false,
    activeIconId: null,
    width: DEFAULT_DRAWER_WIDTH,
  })
)

// Usage for top bar
const topDrawerAtom = drawerStateAtomFamily('top', workspaceId)

// Usage for right bar
const rightDrawerAtom = drawerStateAtomFamily('right', workspaceId)

// Usage for any future bar
const bottomDrawerAtom = drawerStateAtomFamily('bottom', workspaceId)
```

**Key Point**: One atom factory, infinite bar instances.

---

## Drag-and-Drop (GENERIC)

**Single DndContext handles ALL bars**:

```typescript
<DndContext
  sensors={sensors}
  collisionDetection={pointerWithin}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  {/* Render ALL bars from registry */}
  {ICON_BAR_REGISTRY.map(bar => (
    <IconBar key={bar.id} bar={bar} {...props} />
  ))}

  {/* Drag overlay shows dragged icon */}
  <DragOverlay>
    {dragOperation.activeIconId && (
      <IconPreview iconId={dragOperation.activeIconId} />
    )}
  </DragOverlay>
</DndContext>
```

**Drag-drop handlers** (generic):
```typescript
handleDragStart(event) {
  // Works for ANY icon from ANY bar
  const { active } = event
  const iconId = active.id
  const sourceBarId = active.data.current.barId
  // ...
}

handleDragEnd(event) {
  // Works for moving between ANY bars
  const { active, over } = event
  const iconId = active.id
  const sourceBarId = active.data.current.barId
  const targetBarId = over.data.current.barId

  if (sourceBarId !== targetBarId) {
    store.moveIcon(iconId, targetBarId, newPosition)  // GENERIC
  } else {
    store.reorderIcon(iconId, sourceBarId, newPosition)  // GENERIC
  }
}
```

**Key Point**: Drag-drop logic doesn't care how many bars exist or what they're called.

---

## Reusing Existing Code

### 1. `ResizableSidebar` Component

**Already exists** in `src/renderer/components/ui/resizable-sidebar.tsx`

**Usage in `AssociatedDrawer`**:
```typescript
export function AssociatedDrawer({ bar, isOpen, activeIconId, ... }: AssociatedDrawerProps) {
  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={onClose}
      widthAtom={widthAtom}
      side={bar.drawerSide}  // ← Use bar config
      minWidth={MIN_DRAWER_WIDTH}
      maxWidth={MAX_DRAWER_WIDTH}
      animationDuration={DRAWER_ANIMATION_DURATION}
    >
      <DrawerContent bar={bar} activeIconId={activeIconId} {...props} />
    </ResizableSidebar>
  )
}
```

**Key Point**: Zero changes to `ResizableSidebar`. Just wrap it.

---

### 2. Existing Patterns

**From `sub-chat-store.ts`**:
- ✅ Zustand with persist middleware
- ✅ Window-scoped localStorage keys
- ✅ Safe error handling

**From `drawer-atoms.ts`** (agents):
- ✅ `atomFamily` for per-workspace state
- ✅ `atomWithStorage` for persistent widths

**From `active-chat.tsx`**:
- ✅ Multiple simultaneous `ResizableSidebar` components
- ✅ Flexbox layout for side-by-side panels

**Key Point**: All patterns are already proven in the codebase.

---

## Scalability Examples

### Current (Phase 1): 2 Bars

```typescript
ICON_BAR_REGISTRY = [
  { id: 'top', ... },
  { id: 'right', ... },
]
```

**Result**: Top horizontal bar + Right vertical bar

---

### Future (Phase 2): 3 Bars

```typescript
ICON_BAR_REGISTRY = [
  { id: 'top', ... },
  { id: 'right', ... },
  { id: 'bottom', ... },  // ← Just add this
]
```

**Result**: Top bar + Right bar + Bottom bar

**Code changes**: ZERO. Just configuration.

---

### Future (Phase 3): 4 Bars

```typescript
ICON_BAR_REGISTRY = [
  { id: 'top', ... },
  { id: 'right', ... },
  { id: 'bottom', ... },
  { id: 'left', ... },  // ← Just add this
]
```

**Result**: Full quad-bar layout

**Code changes**: ZERO. Just configuration.

---

## Benefits of Generic Architecture

### 1. DRY Compliance ✅
- Single `IconBar` implementation, used N times
- Single `DraggableIcon` implementation, wraps any icon
- Single drag-drop system, works for all bars

### 2. Maintainability ✅
- Bug fix in `IconBar` applies to ALL bars
- Feature addition (e.g., icon tooltips) works everywhere automatically
- No duplicate code to keep in sync

### 3. Testability ✅
- Test `IconBar` once with different configs
- Test drag-drop with 2 bars, confidence it works with 3, 4, N bars

### 4. Extensibility ✅
- New bar = add config entry
- New icon = add registry entry
- New drawer behavior = update generic `AssociatedDrawer`

### 5. Type Safety ✅
- TypeScript interfaces enforce contract
- `IconBarDefinition` ensures correct bar structure
- `Icon` interface ensures correct icon structure
- Zod validation at runtime

---

## Component Hierarchy (Generic)

```
CustomizableLayout (GENERIC)
├── DndContext (GENERIC)
│   ├── IconBar (GENERIC) [for each bar in ICON_BAR_REGISTRY]
│   │   └── SortableContext
│   │       └── DraggableIcon (GENERIC) [for each icon in bar]
│   │           └── Icon Component (Lucide/Custom)
│   └── DragOverlay (GENERIC)
│       └── IconPreview (shows dragged icon)
├── MainContent (user provided)
└── AssociatedDrawer (GENERIC) [for each bar in ICON_BAR_REGISTRY]
    └── ResizableSidebar (REUSED)
        └── DrawerContent (GENERIC)
            ├── DrawerHeader (with close button)
            └── Suspense
                └── ActivePage (lazy loaded from icon)
```

**Key Point**: Everything is generic. Nothing is hardcoded to "top" or "right".

---

## Implementation Checklist

### Generic Components ✅
- [ ] `IconBar` - works for ANY bar definition
- [ ] `DraggableIcon` - wraps ANY icon
- [ ] `AssociatedDrawer` - links to ANY bar
- [ ] `CustomizableLayout` - orchestrates N bars

### Generic State ✅
- [ ] Zustand store with `bars: Record<string, IconConfig[]>`
- [ ] Jotai atom factories for ANY bar
- [ ] Drag operation state (bar-agnostic)

### Generic Logic ✅
- [ ] `moveIcon(iconId, toBarId, position)` - any bar
- [ ] `reorderIcon(iconId, barId, position)` - any bar
- [ ] `useDrawerState(barId, workspaceId)` - any bar

### Configuration ✅
- [ ] Icon bar registry (defines all bars)
- [ ] Icon registry (defines all icons)
- [ ] Default layout generator (from registries)

### Reuse Existing Code ✅
- [ ] Use `ResizableSidebar` for drawer animation
- [ ] Use Zustand persist pattern from `sub-chat-store.ts`
- [ ] Use atom families pattern from existing atoms

---

## Summary

This architecture is **future-proof** and **DRY-compliant**:

1. **Components are generic** - work for ANY configuration
2. **Logic is reusable** - no duplication
3. **Configuration drives behavior** - not code
4. **Extensible by design** - add bars/icons without code changes
5. **Type-safe** - TypeScript + Zod validation
6. **Reuses existing patterns** - proven in codebase

**Result**: A single implementation that scales from 2 bars to N bars with ZERO code changes.
