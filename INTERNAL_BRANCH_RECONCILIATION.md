# Internal Branch Reconciliation Plan

## Overview

This document outlines the plan to rewrite features from the `internal` branch to work with the updated `main` branch architecture. Features will be reimplemented to match main's patterns rather than being cherry-picked.

---

## Feature Requirements Summary

| Feature | Status | Approach |
|---------|--------|----------|
| Remove 21st.dev login | ✅ Required | Remove auth gate, make app direct-launch |
| Right icon sidebar | ✅ Required | Rewrite using main's mutually exclusive sidebar pattern |
| Agent Panel (Plan/Todo) | ✅ Required | New panel replacing document panel |
| Workspace files | ✅ Required | Agents can create documents per workspace |
| Chat fork/split | ✅ Required | Implement using main's subchat architecture |
| Agent builder | ✅ Required | Rewrite to match main's patterns |
| Model profiles | ✅ Required | Rewrite DB schema + router |
| Feedback system | ✅ Required | Rewrite DB schema + router |

---

## Architecture Patterns from Main Branch

### 1. Sidebar State Management

Main uses **mutually exclusive sidebars** controlled by atoms:

```typescript
// Left sidebar content switching via desktopViewAtom
export type DesktopView = null | "settings" | "automations" | "inbox"
export const desktopViewAtom = atomWithWindowStorage<DesktopView>("agents:desktopView", null)

// Right sidebars use per-chat atomFamily pattern
export const diffSidebarOpenAtomFamily = atomFamily((chatId: string) => atom(...))
```

### 2. Details Sidebar Widget Pattern

Main's details sidebar (`src/renderer/features/details-sidebar/`) uses a **widget registry system**:

**Widget Registry (`details-sidebar/atoms/index.ts`):**
```typescript
export type WidgetId = "info" | "todo" | "plan" | "terminal" | "diff" | "mcp"

export interface WidgetConfig {
  id: WidgetId
  label: string
  icon: LucideIcon
  canExpand: boolean  // true = can open as separate sidebar
  defaultVisible: boolean
}

export const WIDGET_REGISTRY: WidgetConfig[] = [
  { id: "info", label: "Workspace", icon: Box, canExpand: false, defaultVisible: true },
  { id: "todo", label: "To-dos", icon: ListTodo, canExpand: false, defaultVisible: true },
  { id: "plan", label: "Plan", icon: FileText, canExpand: true, defaultVisible: true },
  { id: "terminal", label: "Terminal", icon: Terminal, canExpand: true, defaultVisible: false },
  { id: "diff", label: "Changes", icon: FileDiff, canExpand: true, defaultVisible: true },
  { id: "mcp", label: "MCP Servers", icon: OriginalMCPIcon, canExpand: false, defaultVisible: true },
]
```

**Per-workspace state atoms:**
- `widgetVisibilityAtomFamily(workspaceId)` - Which widgets are visible
- `widgetOrderAtomFamily(workspaceId)` - Display order of widgets
- `expandedWidgetAtomFamily(workspaceId)` - Which widget is expanded to sidebar

**Widget UI patterns:**
- All widgets wrapped in `WidgetCard` with h-8 header
- Expand button (ArrowUpRight icon) appears on hover for `canExpand: true` widgets
- Widgets are memoized with `memo()` to prevent re-renders
- Each widget fetches its own data via tRPC hooks

### 3. Authentication Flow

Main requires 21st.dev login before app access:
- `auth-manager.ts` handles OAuth flow
- `windows/main.ts` checks `authManager.isAuthenticated()` at window creation
- Blocks app entirely if not authenticated

---

## Implementation Plan

### Phase 1: Remove 21st.dev Login Requirement

**Goal:** App launches directly without requiring 21st.dev authentication.

**Files to modify:**

1. **`src/main/windows/main.ts`**
   - Remove auth gate check in `createWindow()` (lines 643-690)
   - Skip `login.html` loading
   - Always load main React app

2. **`src/main/index.ts`**
   - Make auth initialization optional
   - Don't block on auth state

3. **`src/main/auth-manager.ts`**
   - Keep for Claude OAuth (not 21st.dev)
   - Remove 21st.dev token refresh loop
   - Make `isAuthenticated()` return true or remove gate checks

4. **`src/renderer/App.tsx`**
   - Remove 21st.dev auth check routing
   - Skip billing method page if using CLI import
   - Go directly to anthropic onboarding or main app

