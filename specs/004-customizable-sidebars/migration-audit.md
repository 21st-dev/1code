# Migration Audit: Existing Navigation Patterns

**Date**: 2026-02-03
**Task**: MIG1-001 - Audit existing navigation patterns
**Purpose**: Document desktopViewAtom usage before migration

---

## 1. Current Navigation Architecture

### desktopViewAtom Definition

**Location**: `/src/renderer/features/agents/atoms/index.ts:871-872`

```typescript
export type DesktopView = "automations" | "automations-detail" | "inbox" | "settings" | null
export const desktopViewAtom = atom<DesktopView>(null)
```

**Pattern**: Global atom-based navigation with ternary rendering

---

## 2. Re-Export Chain

### Global Access Point

**Location**: `/src/renderer/lib/atoms/index.ts:77-85`

```typescript
// Desktop view navigation (Automations / Inbox)
export {
  desktopViewAtom,
  automationDetailIdAtom,
  automationTemplateParamsAtom,
  inboxSelectedChatIdAtom,
  agentsInboxSidebarWidthAtom,
  inboxMobileViewModeAtom,
  type DesktopView,
  type AutomationTemplateParams,
  type InboxMobileViewMode,
} from "../../features/agents/atoms"
```

**Integration Point**: Settings dialog uses derived atom pattern

```typescript
// Line 200-205
export const agentsSettingsDialogOpenAtom = atom(
  (get) => get(_desktopViewAtom) === "settings",
  (_get, set, open: boolean) => {
    set(_desktopViewAtom, open ? "settings" : null)
  }
)
```

**Pattern**: Derived atom bridges dialog open/close to navigation state

---

## 3. Rendering Logic

### Primary Rendering Location

**Location**: `/src/renderer/features/agents/ui/agents-content.tsx`

**Mobile View** (Lines 815-823):
```typescript
{desktopView === "settings" ? (
  <SettingsContent />
) : betaAutomationsEnabled && desktopView === "automations" ? (
  <AutomationsView />
) : betaAutomationsEnabled && desktopView === "automations-detail" ? (
  <AutomationsDetailView />
) : betaAutomationsEnabled && desktopView === "inbox" ? (
  <InboxView />
) : mobileViewMode === "chats" ? (
  // Chats List Mode (default)
```

**Desktop View** (Lines 953-961):
```typescript
{desktopView === "settings" ? (
  <SettingsContent />
) : betaAutomationsEnabled && desktopView === "automations" ? (
  <AutomationsView />
) : betaAutomationsEnabled && desktopView === "automations-detail" ? (
  <AutomationsDetailView />
) : betaAutomationsEnabled && desktopView === "inbox" ? (
  <InboxView />
) : selectedChatId ? (
  <div className="h-full flex flex-col relative overflow-hidden">
```

**Pattern**: Nested ternary operators with feature flag guards (`betaAutomationsEnabled`)

---

## 4. Navigation Trigger Points

### Sidebar Navigation Buttons

**Location**: `/src/renderer/features/sidebar/agents-sidebar.tsx`

#### Settings Navigation
- **Trigger**: Via `agentsSettingsDialogOpenAtom` (derived atom)
- **Method**: Set derived atom to `true`, which sets `desktopViewAtom` to `"settings"`

#### Inbox Button (Lines 1142-1184)
```typescript
const InboxButton = memo(function InboxButton() {
  const automationsEnabled = useAtomValue(betaAutomationsEnabledAtom)
  const desktopView = useAtomValue(desktopViewAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)

  const handleClick = useCallback(() => {
    setSelectedChatId(null)
    setSelectedDraftId(null)
    setShowNewChatForm(false)
    setDesktopView("inbox")  // ← NAVIGATION TRIGGER
  }, [setSelectedChatId, setSelectedDraftId, setShowNewChatForm, setDesktopView])

  const isActive = desktopView === "inbox"  // ← ACTIVE STATE CHECK
```

#### Automations Button (Similar pattern)
```typescript
// Line 1084
setDesktopView(null) // Clear automations/inbox view
```

#### New Workspace Button (Line 2551)
```typescript
// Clear navigation when creating new workspace
setDesktopView(null) // Clear automations/inbox view
```

**Pattern**: Direct atom mutation via `setDesktopView()`

---

## 5. Page Component Locations

### Existing Pages and Their Paths

| Page | Component | Import Path | Feature Flag |
|------|-----------|-------------|--------------|
| **Settings** | `SettingsContent` | `../../settings/settings-content` | None |
| **Automations** | `AutomationsView` | `../../automations` | `betaAutomationsEnabled` |
| **Automations Detail** | `AutomationsDetailView` | `../../automations` | `betaAutomationsEnabled` |
| **Inbox** | `InboxView` | `../../automations` | `betaAutomationsEnabled` |
| **Preview** | `AgentPreview` | `./agent-preview` | None (existing sidebar) |
| **Changes/Diff** | `AgentDiffView` | `./agent-diff-view` | None (existing sidebar) |
| **Terminal** | `TerminalSidebar` | `../../terminal` | None (existing sidebar) |

