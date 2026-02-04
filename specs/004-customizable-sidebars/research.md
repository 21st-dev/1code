# Research Report: Customizable Dual Drawers with Icon Bars

**Date**: 2026-02-03
**Feature**: 004-customizable-sidebars
**Purpose**: Resolve technical unknowns and establish implementation patterns

---

## 1. Drag-and-Drop Library Selection

### Decision: **dnd-kit** v6.3.1

**Rationale**:
- **Modern & Maintained**: 5.4M weekly downloads, React 19 compatible
- **Lightweight**: ~10KB minified, zero external dependencies
- **TypeScript First**: Full type inference out of the box
- **Performance**: CSS transforms (translate3d), lazy calculations
- **Accessibility Built-in**: WCAG compliant keyboard navigation and screen readers

**Alternatives Considered**:
- ❌ **react-beautiful-dnd**: Deprecated in 2022 by Atlassian
- ⚠️ **react-dnd**: Still maintained but dated API, better for complex multi-type scenarios
- ✅ **dnd-kit**: Best choice for modern React projects (2026)

### Key Implementation Patterns

**Multiple Container Setup** (Horizontal ↔ Vertical):
```typescript
import { DndContext, DragOverlay, closestCenter, pointerWithin } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy } from '@dnd-kit/sortable';

<DndContext
  sensors={sensors}
  collisionDetection={pointerWithin} // Best for multiple containers
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  {/* Horizontal Bar */}
  <SortableContext items={topBarIcons} strategy={horizontalListSortingStrategy}>
    {topBarIcons.map(icon => <SortableIcon key={icon.id} {...icon} />)}
  </SortableContext>

  {/* Vertical Bar */}
  <SortableContext items={rightBarIcons} strategy={verticalListSortingStrategy}>
    {rightBarIcons.map(icon => <SortableIcon key={icon.id} {...icon} />)}
  </SortableContext>

  <DragOverlay>
    {activeId ? <IconPreview id={activeId} /> : null}
  </DragOverlay>
</DndContext>
```

**Visual Feedback**:
- Use `DragOverlay` for drag preview (always keep mounted)
- Apply opacity to source item during drag
- Use `cursor: grabbing` during drag
- Add drop animations with `defaultDropAnimationSideEffects`

**Accessibility**:
- Enable keyboard navigation: `KeyboardSensor` with `sortableKeyboardCoordinates`
- Provide screen reader announcements via `announcements` prop
- Add `tabIndex={0}` to draggable items

**Best Practices**:
- Use modifiers for constraints: `restrictToWindowEdges`, `restrictToVerticalAxis`
- Keep dragged items in DOM (hide with opacity) to preserve `active.data.current`
- Single `DndContext` for cross-container dragging
- Memoize components with `React.memo` for performance

---

## 2. Drawer Animation & Layout System

### Decision: **Extend existing `ResizableSidebar` component with Motion**

**Rationale**:
- **Already proven**: Codebase successfully uses `ResizableSidebar` for Plan, Diff, Preview, Terminal sidebars
- **Motion integration**: Framer Motion (v11.15.0) already in dependencies
- **Performance optimized**: Local state during resize, disabled animations during drag
- **Type-safe**: Full TypeScript support with Jotai atoms
- **Consistent patterns**: Follows existing codebase architecture

### Current Architecture (Foundation)

From `src/renderer/components/ui/resizable-sidebar.tsx`:
- **Multiple simultaneous sidebars**: Already supported (Plan + Diff + Preview open together)
- **Independent state**: Each sidebar has own Jotai atom for width
- **Smooth animations**: Motion handles slide-in/out with configurable duration
- **Resize support**: Drag-to-resize with min/max constraints
- **Window isolation**: Atom keys scoped per window

### Implementation Pattern for Dual Drawers

**Layout Structure**:
```tsx
<div className="flex h-full">
  {/* Main content */}
  <div className="flex-1 overflow-hidden">{children}</div>

  {/* Top Bar Drawer - renders first (z-index handled by DOM order) */}
  <ResizableSidebar
    isOpen={isTopDrawerOpen}
    onClose={() => setTopDrawerOpen(false)}
    widthAtom={topDrawerWidthAtom}
    side="right"
    minWidth={350}
    maxWidth={700}
    animationDuration={0.25} // 250ms smooth
  >
    <DrawerContent />
  </ResizableSidebar>

  {/* Right Bar Drawer - renders second */}
  <ResizableSidebar
    isOpen={isRightDrawerOpen}
    onClose={() => setRightDrawerOpen(false)}
    widthAtom={rightDrawerWidthAtom}
    side="right"
    minWidth={350}
    maxWidth={700}
    animationDuration={0.25}
  >
    <DrawerContent />
  </ResizableSidebar>
</div>
```

