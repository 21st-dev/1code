# PR Review Feedback Implementation Plan

## Completed (Phase 1)
- Feedback screenshot handling - Files copied to userData
- ErrorBoundary component - Created reusable component
- Agent cache invalidation - Broadcast to all windows
- Type safety in feedback-list-dialog.tsx

## Phase 2 - HIGH PRIORITY

### 1. Confirmation Dialog for Profile Deletion
**File:** `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`

**Current code (line 171-179):**
```typescript
const handleDeleteProfile = async (profileId: string) => {
  try {
    await deleteProfileMutation.mutateAsync({ id: profileId })
    toast.success("Profile deleted")
  } catch (error) {
    toast.error("Failed to delete profile")
    console.error(error)
  }
}
```

**Changes:**
1. Add state for confirmation dialog:
   ```typescript
   const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
   const [profileToDelete, setProfileToDelete] = useState<{id: string, name: string} | null>(null)
   ```

2. Modify handleDeleteProfile to show confirmation:
   ```typescript
   const handleDeleteProfile = (profileId: string, profileName: string) => {
     setProfileToDelete({ id: profileId, name: profileName })
     setDeleteConfirmOpen(true)
   }
   ```

3. Add confirmDelete function:
   ```typescript
   const confirmDelete = async () => {
     if (profileToDelete) {
       await deleteProfileMutation.mutateAsync({ id: profileToDelete.id })
       toast.success("Profile deleted")
     }
     setDeleteConfirmOpen(false)
     setProfileToDelete(null)
   }
   ```

4. Update delete button onClick:
   ```typescript
   onClick={() => handleDeleteProfile(profile.id, profile.name)}
   ```

5. Add AlertDialog component before the return statement.

---

### 2. Fix Race Condition in Edit Approval Timeout
**File:** `src/main/lib/trpc/routers/claude.ts`

**Current code (line 189-199):**
```typescript
const pendingToolApprovals = new Map<
  string,
  {
    subChatId: string
    resolve: (decision: {...}) => void
  }
>()
```

**Changes:**
1. Add timeoutId to the pending approval object:
   ```typescript
   interface PendingApproval {
     subChatId: string
     resolve: (decision: {...}) => void
     timeoutId: NodeJS.Timeout | null
   }

   const pendingToolApprovals = new Map<string, PendingApproval>()
   ```

2. Update the timeout creation (line 1239-1248):
   ```typescript
   const timeoutId = setTimeout(() => {
     const pending = pendingToolApprovals.get(toolUseID)
     if (pending) {
       pending.timeoutId = null
       pendingToolApprovals.delete(toolUseID)
       safeEmit({...})
       pending.resolve({ approved: false, message: "Edit approval timed out after 5 minutes" })
     }
   }, 300000)

   pendingToolApprovals.set(toolUseID, {
     subChatId: input.subChatId,
     resolve: (data) => {
       clearTimeout(timeoutId)
       resolve(data)
     },
     timeoutId,
   })
   ```

3. Update respondEditApproval (line 2299-2306):
   ```typescript
   const pending = pendingToolApprovals.get(input.toolUseId)
   if (!pending) {
     return { success: false, error: "Approval request not found" }
   }
   if (pending.timeoutId) {
     clearTimeout(pending.timeoutId)
   }
   pending.resolve({ approved: input.approved, message: input.message })
   pendingToolApprovals.delete(input.toolUseId)
   return { success: true }
   ```

---

### 3. Remove `agent-modifier` Mode
**Files:**
- `src/main/lib/trpc/routers/claude.ts` (line 394)
- `src/renderer/features/agents/main/chat-input-area.tsx` (mode selector)

**Changes:**
1. In claude.ts, remove from mode enum:
   ```typescript
   // Before:
   mode: z.enum(["plan", "agent", "agent-builder", "agent-modifier", "read-only", "ask"]).default("agent"),

   // After:
   mode: z.enum(["plan", "agent", "agent-builder", "read-only", "ask"]).default("agent"),
   ```

2. In chat-input-area.tsx, no changes needed - the mode selector only shows "Agent", "Plan", "Read-Only", "Ask".

---

### 4. Accessibility Labels for Icon Buttons
**File:** `src/renderer/features/agents/main/chat-input-area.tsx`

**Icon buttons to fix:**

1. Mode toggle button (line 886-900):
   - Already wrapped in `<button>` - add `aria-label`

2. Refine input button (line 1335-1347):
   ```typescript
   // Before:
   <Button
     variant="ghost"
     size="icon"
     onClick={handleRefineInput}
     disabled={...}
   >
     <Sparkles className="h-4 w-4" />
   </Button>

   // After:
   <Button
     variant="ghost"
     size="icon"
     onClick={handleRefineInput}
     disabled={...}
     aria-label="Refine input with AI"
   >
     <Sparkles className="h-4 w-4" />
   </Button>
   ```

3. Thinking toggle (inside model dropdown, line 1283-1291):
   - The Switch component should have proper labeling
   - Add `aria-label` to the switch or wrapper div

---

## Phase 2 - MEDIUM PRIORITY

### 5. Extract Large Components into Separate Files
**File:** `src/renderer/features/agents/main/chat-input-area.tsx` (~600+ lines)

**Create new files:**

1. `src/renderer/components/ui/model-selector.tsx`:
   - ModelDropdown component
   - Handles model selection from available models
   - Shows thinking toggle

2. `src/renderer/components/ui/agent-mode-selector.tsx`:
   - ModeDropdown component
   - Handles agent mode selection (Agent/Plan/Read-Only/Ask)

