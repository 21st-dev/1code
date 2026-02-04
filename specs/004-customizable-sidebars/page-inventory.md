# Page Inventory: Existing Pages for Icon Registry

**Date**: 2026-02-03
**Task**: MIG1-002 - Identify all existing pages
**Purpose**: Map all page components that can be added to icon bars

---

## 1. Existing Pages (Currently in desktopViewAtom)

### Settings Page
- **Component**: `SettingsContent`
- **Import Path**: `/src/renderer/features/settings/settings-content.tsx`
- **Current Access**: Via `desktopViewAtom === "settings"`
- **Feature Flag**: None
- **Recommended Icon**: `Settings` (lucide-react)
- **Icon ID**: `settings`
- **Default Bar**: `right`
- **Description**: Application settings with 12 tabs (Profile, Appearance, Preferences, Models, Skills, Agents, MCP, Plugins, Worktrees, Projects, Debug, Beta, Keyboard)

### Automations View
- **Component**: `AutomationsView`
- **Import Path**: `/src/renderer/features/automations/automations-view.tsx`
- **Current Access**: Via `desktopViewAtom === "automations"`
- **Feature Flag**: `betaAutomationsEnabled`
- **Recommended Icon**: `SidebarAutomationsIcon` (custom SVG) or `Zap` (lucide-react)
- **Icon ID**: `automations`
- **Default Bar**: `top`
- **Description**: Automations list and management interface

### Automations Detail View
- **Component**: `AutomationsDetailView`
- **Import Path**: `/src/renderer/features/automations/automations-detail-view.tsx`
- **Current Access**: Via `desktopViewAtom === "automations-detail"`
- **Feature Flag**: `betaAutomationsEnabled`
- **Recommended Icon**: N/A (Detail view, not icon-accessible)
- **Icon ID**: N/A
- **Default Bar**: N/A
- **Description**: Detailed view of a specific automation (navigated from AutomationsView)

### Inbox View
- **Component**: `InboxView`
- **Import Path**: `/src/renderer/features/automations/inbox-view.tsx`
- **Current Access**: Via `desktopViewAtom === "inbox"`
- **Feature Flag**: `betaAutomationsEnabled`
- **Recommended Icon**: `SidebarInboxIcon` (custom SVG) or `Inbox` (lucide-react)
- **Icon ID**: `inbox`
- **Default Bar**: `top`
- **Description**: Inbox for automation notifications and messages

---

## 2. Existing Sidebar Panels (Already Independent)

### Preview Sidebar
- **Component**: `AgentPreview`
- **Import Path**: `/src/renderer/features/agents/ui/agent-preview.tsx`
- **Current Access**: Via `agentsPreviewSidebarOpenAtom`
- **Feature Flag**: None
- **Recommended Icon**: `Eye` (lucide-react)
- **Icon ID**: `preview`
- **Default Bar**: `top`
- **Width Atom**: `agentsPreviewSidebarWidthAtom`
- **Description**: Live preview of web pages with desktop/mobile viewport modes

### Changes/Diff View
- **Component**: `AgentDiffView`
- **Import Path**: `/src/renderer/features/agents/ui/agent-diff-view.tsx`
- **Current Access**: Via `agentsDiffSidebarOpenAtom`
- **Feature Flag**: None
- **Recommended Icon**: `GitBranch` (lucide-react) or `FileCode` (lucide-react)
- **Icon ID**: `changes`
- **Default Bar**: `top`
- **Width Atom**: `agentsDiffSidebarWidthAtom`
- **Description**: Git diff view showing file changes with staging and commit UI

### Terminal Sidebar
- **Component**: `TerminalSidebar`
- **Import Path**: `/src/renderer/features/terminal/terminal-sidebar.tsx`
- **Current Access**: Via `terminalSidebarOpenAtomFamily(chatId)`
- **Feature Flag**: None
- **Recommended Icon**: `Terminal` (lucide-react)
- **Icon ID**: `terminal`
- **Default Bar**: `top`
- **Description**: Integrated terminal for command execution

---

## 3. Additional Pages (Not Currently in Navigation)

### Kanban View
- **Component**: `KanbanView`
- **Import Path**: `/src/renderer/features/kanban/kanban-view.tsx`
- **Current Access**: Via `showNewChatForm === false` and `betaKanbanEnabled`
- **Feature Flag**: `betaKanbanEnabled`
- **Recommended Icon**: `Columns3` (lucide-react)
- **Icon ID**: `kanban`
- **Default Bar**: `top`
- **Description**: Kanban board view for workspaces

