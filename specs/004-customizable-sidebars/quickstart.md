# Developer Quickstart: Customizable Dual Drawers

**Feature**: 004-customizable-sidebars
**Last Updated**: 2026-02-03

Welcome! This guide will help you understand and contribute to the customizable dual drawer system.

---

## What is this feature?

A dual drawer system where users can:
- **Customize icon placement** between a horizontal top action bar and vertical right icon bar
- **Drag-and-drop icons** to reorganize layout
- **Open two drawers simultaneously** (one from each icon group) that slide in from the right side
- **Persist preferences** locally across app restarts

---

## Quick Links

- **Spec**: [spec.md](./spec.md) - User requirements and acceptance criteria
- **Plan**: [plan.md](./plan.md) - Implementation strategy
- **Research**: [research.md](./research.md) - Technology choices and patterns
- **Data Model**: [data-model.md](./data-model.md) - State structure and validation
- **Contracts**: [contracts/](./contracts/) - TypeScript interfaces and schemas

---

## Architecture Overview

### State Management

```
┌─────────────────────────────────────────────────────────────┐
│                      Application State                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐        ┌──────────────────────┐   │
│  │   Jotai Atoms        │        │   Zustand Store      │   │
│  │  (Runtime State)     │        │  (Persisted State)   │   │
│  ├──────────────────────┤        ├──────────────────────┤   │
│  │ - Drawer open/close  │        │ - Icon placement     │   │
│  │ - Active page        │        │ - Icon order         │   │
│  │ - Drawer widths      │        │ - User config        │   │
│  │ - Drag operation     │        │                      │   │
│  └──────────────────────┘        └──────────────────────┘   │
│           ↑                                ↑                 │
│           │                                │                 │
│           │                                └──────────────┐  │
│           │                                               │  │
└───────────┼───────────────────────────────────────────────┼──┘
            │                                               │
            │                                               │
    ┌───────┴────────┐                            ┌────────┴─────────┐
    │  Components    │                            │   localStorage   │
    │  - IconBars    │                            │   (Persist)      │
    │  - Drawers     │                            └──────────────────┘
    │  - DragDrop    │
    └────────────────┘
```

### Component Hierarchy

```
App
└── CustomizableDrawersLayout
    ├── MainContent
    ├── TopActionBar (horizontal, at top)
    │   └── IconButton[] (draggable)
    ├── RightIconBar (vertical, right edge)
    │   └── IconButton[] (draggable)
    ├── TopDrawer (slides from right, left position)
    │   └── DrawerContent
    │       ├── DrawerHeader (with close button)
    │       ├── PageNavigation (tabs)
    │       └── ActivePage (from icon)
    └── RightDrawer (slides from right, right position)
        └── DrawerContent
            ├── DrawerHeader (with close button)
            ├── PageNavigation (tabs)
            └── ActivePage (from icon)
```

---

## Key Files

### Core Implementation (to be created)

```
src/renderer/features/layout/
├── components/
│   ├── CustomizableDrawersLayout.tsx   # Main layout wrapper
│   ├── TopActionBar.tsx                # Horizontal icon bar
│   ├── RightIconBar.tsx                # Vertical icon bar
│   ├── IconButton.tsx                  # Draggable icon
│   ├── Drawer.tsx                      # Drawer wrapper (uses ResizableSidebar)
│   ├── DrawerContent.tsx               # Drawer inner content
│   └── DragDropProvider.tsx            # dnd-kit context
├── atoms/
│   └── drawer-atoms.ts                 # Jotai atoms for runtime state
├── stores/
│   └── icon-layout-store.ts            # Zustand store for persistence
├── hooks/
│   ├── useDrawerState.ts               # Drawer open/close logic
│   └── useIconDragDrop.ts              # Drag-drop handlers
├── schemas/
│   └── icon-config.schema.ts           # Zod validation schemas
└── constants/
    └── available-icons.ts              # Icon registry
```

### Existing Code to Reuse