5. **Analytics cleanup**
   - Use anonymous/local ID instead of 21st.dev user ID
   - Or disable analytics entirely

**New flow:**
```
App Start → (optional) Anthropic OAuth → Main App
```

---

### Phase 2: Unified Widget System

**Goal:** Create a reusable widget system that works for both left (details) sidebar and right sidebar panels.

**Design Principles:**
1. Widgets are self-contained, memoized components
2. Registry-based configuration (icons, labels, expandability)
3. Per-workspace visibility and ordering
4. Widgets can be used in either sidebar context
5. "Expand to sidebar" pattern for detailed views

**Extended Widget Registry:**

```typescript
// src/renderer/features/widgets/types.ts

export type WidgetId =
  // Existing (left sidebar)
  | "info" | "todo" | "plan" | "terminal" | "diff" | "mcp"
  // New (can appear in either sidebar)
  | "documents" | "agents"

export type WidgetContext = "left" | "right"

export interface WidgetConfig {
  id: WidgetId
  label: string
  icon: LucideIcon
  canExpand: boolean
  defaultVisible: boolean
  allowedContexts: WidgetContext[]  // Where widget can appear
  defaultContext: WidgetContext     // Default sidebar
}

export const WIDGET_REGISTRY: WidgetConfig[] = [
  // Left sidebar widgets
  { id: "info", label: "Workspace", icon: Box, canExpand: false, defaultVisible: true, allowedContexts: ["left"], defaultContext: "left" },
  { id: "todo", label: "To-dos", icon: ListTodo, canExpand: false, defaultVisible: true, allowedContexts: ["left", "right"], defaultContext: "left" },
  { id: "plan", label: "Plan", icon: FileText, canExpand: true, defaultVisible: true, allowedContexts: ["left", "right"], defaultContext: "left" },
  { id: "terminal", label: "Terminal", icon: Terminal, canExpand: true, defaultVisible: false, allowedContexts: ["left"], defaultContext: "left" },
  { id: "diff", label: "Changes", icon: FileDiff, canExpand: true, defaultVisible: true, allowedContexts: ["left"], defaultContext: "left" },
  { id: "mcp", label: "MCP Servers", icon: OriginalMCPIcon, canExpand: false, defaultVisible: true, allowedContexts: ["left", "right"], defaultContext: "left" },

  // New widgets (right sidebar focus)
  { id: "documents", label: "Documents", icon: FolderOpen, canExpand: true, defaultVisible: true, allowedContexts: ["right"], defaultContext: "right" },
  { id: "agents", label: "Agents", icon: Bot, canExpand: false, defaultVisible: true, allowedContexts: ["right"], defaultContext: "right" },
]
```

**Widget Base Component:**

```typescript
// src/renderer/features/widgets/widget-card.tsx

interface WidgetCardProps {
  widgetId: WidgetId
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
  customHeader?: React.ReactNode
  hideExpand?: boolean
  onExpand?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function WidgetCard({
  widgetId,
  title,
  badge,
  children,
  customHeader,
  hideExpand,
  onExpand,
  isCollapsed,
  onToggleCollapse,
}: WidgetCardProps) {
  const config = WIDGET_REGISTRY.find(w => w.id === widgetId)
  const Icon = config?.icon

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-md border bg-background">
      {/* Header - fixed h-8 */}
      <div className="group flex h-8 items-center gap-2 border-b px-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <span className="flex-1 text-sm font-medium truncate">{title}</span>
        {badge}
        {config?.canExpand && !hideExpand && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100"
            onClick={onExpand}
          >
            <ArrowUpRight className="h-3 w-3" />
          </Button>
        )}
        {onToggleCollapse && (
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onToggleCollapse}>
            {isCollapsed ? <ChevronRight /> : <ChevronDown />}
          </Button>
        )}
      </div>
      {/* Content */}
      {!isCollapsed && <div className="p-2">{children}</div>}
    </div>
  )
}
```

**State Management Updates:**

```typescript
// src/renderer/features/widgets/atoms.ts

// Per-sidebar widget placement (which widgets appear where)
export const widgetPlacementAtomFamily = atomFamily((workspaceId: string) =>
  atomWithStorage<Record<WidgetContext, WidgetId[]>>(
    `widgets:placement:${workspaceId}`,
    {
      left: ["info", "todo", "plan", "terminal", "diff", "mcp"],
      right: ["documents", "agents"],
    }
  )
)

// Right sidebar active panel (icon bar selection)
export type RightSidebarMode = "widgets" | "expanded" | null

export const rightSidebarModeAtomFamily = atomFamily((workspaceId: string) =>
  atom<RightSidebarMode>(null)
)

// Which widget is expanded in right sidebar (when mode = "expanded")
export const rightExpandedWidgetAtomFamily = atomFamily((workspaceId: string) =>
  atom<WidgetId | null>(null)
)
```