### Changes View (Full Page)
- **Component**: `ChangesView`
- **Import Path**: `/src/renderer/features/changes/changes-view.tsx`
- **Current Access**: Unknown (may be deprecated in favor of AgentDiffView)
- **Feature Flag**: None
- **Recommended Icon**: N/A (duplicate functionality?)
- **Icon ID**: N/A
- **Default Bar**: N/A
- **Description**: Alternative changes/diff view

### History View
- **Component**: `HistoryView`
- **Import Path**: `/src/renderer/features/changes/components/history-view/history-view.tsx`
- **Current Access**: Embedded in ChangesView
- **Feature Flag**: None
- **Recommended Icon**: `History` (lucide-react)
- **Icon ID**: `history`
- **Default Bar**: `right`
- **Description**: Git commit history viewer

### SpecKit Sidebar
- **Component**: `SpecKitSidebar`
- **Import Path**: `/src/renderer/features/speckit/components/speckit-sidebar.tsx`
- **Current Access**: Unknown
- **Feature Flag**: Unknown
- **Recommended Icon**: `FileText` (lucide-react) or `Book` (lucide-react)
- **Icon ID**: `speckit`
- **Default Bar**: `right`
- **Description**: SpecKit feature specification tools

### File Viewer Sidebar
- **Component**: `FileViewerSidebar`
- **Import Path**: `/src/renderer/features/file-viewer/components/file-viewer-sidebar.tsx`
- **Current Access**: Unknown
- **Feature Flag**: None
- **Recommended Icon**: `FolderTree` (lucide-react) or `Files` (lucide-react)
- **Icon ID**: `files`
- **Default Bar**: `right`
- **Description**: File browser and viewer

### Details Sidebar
- **Component**: `DetailsSidebar`
- **Import Path**: `/src/renderer/features/details-sidebar/details-sidebar.tsx`
- **Current Access**: Unknown
- **Feature Flag**: None
- **Recommended Icon**: `Info` (lucide-react)
- **Icon ID**: `details`
- **Default Bar**: `right`
- **Description**: Details panel for selected items

### Expanded Widget Sidebar
- **Component**: `ExpandedWidgetSidebar`
- **Import Path**: `/src/renderer/features/details-sidebar/expanded-widget-sidebar.tsx`
- **Current Access**: From DetailsSidebar
- **Feature Flag**: None
- **Recommended Icon**: N/A (child component)
- **Icon ID**: N/A
- **Default Bar**: N/A
- **Description**: Expanded view of sidebar widgets

---

## 4. Sub-Chats Sidebar (Existing, Not Icon-Based)

### Sub-Chats Sidebar
- **Component**: `AgentsSubChatsSidebar`
- **Import Path**: `/src/renderer/features/sidebar/agents-subchats-sidebar.tsx`
- **Current Access**: Via `agentsSubChatsSidebarModeAtom`
- **Mode**: `sidebar | tabs | off`
- **Recommended Icon**: N/A (tab-based navigation, not drawer)
- **Icon ID**: N/A
- **Default Bar**: N/A
- **Description**: Sub-chat tabs and navigation (already has dedicated UI)

### Main Sidebar (Chats List)
- **Component**: `AgentsSidebar`
- **Import Path**: `/src/renderer/features/sidebar/agents-sidebar.tsx`
- **Current Access**: Always visible (left sidebar)
- **Recommended Icon**: N/A (primary navigation, not drawer)
- **Icon ID**: N/A
- **Default Bar**: N/A
- **Description**: Main chat list and workspace navigation

---

## 5. Recommended Icon Registry (Initial Migration)

### Phase 1: Core Pages (Map Existing desktopViewAtom Pages)

| Icon ID | Label | Icon | Component | Import Path | Feature Flag | Default Bar | Allowed Bars |
|---------|-------|------|-----------|-------------|--------------|-------------|--------------|
| `settings` | Settings | `Settings` | `SettingsContent` | `features/settings/settings-content` | None | `right` | `['right']` |
| `automations` | Automations | `Zap` | `AutomationsView` | `features/automations/automations-view` | `betaAutomationsEnabled` | `top` | `['top', 'right']` |
| `inbox` | Inbox | `Inbox` | `InboxView` | `features/automations/inbox-view` | `betaAutomationsEnabled` | `top` | `['top', 'right']` |

### Phase 2: Add Existing Sidebar Panels

| Icon ID | Label | Icon | Component | Import Path | Feature Flag | Default Bar | Allowed Bars |
|---------|-------|------|-----------|-------------|--------------|-------------|--------------|
| `preview` | Preview | `Eye` | `AgentPreview` | `features/agents/ui/agent-preview` | None | `top` | `['top', 'right']` |
| `changes` | Changes | `GitBranch` | `AgentDiffView` | `features/agents/ui/agent-diff-view` | None | `top` | `['top', 'right']` |
| `terminal` | Terminal | `Terminal` | `TerminalSidebar` | `features/terminal/terminal-sidebar` | None | `top` | `['top', 'right']` |

