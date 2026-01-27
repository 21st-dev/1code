# PR Review: Agent Builder & Model Profiles Feature

## Overview

This PR introduces a comprehensive set of features including **Agent Builder** for creating custom agents, **Model Profiles** for multiple API configurations, **Feedback System**, **Tasks Page**, and several new Claude session modes (`read-only`, `ask`, `agent-builder`, `agent-modifier`).

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Files Changed | 61 |
| Lines Added | ~6,471 |
| Lines Deleted | ~503 |
| New Components | 12+ |
| New Tables | 4 (agents, model_profiles, feedback, feedback_sessions) |

---

## Detailed Review Comments

### 1. Model Profiles Feature (`agents-models-tab.tsx`)

**Status: Generally Good, with Minor Concerns**

**Strengths:**
- Clean separation between profile list view and edit form
- Good use of `useInitializeModelProfiles` hook for DB sync
- Proper validation with `validateModelProfile`
- Modal-like editing flow with back/cancel buttons
- Good visual feedback with badges and icons

**Concerns:**

#### 1.1 Complexity of Dual State Management
The component maintains two separate state structures:
```typescript
// Legacy config state
const [model, setModel] = useState(storedConfig.model)
const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
const [token, setToken] = useState(storedConfig.token)

// Profile form state
const [formState, setFormState] = useState<ProfileFormState>(EMPTY_FORM)
```

**Suggestion:** Consider extracting the profile editor into a separate component to reduce cognitive load. The current file is ~600+ lines.

#### 1.2 Missing Empty State for Offline Profiles
```typescript
{modelProfiles.filter((p) => !p.isOffline).length === 0 ? (...) : (...)}
```
The offline profiles are filtered out in the list view but there's no way to manage them. Consider adding a tab or filter to view/edit offline profiles.

#### 1.3 Missing Confirmation Dialog for Delete
```typescript
const handleDeleteProfile = async (profileId: string) => {
  try {
    await deleteProfileMutation.mutateAsync({ id: profileId })
```
**Issue:** Deleting a profile happens immediately without confirmation.

**Suggestion:** Add a confirmation dialog before deletion, especially since profiles contain sensitive tokens.

---

### 2. Claude Router Updates (`claude.ts`)

**Status: Solid Implementation, with Security Considerations**

**Strengths:**
- Clean implementation of new session modes
- Good use of `pendingToolApprovals` Map for tracking approvals
- Proper error handling with `safeEmit`
- 5-minute timeout for edit approvals is reasonable

**Concerns:**

#### 2.1 New Session Modes - Missing Documentation
```typescript
mode: z.enum(["plan", "agent", "agent-builder", "agent-modifier", "read-only", "ask"]).default("agent"),
```
**Issue:** The modes `agent-builder` and `agent-modifier` are defined but `agent-modifier` is not used anywhere in the diff.

**Suggestion:** Either implement `agent-modifier` functionality or remove from the enum to avoid confusion.

#### 2.2 Edit Approval Timeout Behavior
```typescript
const timeoutId = setTimeout(() => {
  pendingToolApprovals.delete(toolUseID)
  resolve({ approved: false, message: "Edit approval timed out after 5 minutes" })
}, 300000)
```

**Potential Issue:** If the timeout fires before the user responds, the approval is removed from the map. If the user responds after timeout, the `resolve` function will throw or be orphaned.

**Suggestion:** Track timeout state separately and handle race conditions gracefully.

#### 2.3 Custom System Prompt Security
```typescript
const systemPromptConfig = input.systemPrompt
  ? { type: "text" as const, text: input.systemPrompt }
  : { type: "preset" as const, preset: "claude_code" as const, ... }
```

**Security Consideration:** Custom system prompts could potentially override safety guidelines. Consider adding validation or restrictions on custom prompts.

**Suggestion:** Add a warning or confirmation when using custom system prompts.