**Files to create:**

```
src/renderer/features/widgets/
├── index.ts
├── types.ts              # WidgetId, WidgetConfig, registry
├── atoms.ts              # Widget state management
├── widget-card.tsx       # Base card component
├── widget-renderer.tsx   # Renders widget by ID
└── widgets/
    ├── info-widget.tsx
    ├── todo-widget.tsx
    ├── plan-widget.tsx
    ├── terminal-widget.tsx
    ├── diff-widget.tsx
    ├── mcp-widget.tsx      # Move from details-sidebar
    ├── documents-widget.tsx # New
    └── agents-widget.tsx    # New
```

**Migration from details-sidebar:**
- Move `McpWidget` to new widgets folder
- Update `details-sidebar.tsx` to use `WidgetRenderer`
- Keep backward compatibility with existing atoms

---

### Phase 3: Right Icon Sidebar

**Goal:** Vertical icon bar on right edge, clicking icons opens widget panels in a drawer.

**Architecture:**

```
┌─────────────────────────────────────────────────────────┬────┐
│                                                         │ 📄 │ ← Icon bar (40px)
│                     Main Content                        │ ✓  │
│                                                         │ 📁 │
│                                                         │    │
├─────────────────────────────────────┬───────────────────┼────┤
│                                     │    Agent Panel    │    │
│         Chat Area                   │   (Plan/Todo)     │    │ ← Panel drawer (resizable)
│                                     │                   │    │
└─────────────────────────────────────┴───────────────────┴────┘
```

**State management:** Uses atoms from Phase 2 unified widget system.

**New components:**

1. **`src/renderer/features/right-sidebar/right-action-bar.tsx`**
   - Vertical icon bar (40px wide)
   - Icons derived from `WIDGET_REGISTRY` for right-context widgets
   - Clicking toggles widget drawer, clicking active closes it
   - Visual indicator for active widget

2. **`src/renderer/features/right-sidebar/right-sidebar-drawer.tsx`**
   - Uses `ResizableSidebar` component from main
   - Renders widgets assigned to right sidebar
   - Can show single expanded widget or widget list

**Integration in `agents-layout.tsx`:**

```typescript
<div className="flex flex-1 overflow-hidden">
  {/* Left sidebar (details) */}
  <DetailsSidebar ... />

  {/* Main content */}
  <div className="flex-1 flex">
    <AgentsContent />

    {/* Right sidebar drawer - shows widgets */}
    <RightSidebarDrawer
      workspaceId={workspaceId}
      isOpen={rightSidebarMode !== null}
      onClose={() => setRightSidebarMode(null)}
    />

    {/* Right action bar (always visible) */}
    <RightActionBar
      workspaceId={workspaceId}
      activeWidget={rightExpandedWidget}
      onWidgetSelect={handleWidgetSelect}
    />
  </div>
</div>
```

**Icon bar behavior:**
- Shows icons for: MCP, Documents, Agents (configurable)
- Click icon → opens drawer with that widget expanded
- Click same icon → closes drawer
- Icons highlight when their widget is active

---

### Phase 4: Agent Panel Widget

**Goal:** Widget showing agent's plan and todo list with real-time updates.

This is implemented as part of the widget system (Phase 2). The agent panel combines:

**PlanWidget (existing, enhanced):**
- Already exists in main's details sidebar
- Add to right sidebar widget registry with `allowedContexts: ["left", "right"]`
- Fetches plan from `claude.readPlanFile`
- Renders markdown with `ChatMarkdownRenderer`
- Collapsible within widget card

**TodoWidget (existing, enhanced):**
- Already exists in main's details sidebar
- Add to right sidebar widget registry with `allowedContexts: ["left", "right"]`
- Uses `currentTodosAtomFamily` from existing atoms
- Progress bar (completed/total)
- Real-time updates from `TodoWrite` tool

**No new components needed** - reuse existing widgets in new context.

---

### Phase 5: Workspace Files System

**Goal:** Agents can create/manage documents in a per-workspace directory.