**Import in chat-input-area.tsx:**
```typescript
import { ModelSelector } from "../../../components/ui/model-selector"
import { AgentModeSelector } from "../../../components/ui/agent-mode-selector"
```

---

### 6. Add Persistence to Tasks Page
**Files:**
- `src/renderer/features/tasks/atoms.ts`
- `src/renderer/features/tasks/tasks-page.tsx`

**Changes in atoms.ts:**
```typescript
// Add persistence key
const TASKS_STORAGE_KEY = "tasks-page-tasks"

export const tasksAtom = atom<Record<string, Task[]>>({})

// Create persisted version
export const persistedTasksAtom = atom(
  (get) => get(tasksAtom),
  (get, set, tasks: Record<string, Task[]>) => {
    set(tasksAtom, tasks)
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  }
)

// Initialize from localStorage
export function initializeTasksAtom(setAtom: any) {
  if (typeof window === "undefined") return
  try {
    const saved = localStorage.getItem(TASKS_STORAGE_KEY)
    if (saved) {
      setAtom(JSON.parse(saved))
    }
  } catch (e) {
    console.error("Failed to load tasks:", e)
  }
}
```

**Changes in tasks-page.tsx:**
```typescript
// In component:
useEffect(() => {
  initializeTasksAtom(setAllTasks)
}, [])
```

---

### 7. Add Indexes to Database Schema
**File:** `src/main/lib/db/schema/index.ts`

**Changes:**
```typescript
// Agents table - add indexes
export const agents = sqliteTable("agents", {
  id: text("id")...
  name: text("name").notNull().unique().$type<"string">(),  // .index() - but Drizzle handles unique indexes
  // ...
}, (table) => ({
  nameIdx: index("idx_agents_name").on(table.name),
  sourceIdx: index("idx_agents_source").on(table.source),
}))

// Model profiles table
export const modelProfiles = sqliteTable("model_profiles", {
  // ...
  isOffline: integer("is_offline", { mode: "boolean" }).default(false),
}, (table) => ({
  isOfflineIdx: index("idx_model_profiles_is_offline").on(table.isOffline),
}))

// Note: Feedback table is in separate file, need to add index there too
```

**Changes in feedback.ts:**
```typescript
export const feedback = sqliteTable("feedback", {
  // ...
}, (table) => ({
  resolvedIdx: index("idx_feedback_resolved").on(table.resolved),
  createdAtIdx: index("idx_feedback_created_at").on(table.createdAt),
}))
```

**Important:** Adding indexes requires a database migration. This is done automatically via auto-migrate in dev mode.

---

### 8. Add Filtering to Feedback List
**File:** `src/renderer/components/dialogs/feedback-list-dialog.tsx`

**Current state:** Has filtering via tRPC query but no search UI

**Changes:**
1. Add search state:
   ```typescript
   const [searchQuery, setSearchQuery] = useState("")
   const [typeFilter, setTypeFilter] = useState<FeedbackType | "all">("all")
   ```

2. Add search input in the toolbar:
   ```typescript
   <Input
     placeholder="Search feedback..."
     value={searchQuery}
     onChange={(e) => setSearchQuery(e.target.value)}
     className="max-w-xs"
   />
   ```

3. Add type filter dropdown (reuse Select component pattern)

4. Filter in render:
   ```typescript
   const filteredFeedback = feedbackList?.filter(item => {
     const matchesSearch = searchQuery === "" ||
       item.description.toLowerCase().includes(searchQuery.toLowerCase())
     const matchesType = typeFilter === "all" || item.type === typeFilter
     return matchesSearch && matchesType
   })
   ```

---

## Phase 2 - LOW PRIORITY

### 9. Document New Session Modes
**Files:**
- `CLAUDE.md`
- Optionally add tooltips in chat-input-area.tsx

**Add to CLAUDE.md:**
```markdown
## Claude Session Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| Plan | Read-only mode for review and planning | Reviewing code changes without making modifications |
| Agent | Full permissions with tool use | Implementing features, running commands |
| Agent Builder | Specialized for creating new agents | Designing Claude Code agents from conversations |
| Read-Only | Strict read-only, no file modifications | Browsing codebases safely |
| Ask | Q&A mode without tool execution | Getting explanations without side effects |
```

---

## Files Summary

| Priority | File | Action |
|----------|------|--------|
| High | agents-models-tab.tsx | Add confirmation dialog |
| High | claude.ts | Fix race condition, remove agent-modifier |
| High | chat-input-area.tsx | Add aria-labels |
| Medium | model-selector.tsx | Create new component |
| Medium | agent-mode-selector.tsx | Create new component |
| Medium | atoms.ts | Add tasks persistence |
| Medium | tasks-page.tsx | Initialize from localStorage |
| Medium | schema/index.ts | Add agents indexes |
| Medium | schema/feedback.ts | Add feedback indexes |
| Medium | feedback-list-dialog.tsx | Add search/filter UI |
| Low | CLAUDE.md | Document session modes |

---

## Verification Commands

```bash
# Profile deletion confirmation
bun run dev
# Open Settings → Models
# Click delete on a profile
# Verify confirmation dialog appears

# Edit approval timeout
# Start agent session with edits
# Trigger edit approval
# Verify no race conditions in console

# Accessibility
# Open DevTools → Accessibility panel
# Check icon buttons have labels

# Tasks persistence
bun run dev
# Add tasks
# Refresh page
# Verify tasks persist

# Database indexes
sqlite3 ~/Library/Application\ Support/Agents\ Dev/data/agents.db ".indices"
# Verify indexes exist

# Feedback filtering
bun run dev
# Open feedback list
# Type in search box
# Verify filtering works
```