#### 2.4 Missing Rate Limiting for Edit Approvals
The `respondEditApproval` endpoint doesn't have any rate limiting or validation that the response is for a valid pending approval.

```typescript
const respondEditApproval: publicProcedure.input(...).mutation(async ({ input }) => {
  const pending = pendingToolApprovals.get(input.toolUseId)
  if (pending) {
    pending.resolve(...)
```

**Suggestion:** Add validation to ensure the approval belongs to the correct user/session.

---

### 3. Agent Builder Components

**Status: Well-Structured**

**New Files Added:**
- `agent-builder-modal.tsx`
- `chat-pane.tsx`
- `document-pane.tsx`
- `use-agent-builder-chat.ts`
- `response-parser.ts`
- `internal-agent-prompts.ts`

**Strengths:**
- Good separation of concerns between panes
- Clean hook pattern (`useAgentBuilderChat`)
- Reusable response parser
- Comprehensive internal agent prompts

**Concerns:**

#### 3.1 Response Parser Error Handling
```typescript
// response-parser.ts
export function parseAgentDefinition(content: string): AgentDefinition {
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/)
  if (!jsonMatch) {
    throw new Error("No JSON block found")
  }
```

**Issue:** Error messages are generic. Consider providing more helpful guidance in errors.

**Suggestion:** Include expected format in error messages to help users debug.