---

## 6. Sidebar Width Atoms (Already Using Jotai)

**Location**: Various atoms in `/src/renderer/features/agents/atoms/index.ts`

```typescript
// Existing width atoms (REUSABLE)
agentsSidebarWidthAtom            // Left chat sidebar
agentsPreviewSidebarWidthAtom     // Preview sidebar
agentsDiffSidebarWidthAtom        // Diff sidebar
agentsInboxSidebarWidthAtom       // Inbox sidebar (for Automations)
agentsSubChatsSidebarWidthAtom    // Sub-chats sidebar
agentsChangesPanelWidthAtom       // Changes panel width
```

**Storage Pattern**: `atomWithWindowStorage` for per-window persistence

---

## 7. Migration Implications

### What Needs to Change

1. **Remove ternary rendering** in `agents-content.tsx`
   - Lines 815-823 (mobile)
   - Lines 953-961 (desktop)

2. **Replace navigation buttons** in `agents-sidebar.tsx`
   - Remove `setDesktopView()` calls
   - Wire up new drawer state atoms

3. **Deprecate desktopViewAtom** in `features/agents/atoms/index.ts`
   - Keep temporarily for backward compatibility
   - Create derived atom bridge during migration

4. **Update Settings dialog integration**
   - Modify `agentsSettingsDialogOpenAtom` to use new drawer state
   - Maintain open/close behavior

### What Can Be Reused

1. ✅ **All width atoms** - Direct mapping to new drawer widths
2. ✅ **Component lazy loading** - All pages already lazy-loaded
3. ✅ **Feature flags** - `betaAutomationsEnabled` guards remain
4. ✅ **Window storage pattern** - Keep `atomWithWindowStorage` approach

### Breaking Change Risks

**High Risk**:
- Settings dialog (`agentsSettingsDialogOpenAtom`) - used in multiple places
- Mobile view mode - complex ternary logic with `mobileViewMode`

**Medium Risk**:
- Automations/Inbox navigation - guarded by feature flag (small user base)
- Quick-switch behavior (Ctrl+Tab) - may need adjustments

**Low Risk**:
- Preview/Diff/Terminal sidebars - already independent
- Width persistence - straightforward migration

---

## 8. Recommended Migration Path

### Phase 1: Create Infrastructure (Non-Breaking)
- Build generic icon bar system
- DO NOT touch `desktopViewAtom` yet

### Phase 2: Feature Flag Parallel Implementation
- Add `useNewIconBarSystemAtom` flag
- Conditional rendering: `{useNewSystem ? <CustomizableLayout> : <OldLayout>}`

### Phase 3: Navigation Migration
- Replace `setDesktopView()` calls with drawer state
- Create bridge atom: `desktopView` ← `drawerState.activeIconId`

### Phase 4: Deprecation
- Remove `desktopViewAtom`
- Remove ternary rendering
- Remove feature flag

### Phase 5: User Data Migration
- Migrate existing width atoms to new drawer widths
- Initialize default icon layout

---

## 9. Files to Update During Migration

### High Priority (Core Navigation)
- `/src/renderer/features/agents/ui/agents-content.tsx` - Remove ternary rendering
- `/src/renderer/features/sidebar/agents-sidebar.tsx` - Replace navigation buttons
- `/src/renderer/features/agents/atoms/index.ts` - Deprecate `desktopViewAtom`

### Medium Priority (Integration)
- `/src/renderer/lib/atoms/index.ts` - Update `agentsSettingsDialogOpenAtom`
- `/src/renderer/features/layout/agents-layout.tsx` - Add feature flag conditional

### Low Priority (Testing)
- All files that import `desktopViewAtom` (10 files total)

---

## 10. Testing Strategy

### Critical Test Cases
1. **Settings Dialog**: Open/close via icon, via keyboard shortcut
2. **Automations/Inbox**: Navigate between views (if feature flag enabled)
3. **New Workspace**: Verify navigation clears when creating new workspace
4. **Mobile Mode**: Verify fullscreen navigation still works
5. **Width Persistence**: Verify drawer widths persist across restarts

### Regression Risks
- Settings tabs not persisting after navigation
- Mobile view mode switching broken
- Quick-switch (Ctrl+Tab) stops working
- Automations template params lost on navigation

---

## Summary

**Current System**: Global `desktopViewAtom` with nested ternary rendering in `agents-content.tsx`

**Navigation Triggers**: Direct atom mutation via `setDesktopView()` in sidebar buttons

**Pages**: 7 total (Settings, Automations, Automations Detail, Inbox, Preview, Diff, Terminal)

**Reusable Assets**: All width atoms, lazy-loaded components, window storage pattern

**Migration Complexity**: Medium-High (due to Settings dialog integration and mobile view mode)

**Recommended Approach**: Feature flag → Parallel implementation → Gradual migration → Deprecation

---

**Status**: ✅ Audit Complete
**Next Step**: MIG1-002 - Identify all existing pages in `src/renderer/features/`