### Phase 3 (Future): Additional Features

| Icon ID | Label | Icon | Component | Import Path | Feature Flag | Default Bar | Allowed Bars |
|---------|-------|------|-----------|-------------|--------------|-------------|--------------|
| `kanban` | Kanban | `Columns3` | `KanbanView` | `features/kanban/kanban-view` | `betaKanbanEnabled` | `top` | `['top']` |
| `files` | Files | `FolderTree` | `FileViewerSidebar` | `features/file-viewer/components/file-viewer-sidebar` | None | `right` | `['right']` |
| `history` | History | `History` | `HistoryView` | `features/changes/components/history-view/history-view` | None | `right` | `['right']` |
| `speckit` | SpecKit | `FileText` | `SpecKitSidebar` | `features/speckit/components/speckit-sidebar` | None | `right` | `['right']` |
| `details` | Details | `Info` | `DetailsSidebar` | `features/details-sidebar/details-sidebar` | None | `right` | `['right']` |

---

## 6. Initial Default Layout (For Migration)

### Top Bar (Horizontal)
```typescript
defaultIcons: ['terminal', 'preview', 'changes']
```

**Rationale**: Most frequently used panels for code work

### Right Bar (Vertical)
```typescript
defaultIcons: ['settings', 'inbox', 'automations']
```

**Rationale**: Secondary navigation items (Settings, Automations)

---

## 7. Custom SVG Icons (Existing in Codebase)

### SidebarInboxIcon
```typescript
// Location: src/renderer/features/sidebar/agents-sidebar.tsx:1110-1122
function SidebarInboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

### SidebarAutomationsIcon
```typescript
// Location: src/renderer/features/sidebar/agents-sidebar.tsx:1124-1139
function SidebarAutomationsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="currentColor"
      />
    </svg>
  )
}
```

**Note**: These custom SVGs should be moved to icon registry and reused

---

## 8. Excluded Components

### Not Suitable for Icon Bars

- **AgentsContent**: Root container (not a page)
- **NewChatForm**: Inline form (not a panel)
- **AutomationsDetailView**: Detail view (navigated from AutomationsView)
- **AgentsSidebar**: Primary left sidebar (always visible)
- **AgentsSubChatsSidebar**: Tab-based navigation (different UX pattern)
- **Plan Sidebar**: Agent mode panel (context-specific)
- **ExpandedWidgetSidebar**: Child component (not independent)

---

## 9. Migration Priority

### High Priority (Phase 1)
1. Settings (most critical, existing navigation)
2. Preview (heavily used, existing sidebar)
3. Changes (heavily used, existing sidebar)
4. Terminal (heavily used, existing sidebar)

### Medium Priority (Phase 2)
5. Automations (beta feature)
6. Inbox (beta feature)

### Low Priority (Phase 3)
7. Kanban (experimental, alternative to chat list)
8. Files (may not be actively used)
9. History (specialized use case)
10. SpecKit (specialized use case)
11. Details (specialized use case)

---

## 10. Integration Notes

### Width Atom Migration
| Old Atom | New Atom | Notes |
|----------|----------|-------|
| `agentsPreviewSidebarWidthAtom` | `topDrawerWidthAtom` or per-icon width | Migrate value |
| `agentsDiffSidebarWidthAtom` | `topDrawerWidthAtom` or per-icon width | Migrate value |
| `agentsInboxSidebarWidthAtom` | `rightDrawerWidthAtom` or per-icon width | Migrate value |

**Decision**: Should all drawers share width per bar, or should each icon remember its own width?
- **Shared Width**: Simpler, consistent experience (recommended for MVP)
- **Per-Icon Width**: More flexible, but more complex state management

### Feature Flag Handling
- Icons with feature flags should be dynamically added/removed from registry
- Use `reconcileWithRegistry()` to handle runtime flag changes

### Lazy Loading
- All page components should use `React.lazy()` for code splitting
- Wrap in `<Suspense>` with loading spinner

---

## Summary

**Total Pages Identified**: 15 components
**Icon-Bar Suitable**: 11 pages
**Phase 1 (MVP)**: 6 icons (Settings, Preview, Changes, Terminal, Automations, Inbox)
**Custom SVG Icons**: 2 (SidebarInboxIcon, SidebarAutomationsIcon)
**Recommended Default Layout**: 3 icons in top bar, 3 icons in right bar

**Next Step**: MIG1-003 - Create icon registry with these mappings

---

**Status**: ✅ Page Inventory Complete