```
src/renderer/components/ui/
└── resizable-sidebar.tsx               # ✅ Reuse for drawer animation

src/renderer/features/agents/stores/
└── sub-chat-store.ts                   # ✅ Reference for Zustand patterns

src/renderer/contexts/
└── WindowContext.tsx                   # ✅ Use for getWindowId()
```

---

## Getting Started

### 1. Install Dependencies

```bash
bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
```

(Zustand, Jotai, Zod, Motion already installed)

### 2. Copy Contracts to Codebase

```bash
# Copy TypeScript interfaces
cp specs/004-customizable-sidebars/contracts/types.ts \
   src/renderer/features/layout/types.ts

# Copy Zod schemas
cp specs/004-customizable-sidebars/contracts/schemas.ts \
   src/renderer/features/layout/schemas/icon-config.schema.ts
```

### 3. Create Icon Registry

```typescript
// src/renderer/features/layout/constants/available-icons.ts
import { Bot, Terminal, FileText, Settings, HelpCircle } from 'lucide-react'
import { lazy } from 'react'
import type { Icon } from '../types'

export const AVAILABLE_ICONS: Icon[] = [
  {
    id: 'agents',
    label: 'AI Agents',
    icon: Bot,
    page: lazy(() => import('../pages/AgentsPage')),
    defaultBar: 'topBar',
  },
  // ... add more icons
]

export const ICON_MAP = new Map(AVAILABLE_ICONS.map(i => [i.id, i]))
```

### 4. Implement Zustand Store