#### 3.2 Hardcoded Agent Specialist Prompt
```typescript
// internal-agent-prompts.ts
export const AGENT_SPECIALIST_PROMPT = `You are an AI Agent Specialist. Your expertise lies in creating, refining, and explaining Claude Code agents...
```

**Concern:** This prompt is very long (~200+ lines) and embedded in code.

**Suggestion:** Consider loading this from a file or template system for easier maintenance.

#### 3.3 Missing Validation in `useAgentBuilderChat`
```typescript
export function useAgentBuilderChat() {
  const [state, setState] = useState<AgentBuilderState>(initialState)
  // No validation functions exposed
```

**Suggestion:** Add validation functions to the hook return value for use by UI components.

---

### 4. Feedback System

**Status: Good, with Room for Enhancement**

**New Files:**
- `feedback-dialog.tsx`
- `feedback-list-dialog.tsx`

**Strengths:**
- Clean UI with categories (usability, bug, feature, etc.)
- Proper severity levels
- Screenshots attachment support

**Concerns:**

#### 4.1 Feedback Persistence
The feedback dialog doesn't appear to persist data to the database based on the diff.

**Issue:** Feedback submitted in the current session may be lost on app restart.

**Suggestion:** Integrate with the `feedback` table added in the schema.

#### 4.2 Missing Bulk Actions in List View
```typescript
// feedback-list-dialog.tsx
<div className="space-y-2">
  {feedbackList.map((item) => (...))}
</div>
```

**Issue:** No way to filter, sort, or bulk resolve feedback items.

**Suggestion:** Add search/filter and "Resolve All" functionality.

---

### 5. Tasks Page (`tasks-page.tsx`)

**Status: Simple and Functional**

**Strengths:**
- Clean, minimal implementation
- Proper use of Jotai atoms for state
- Good keyboard support (Enter to add task)

**Concerns:**

#### 5.1 Data Persistence
Tasks are stored in Jotai atoms only, meaning they're lost on page refresh.

**Suggestion:** Consider persisting tasks to localStorage or the database for persistence.

#### 5.2 Missing Task Status
There's no way to mark tasks as complete/incomplete.

**Suggestion:** Add a checkbox or toggle for task completion status.

---

### 6. Database Schema (`schema/index.ts`)

**Status: Good, with Minor Issues**

**Strengths:**
- Clean table definitions
- Proper use of JSON columns for flexible data
- Good timestamp defaults

**Concerns:**

#### 6.1 JSON Column Usage
```typescript
config: text("config").notNull(), // JSON: { model, token, baseUrl }
models: text("models").notNull(), // JSON array of model names
```

**Issue:** Using JSON columns makes it harder to:
- Query specific fields efficiently
- Enforce data integrity
- Add indexes

**Suggestion:** Consider normalizing these into separate tables if query performance becomes an issue.

#### 6.2 Missing Indexes
No indexes are defined on frequently queried columns like:
- `agents.name`
- `agents.source`
- `modelProfiles.isOffline`

**Suggestion:** Add indexes for columns used in WHERE clauses.

#### 6.3 Agents Table - Project ID FK
```typescript
projectId: text("project_id"), // null for user agents
```
**Issue:** No foreign key constraint ensures project_id references valid projects.

**Suggestion:** Add foreign key constraint if database supports it.

---

### 7. Chat Input Area (`chat-input-area.tsx`)

**Status: Major Refactoring, Needs Careful Review**

**Changes:**
- New model selector with `useAllModels`
- Agent mode selector (Plan/Agent/Read-Only/Ask)
- Extended thinking toggle
- New icons (Eye, ShieldCheck, Sparkles)

**Concerns:**

#### 7.1 Complex Component
This file is now ~600+ lines with many responsibilities.

**Suggestion:** Consider extracting:
- `ModelSelector` component
- `AgentModeSelector` component
- `SendButton` is already extracted (good!)

#### 7.2 Missing Loading States
When switching models or modes, there's no visual feedback.

**Suggestion:** Add loading spinners or disabled states during transitions.

#### 7.3 Icon Button Accessibility
```typescript
<Eye className="h-4 w-4" />
```

**Issue:** Icons alone don't meet accessibility standards.

**Suggestion:** Add `aria-label` or `title` attributes to icon buttons.

---

### 8. Right Sidebar Components

**Status: Good Additions**

**New Components:**
- `right-action-bar.tsx`
- `right-sidebar-drawer.tsx`
- `scroll-area.tsx`

**Strengths:**
- Clean UI patterns
- Good use of Drawer component
- Reusable scroll area

---

## Architecture & Code Quality Notes

### Positive Patterns
1. **Good use of atoms** - State management is consistent
2. **Hook patterns** - `useAgentBuilderChat`, `useInitializeModelProfiles` are well-designed
3. **TypeScript usage** - Strong typing throughout
4. **tRPC integration** - Clean mutations and queries

### Areas for Improvement
1. **File organization** - Some components are getting too large
2. **Error handling** - Inconsistent error boundaries
3. **Testing** - No test files visible in the diff
4. **Documentation** - New features need documentation updates

---

## Recommended Actions Before Merge

### High Priority
1. [ ] Add confirmation dialog for profile deletion
2. [ ] Fix race condition in edit approval timeout
3. [ ] Remove or implement `agent-modifier` mode
4. [ ] Add accessibility labels to icon buttons

### Medium Priority
5. [ ] Extract large components into separate files
6. [ ] Add persistence to Tasks page
7. [ ] Add indexes to database schema
8. [ ] Integrate feedback with database

### Low Priority
9. [ ] Add filtering to feedback list
10. [ ] Create separate Offline Profiles tab
11. [ ] Document new session modes

---

## Testing Recommendations

1. **Model Profiles:** Test CRUD operations, validation, edge cases
2. **Edit Approval:** Test timeout behavior, concurrent approvals
3. **Agent Builder:** Test agent creation, editing, deletion flow
4. **New Modes:** Verify `read-only` and `ask` modes work correctly
5. **Database:** Test migrations, ensure no data loss

---

## Overall Assessment

This is a substantial feature set with good overall implementation quality. The main concerns are around:

1. **Race conditions** in the edit approval system
2. **Missing confirmations** for destructive operations
3. **Accessibility** improvements needed
4. **Component size** could be reduced by extraction

**Recommendation:** Approve with the understanding that the high-priority items are addressed before or shortly after merge.