**Directory structure:**
```
.ii/workspaces/{chatId}/
  ├── notes/
  ├── plans/
  └── {agent-created-files}
```

**Database changes:** None needed - files stored on filesystem.

**New tRPC router (`src/main/lib/trpc/routers/workspace-files.ts`):**

```typescript
export const workspaceFilesRouter = router({
  listFiles: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      // List files in .ii/workspaces/{chatId}/
    }),

  readFile: publicProcedure
    .input(z.object({ chatId: z.string(), filePath: z.string() }))
    .query(async ({ input }) => {
      // Read file content
    }),

  writeFile: publicProcedure
    .input(z.object({ chatId: z.string(), filePath: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      // Write file (for agent use)
    }),

  deleteFile: publicProcedure
    .input(z.object({ chatId: z.string(), filePath: z.string() }))
    .mutation(async ({ input }) => {
      // Delete file
    }),
})
```

**Components (rewrite from internal):**
- `WorkspaceFileTree` - file browser
- `CodeViewer` - syntax highlighted code
- `useOpenFile` hook

---

### Phase 6: Chat Fork/Split

**Goal:** Create new subchat from a point in conversation history.

**Implementation approach (from analysis):**

Main already has the infrastructure:
- `subChats` table with `messages` JSON field
- `createSubChat` mutation
- `updateSubChatMessages` mutation

**New mutation in `chats.ts`:**

```typescript
forkSubChat: publicProcedure
  .input(z.object({
    subChatId: z.string(),
    upToMessageIndex: z.number().optional(), // Fork point
    newName: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    // 1. Get source subchat
    const source = await db.select().from(subChats).where(eq(subChats.id, input.subChatId)).get()

    // 2. Parse messages, filter to fork point
    const messages = JSON.parse(source.messages)
    const forkedMessages = input.upToMessageIndex
      ? messages.slice(0, input.upToMessageIndex + 1)
      : messages

    // 3. Create new subchat with forked messages
    const newSubChat = await db.insert(subChats).values({
      chatId: source.chatId,
      name: input.newName || `Fork of ${source.name}`,
      mode: source.mode,
      messages: JSON.stringify(forkedMessages),
      sessionId: null, // Fresh session
    }).returning().get()

    return newSubChat
  }),
```

**UI integration:**
- Add "Fork" option to `sub-chat-context-menu.tsx`
- Add "Fork at this message" to message context menu
- Opens new tab with forked subchat

---

### Phase 7: Agent Builder

**Goal:** UI for creating custom agents with system prompts.

**Database schema (`src/main/lib/db/schema/index.ts`):**

```typescript
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model"), // e.g., "claude-sonnet-4-20250514"
  temperature: real("temperature").default(1),
  maxTokens: integer("max_tokens"),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})
```

**tRPC router (`src/main/lib/trpc/routers/agents.ts`):**
- `list` - Get all agents
- `get` - Get single agent
- `create` - Create new agent
- `update` - Update agent
- `delete` - Delete agent

**Components:**
- `AgentBuilderModal` - Main dialog
- `ChatPane` - Test agent in chat
- `DocumentPane` - Edit system prompt

---

### Phase 8: Model Profiles

**Goal:** Custom model configurations for API integrations.

**Database schema:**

```typescript
export const modelProfiles = sqliteTable("model_profiles", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  provider: text("provider").notNull(), // "anthropic" | "openai" | "ollama" | "custom"
  modelId: text("model_id").notNull(),
  baseUrl: text("base_url"), // For custom endpoints
  apiKey: text("api_key"), // Encrypted
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  settings: text("settings"), // JSON for provider-specific settings
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})
```

---

### Phase 9: Feedback System

**Goal:** Collect user feedback on agent responses.

**Database schema:**

```typescript
export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  chatId: text("chat_id").references(() => chats.id),
  subChatId: text("sub_chat_id"),
  messageId: text("message_id"),
  rating: integer("rating"), // 1-5 or thumbs up/down
  comment: text("comment"),
  category: text("category"), // "helpful" | "incorrect" | "harmful" | "other"
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})
```

---

## Migration Checklist

### Database Migrations

```bash
# Generate migrations after schema changes
bun run db:generate

# New migrations needed:
# - 0008_add_agents.sql
# - 0009_add_model_profiles.sql
# - 0010_add_feedback.sql
```

### Files to Create