**Key Points**:
- **Side-by-side positioning**: Multiple `ResizableSidebar` components in flex layout
- **Independent widths**: Each drawer has separate Jotai atom (persisted to localStorage)
- **No z-index conflicts**: DOM order + flexbox handles stacking naturally
- **Consistent width**: Width doesn't change when second drawer opens (FR-003a requirement)

### Animation Settings

**Recommended**:
- **Drawer slide**: `animationDuration={0.25}` (250ms) - feels responsive
- **Page transitions**: 150ms with Motion's `AnimatePresence`
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (already in codebase)

**Performance Optimizations**:
- Add `willChange: "width"` during resize operations
- Use local state during drag (prevents atom updates on every mousemove)
- Disable animations during resize: `duration: isResizing ? 0 : animationDuration`

### Alternative Considered: Radix UI Sheet

**Rejected because**:
- Context conflicts with multiple simultaneous instances (requires `createDialogScope` workaround)
- Designed for modal-like drawers with overlay, not side-by-side panels
- Less flexible than current `ResizableSidebar` pattern
- Would require refactoring existing code unnecessarily

---

## 3. State Persistence Strategy

### Decision: **Zustand with localStorage + Zod validation**

**Rationale**:
- **Consistency**: Already using Zustand for sub-chat state (`sub-chat-store.ts`)
- **Type Safety**: Full TypeScript inference
- **Migration Support**: Built-in versioning via persist middleware
- **Runtime Validation**: Zod catches corrupted/invalid data
- **Window Isolation**: Follows existing pattern of `windowId` prefixed keys
- **Performance**: localStorage is ideal for small config data (<5MB)

**Alternatives Considered**:
- ❌ **electron-store**: Too heavy (JSON file I/O), overkill for simple UI config
- ❌ **IndexedDB**: Slow for small data (transaction overhead), unnecessary complexity
- ❌ **Direct localStorage**: No migration support, no type safety, manual error handling

### Schema Definition

```typescript
// schemas/icon-config.schema.ts
import { z } from 'zod'

export const IconConfigSchema = z.object({
  id: z.string().min(1), // Icon identifier
  position: z.number().int().nonnegative(), // Position in bar (0-indexed)
})

export const IconLayoutConfigSchema = z.object({
  version: z.literal(1), // Schema version for migrations
  topBar: z.array(IconConfigSchema),
  rightBar: z.array(IconConfigSchema),
  lastModified: z.string().datetime(), // ISO 8601
})

export type IconLayoutConfig = z.infer<typeof IconLayoutConfigSchema>

export const DEFAULT_ICON_LAYOUT: IconLayoutConfig = {
  version: 1,
  topBar: [
    { id: 'agents', position: 0 },
    { id: 'terminal', position: 1 },
    { id: 'files', position: 2 },
  ],
  rightBar: [
    { id: 'settings', position: 0 },
    { id: 'help', position: 1 },
  ],
  lastModified: new Date().toISOString(),
}
```

### Zustand Store Pattern

```typescript
// stores/icon-layout-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getWindowId } from '../../../contexts/WindowContext'

interface IconLayoutStore {
  config: IconLayoutConfig
  moveIcon: (iconId: string, toBar: 'topBar' | 'rightBar', newPosition: number) => void
  reorderIcon: (iconId: string, bar: 'topBar' | 'rightBar', newPosition: number) => void
  resetToDefaults: () => void
}

const getStorageKey = () => `${getWindowId()}:icon-layout-config`

const validateAndParse = (stored: unknown): IconLayoutConfig => {
  const result = IconLayoutConfigSchema.safeParse(stored)
  return result.success ? result.data : DEFAULT_ICON_LAYOUT
}

export const useIconLayoutStore = create<IconLayoutStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_ICON_LAYOUT,

      moveIcon: (iconId, toBar, newPosition) => {
        // Move icon between bars, reindex positions
        const { config } = get()
        const fromBar = config.topBar.some(i => i.id === iconId) ? 'topBar' : 'rightBar'

        const sourceBar = config[fromBar].filter(i => i.id !== iconId)
        const destBar = [...config[toBar]]
        destBar.splice(newPosition, 0, { id: iconId, position: newPosition })

        set({
          config: {
            ...config,
            [fromBar]: sourceBar.map((icon, idx) => ({ ...icon, position: idx })),
            [toBar]: destBar.map((icon, idx) => ({ ...icon, position: idx })),
            lastModified: new Date().toISOString(),
          },
        })
      },

      reorderIcon: (iconId, bar, newPosition) => {
        // Reorder within same bar
        const { config } = get()
        const currentBar = [...config[bar]]
        const currentIndex = currentBar.findIndex(i => i.id === iconId)

        const [removed] = currentBar.splice(currentIndex, 1)
        currentBar.splice(newPosition, 0, removed)

        set({
          config: {
            ...config,
            [bar]: currentBar.map((icon, idx) => ({ ...icon, position: idx })),
            lastModified: new Date().toISOString(),
          },
        })
      },

      resetToDefaults: () => {
        set({ config: { ...DEFAULT_ICON_LAYOUT, lastModified: new Date().toISOString() } })
      },
    }),
    {
      name: getStorageKey(),
      version: 1,
      migrate: (persistedState, version) => {
        // Handle future schema migrations
        if (version === 0) {
          // Migrate from v0 to v1
        }
        return DEFAULT_ICON_LAYOUT
      },
    }
  )
)
```