Follow the pattern in [data-model.md](./data-model.md#zustand-store-with-persist-middleware)

```typescript
// src/renderer/features/layout/stores/icon-layout-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { validateIconLayoutConfig, DEFAULT_ICON_LAYOUT } from '../schemas/icon-config.schema'
import type { IconLayoutStore } from '../types'

export const useIconLayoutStore = create<IconLayoutStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_ICON_LAYOUT,

      moveIcon: (iconId, toBar, newPosition) => {
        // Implementation...
      },

      // ... other actions
    }),
    {
      name: `${getWindowId()}:icon-layout-config`,
      version: 1,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[IconLayoutStore] Rehydration error:', error)
        }
      },
    }
  )
)
```

### 5. Create Jotai Atoms

```typescript
// src/renderer/features/layout/atoms/drawer-atoms.ts
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { atomFamily } from 'jotai/utils'

// Per-workspace open/close state
export const topDrawerOpenAtomFamily = atomFamily((workspaceId: string) =>
  atom<boolean>(false)
)

export const rightDrawerOpenAtomFamily = atomFamily((workspaceId: string) =>
  atom<boolean>(false)
)

// Global widths (persisted)
export const topDrawerWidthAtom = atomWithStorage('top-drawer-width', 400)
export const rightDrawerWidthAtom = atomWithStorage('right-drawer-width', 400)
```

### 6. Implement Drag-Drop with dnd-kit

See [research.md](./research.md#key-implementation-patterns) for complete examples.

```typescript
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'

function TopActionBar() {
  const { config } = useIconLayoutStore()
  const topBarIcons = config.topBar.map(c => ICON_MAP.get(c.id)!)

  return (
    <SortableContext items={config.topBar} strategy={horizontalListSortingStrategy}>
      <div className="flex gap-2">
        {topBarIcons.map(icon => (
          <SortableIcon key={icon.id} icon={icon} />
        ))}
      </div>
    </SortableContext>
  )
}
```

---

## Testing

### Unit Tests

```bash
# Test icon layout store actions
bun test src/renderer/features/layout/stores/icon-layout-store.test.ts

# Test validation functions
bun test src/renderer/features/layout/schemas/icon-config.schema.test.ts
```

### E2E Tests

```bash
# Test complete drag-drop flow
bun test tests/e2e/layout/icon-customization.spec.ts
```

**Test Scenarios**:
1. Drag icon from top bar to right bar
2. Reorder icons within same bar
3. Open both drawers simultaneously
4. Close drawer via icon toggle
5. Close drawer via close button (X)
6. Persist config and restore on restart

---

## Common Tasks

### Adding a New Icon

1. **Create the page component**:
```typescript
// src/renderer/features/layout/pages/MyNewPage.tsx
export function MyNewPage() {
  return <div>My New Page Content</div>
}
```

2. **Add to icon registry**:
```typescript
// src/renderer/features/layout/constants/available-icons.ts
import { MyIcon } from 'lucide-react'
import { lazy } from 'react'

export const AVAILABLE_ICONS: Icon[] = [
  // ... existing icons
  {
    id: 'my-new-icon',
    label: 'My New Feature',
    icon: MyIcon,
    page: lazy(() => import('../pages/MyNewPage')),
    defaultBar: 'topBar', // or 'rightBar'
  },
]
```

3. **Update default layout** (optional):
```typescript
// In schemas/icon-config.schema.ts
export const DEFAULT_ICON_LAYOUT: IconLayoutConfig = {
  version: 1,
  topBar: [
    { id: 'agents', position: 0 },
    { id: 'my-new-icon', position: 1 }, // Add here
    // ...
  ],
  rightBar: [/* ... */],
  lastModified: new Date().toISOString(),
}
```

4. **Icon will automatically appear** for existing users via reconciliation logic

### Debugging State Issues

```typescript
// Add to DevTools (Chrome/Firefox)
import { devtools } from 'zustand/middleware'

export const useIconLayoutStore = create<IconLayoutStore>()(
  devtools(
    persist(
      (set, get) => ({ /* ... */ }),
      { name: 'icon-layout-config' }
    ),
    { name: 'IconLayoutStore' }
  )
)

// Now inspect in Redux DevTools
```

### Handling Corrupted localStorage

The store automatically handles corrupted data:

1. Zod validation catches invalid schema
2. Falls back to `DEFAULT_ICON_LAYOUT`
3. Shows user-friendly toast notification
4. Clears corrupted data from localStorage

To manually reset:
```typescript
const { resetToDefaults } = useIconLayoutStore()
resetToDefaults()
```

---

## Performance Tips

1. **Memoize icon components**:
```typescript
export const IconButton = React.memo(({ icon, isActive, onClick }: IconButtonProps) => {
  return <button onClick={onClick}>{/* ... */}</button>
})
```

2. **Lazy load pages**:
```typescript
const AgentsPage = lazy(() => import('./pages/AgentsPage'))
```

3. **Disable animations during drag**:
```typescript
// dnd-kit automatically uses CSS transforms (hardware accelerated)
// No additional work needed
```

4. **Debounce expensive operations** (already handled by Zustand persist)

---

## Troubleshooting

### Icons not appearing after drag-drop

**Check**:
1. Is `moveIcon` or `reorderIcon` being called?
2. Are positions being reindexed correctly?
3. Check Redux DevTools for state changes

**Debug**:
```typescript
const { config } = useIconLayoutStore()
console.log('Current config:', config)
```

### Drawer not animating

**Check**:
1. Is `ResizableSidebar` receiving correct props?
2. Is `animationDuration` set correctly?
3. Is Motion provider wrapping the app?

**Debug**:
```typescript
<ResizableSidebar
  isOpen={isOpen}
  animationDuration={0.25} // Should be > 0
  side="right"
  // ...
/>
```

### localStorage not persisting

**Check**:
1. Is localStorage available (not in private browsing)?
2. Is window ID correct?
3. Is Zustand persist middleware configured?

**Debug**:
```typescript
// Check localStorage directly
console.log(localStorage.getItem(`${getWindowId()}:icon-layout-config`))
```

---

## Additional Resources

- **dnd-kit Docs**: https://docs.dndkit.com
- **Zustand Docs**: https://zustand.docs.pmnd.rs
- **Jotai Docs**: https://jotai.org
- **Zod Docs**: https://zod.dev
- **Motion Docs**: https://motion.dev

---

## Need Help?

- Check the [spec](./spec.md) for user requirements
- Check the [data model](./data-model.md) for state structure
- Check the [research](./research.md) for implementation patterns
- Review existing code in `sub-chat-store.ts` and `resizable-sidebar.tsx`

Happy coding! 🚀