```
# Unified Widget System (Phase 2)
src/renderer/features/widgets/
├── index.ts
├── types.ts                    # WidgetId, WidgetConfig, registry
├── atoms.ts                    # Widget state management
├── widget-card.tsx             # Base card component
├── widget-renderer.tsx         # Renders widget by ID
└── widgets/
    ├── mcp-widget.tsx          # Move from details-sidebar
    ├── documents-widget.tsx    # New - workspace files
    └── agents-widget.tsx       # New - custom agents list

# Right Sidebar (Phase 3)
src/renderer/features/right-sidebar/
├── index.ts
├── right-action-bar.tsx        # Vertical icon bar
└── right-sidebar-drawer.tsx    # Resizable drawer with widgets

# Workspace Files (Phase 5)
src/renderer/features/workspace-files/
├── index.ts
├── components/
│   ├── file-tree.tsx
│   └── code-viewer.tsx
├── hooks/
│   └── use-open-file.ts
└── utils/
    └── file-types.ts

# tRPC Routers
src/main/lib/trpc/routers/
├── workspace-files.ts          # Phase 5
├── model-profiles.ts           # Phase 8
└── feedback.ts                 # Phase 9
```

### Files to Modify

```
# Phase 1: Auth Removal
src/main/windows/main.ts          # Remove auth gate
src/main/index.ts                 # Optional auth init
src/main/auth-manager.ts          # Remove 21st.dev, keep Claude OAuth
src/renderer/App.tsx              # Skip 21st.dev flow

# Phase 2: Widget System
src/renderer/features/details-sidebar/atoms/index.ts  # Extend WIDGET_REGISTRY
src/renderer/features/details-sidebar/details-sidebar.tsx  # Use WidgetRenderer

# Phase 3: Right Sidebar
src/renderer/features/layout/agents-layout.tsx  # Add right sidebar components

# Phase 5-9: Database & Routers
src/main/lib/db/schema/index.ts   # Add new tables
src/main/lib/trpc/routers/index.ts # Register new routers
src/main/lib/trpc/routers/chats.ts # Add forkSubChat mutation
```

---

## Implementation Order

```
Phase 1: Auth Removal ─────────────────────────────────────────┐
    │                                                          │
    ▼                                                          │ Unblocks
Phase 2: Unified Widget System ────────────────────────────────┤ everything
    │                                                          │
    ├──────────────────┬───────────────────┐                   │
    ▼                  ▼                   ▼                   │
Phase 3:          Phase 4:            Phase 6:                 │
Right Sidebar     Agent Panel         Chat Fork/Split ─────────┘
    │             (reuse widgets)     (parallel)
    ▼
Phase 5: Workspace Files
    │
    ▼
Phase 7-9: Agent Builder, Model Profiles, Feedback (lower priority)
```

**Critical Path:** Phase 1 → Phase 2 → Phase 3 → Phase 5

**Parallel Work:**
- Phase 4 (Agent Panel) can start after Phase 2
- Phase 6 (Chat Fork) can start after Phase 1

---

## Widget System Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              WIDGET_REGISTRY                             │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬────────┐ │
│  │  info   │  todo   │  plan   │terminal │  diff   │   mcp   │  docs  │ │
│  │  (L)    │ (L/R)   │ (L/R)   │  (L)    │  (L)    │  (L/R)  │  (R)   │ │
│  └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           ┌───────────────┐                ┌───────────────┐
           │ Details       │                │ Right         │
           │ Sidebar (L)   │                │ Sidebar (R)   │
           │               │                │               │
           │ ┌───────────┐ │                │ ┌───────────┐ │
           │ │ WidgetCard│ │                │ │ WidgetCard│ │
           │ │  → info   │ │                │ │  → mcp    │ │
           │ │  → todo   │ │                │ │  → docs   │ │
           │ │  → plan   │ │                │ │  → todo   │ │
           │ │  → ...    │ │                │ │  → plan   │ │
           │ └───────────┘ │                │ └───────────┘ │
           └───────────────┘                └───────────────┘
```

**Key benefits:**
1. MCP widget can appear in right sidebar
2. Todo/Plan can appear in both sidebars (user choice)
3. New widgets automatically work in both contexts
4. Consistent UI patterns across sidebars
5. Per-workspace widget configuration

---

## Notes

- All features should follow main's patterns (atomFamily, ResizableSidebar, etc.)
- Use existing components where possible (ChatMarkdownRenderer, etc.)
- Widgets are memoized with `memo()` to prevent re-renders
- Test thoroughly after each phase
- Create proper TypeScript types for all new data structures