### Migration & Error Handling Strategy

**Multi-Layered Defense**:

1. **Zod Validation** (Layer 1): Runtime type checking before loading
2. **Version Migration** (Layer 2): Handle schema changes across app versions
3. **Normalization** (Layer 3): Clean up inconsistencies (duplicates, non-sequential positions)
4. **Icon Reconciliation** (Layer 4): Handle new/removed icons across versions

**Error Handling**:
```typescript
const safeLoadFromLocalStorage = <T>(
  key: string,
  schema: z.ZodSchema<T>,
  fallback: T
): T => {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return fallback

    const parsed = JSON.parse(stored)
    const result = schema.safeParse(parsed)

    if (result.success) return result.data

    // Invalid data - clear and use fallback
    localStorage.removeItem(key)
    return fallback
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'QuotaExceededError') {
        console.error('Storage quota exceeded')
      } else if (error.name === 'SecurityError') {
        console.error('Security error (private browsing?)')
      }
    } else if (error instanceof SyntaxError) {
      console.error('JSON parse error - corrupted data')
      localStorage.removeItem(key)
    }
    return fallback
  }
}
```

**User-Facing Error Messages**:
- **Quota exceeded**: "Storage full - icon layout not saved"
- **Security error**: "Private browsing mode - layout will reset on close"
- **Corruption**: "Configuration reset to defaults"

---

## 4. Alignment with Existing Codebase

### Proven Patterns to Reuse

From `src/renderer/features/agents/stores/sub-chat-store.ts`:
- ✅ Window-scoped storage keys: `${getWindowId()}:key`
- ✅ Safe localStorage with try-catch
- ✅ Fallback to defaults on error
- ✅ Migration from legacy keys

From `src/renderer/components/ui/resizable-sidebar.tsx`:
- ✅ Motion animations with configurable duration
- ✅ Local state during resize for performance
- ✅ Jotai atoms for persistent width
- ✅ Multiple simultaneous sidebars

### Extensions to Existing Patterns

**New additions**:
- Runtime validation with Zod
- Formal versioning system (Zustand persist middleware)
- Comprehensive error handling (all localStorage error types)
- Icon reconciliation for version changes

---

## 5. Installation & Dependencies

**New Dependencies**:
```bash
bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
bun add zod  # If not already installed
```

**Existing Dependencies** (already in package.json):
- ✅ `zustand` - State management
- ✅ `jotai` - Atom-based state
- ✅ `motion` (framer-motion) - Animations
- ✅ `@radix-ui/*` - UI primitives

---

## 6. Implementation Checklist

### Phase 0: Foundation ✅
- [x] Research drag-drop libraries → **dnd-kit**
- [x] Research drawer patterns → **Extend ResizableSidebar**
- [x] Research state persistence → **Zustand + localStorage + Zod**

### Phase 1: Data Model & Contracts (Next)
- [ ] Define TypeScript interfaces for icons, drawers, config
- [ ] Create Zod schemas for validation
- [ ] Design Zustand store structure
- [ ] Document state flow and update patterns

### Phase 2: Implementation (Future)
- [ ] Implement icon bars with drag-drop
- [ ] Extend ResizableSidebar for dual drawers
- [ ] Integrate state persistence
- [ ] Add error handling and user feedback

---

## References

- [dnd-kit Documentation](https://docs.dndkit.com)
- [dnd-kit Multiple Containers Example](https://github.com/clauderic/dnd-kit/blob/master/stories/2%20-%20Presets/Sortable/MultipleContainers.tsx)
- [Zustand Persist Middleware](https://zustand.docs.pmnd.rs/middlewares/persist)
- [Zod Schema Validation](https://github.com/colinhacks/zod)
- [Framer Motion Layout Animations](https://motion.dev/docs/react-layout-animations)
- [localStorage Error Handling](http://crocodillon.com/blog/always-catch-localstorage-security-and-quota-exceeded-errors)
- [Existing Codebase]: `src/renderer/components/ui/resizable-sidebar.tsx`, `src/renderer/features/agents/stores/sub-chat-store.ts`
