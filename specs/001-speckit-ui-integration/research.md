# Research: Fix Plan Page and Workflow Modal Issues

## Branch Detection

### Current Implementation

**Location**: `src/main/lib/speckit/file-utils.ts`

```typescript
// Lines 25-36
export function getCurrentBranch(projectPath: string): string {
  try {
    return execSync("git branch --show-current", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim()
  } catch (error) {
    throw new Error(
      `Failed to get current branch: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}
```

### Feature Branch Parsing

```typescript
// Lines 44-54
export function parseFeatureBranch(branchName: string): {
  featureNumber: string
  featureName: string
} | null {
  const match = branchName.match(/^(\d{3})-(.+)$/)
  if (!match) return null
  return {
    featureNumber: match[1],
    featureName: match[2],
  }
}
```

### Protected Branch List

**Not currently defined** - Must be defined as constants:
- main
- master
- internal
- staging
- dev

### Recommendation

Create a utility function in `src/renderer/features/speckit/hooks/useBranchDetection.ts`:

```typescript
const PROTECTED_BRANCHES = ['main', 'master', 'internal', 'staging', 'dev']

export function isProtectedBranch(branchName: string): boolean {
  return PROTECTED_BRANCHES.includes(branchName)
}

export function isNamedFeatureBranch(branchName: string): boolean {
  return !isProtectedBranch(branchName) && parseFeatureBranch(branchName) !== null
}
```

---

## Workflow Modal Layout

### Current Implementation

**Location**: `src/renderer/features/speckit/components/workflow-modal.tsx`

```typescript
<DialogContent
  className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden"
>
  {/* Header */}
  <div className="flex items-center justify-between px-6 h-14 border-b border-border flex-shrink-0">
    <WorkflowStepper />
  </div>

  {/* Dual Pane Layout */}
  <div className="flex-1 flex overflow-hidden">
    {/* Left Pane */}
    <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
      {/* Content */}
    </div>

    {/* Right Pane */}
    <div className="w-[45%] flex-shrink-0 overflow-hidden">
      <DocumentPane />
    </div>
  </div>
</DialogContent>
```

### Issue Identified

The `flex-1` on the container should make both panes fill available height, but:
1. The `DialogContent` has `h-[90vh] max-h-[90vh]` - this limits total height
2. The inner container uses `flex-1 flex flex-col overflow-hidden`
3. However, child content may not be filling height properly

### CSS Pattern Analysis

```text
DialogContent
├── Header: h-14 (56px) + border
└── Body: flex-1 (fills remaining)
    ├── Left Pane: flex-1 (should fill 55% of remaining)
    └── Right Pane: w-[45%] (fixed width, should fill 45%)
```

### Root Cause

The `flex-col` on the body with `flex-1` should work, but if content inside panes doesn't fill height:
- Pane content may need explicit `h-full` or `flex-1`
- Children may need `min-h-0` to enable proper flex scrolling

### Fix Required

Add `min-h-0` to enable proper flex scrolling:

```typescript
<div className="flex-1 flex overflow-hidden min-h-0">
  <div className="flex-1 flex flex-col border-r border-border overflow-hidden min-h-0">
    {/* Content with h-full or flex-1 */}
  </div>
  <div className="w-[45%] flex-shrink-0 overflow-hidden min-h-0">
    <DocumentPane className="h-full" />
  </div>
</div>
```

---

## New Feature Flow Button

### Current State

**NOT IMPLEMENTED** - The `onNewFeature` callback is passed through but not rendered.

**Location**: `src/renderer/features/speckit/components/plan-page.tsx`

The header shows a "Workflow" button that opens the existing workflow, but there's no "New Feature Flow" button that:
1. Appears only on named feature branches
2. Opens the workflow in empty state

### Where to Add

In `plan-page.tsx` header section, add conditional button:

```typescript
// Inside the header div, next to "Workflow" button
{isNamedFeatureBranch && (
  <Button variant="ghost" size="sm" onClick={handleNewFeature}>
    <Plus className="h-3 w-3 mr-1" />
    New Feature
  </Button>
)}
```

### Implementation Details

1. **Hook needed**: `useBranchDetection()` to get current branch type
2. **Atom needed**: `speckitWorkflowStartStepAtom` already exists for start step override
3. **Handler**: Set start step to "empty" state and open modal

---

## Files to Modify

| File | Change |
|------|--------|
| `src/renderer/features/speckit/hooks/useBranchDetection.ts` | **NEW** - Branch detection hook |
| `src/renderer/features/speckit/components/plan-page.tsx` | Add conditional "New Feature" button |
| `src/renderer/features/speckit/components/workflow-modal.tsx` | Fix height with `min-h-0` |
| `src/renderer/features/speckit/atoms/index.ts` | Add `speckitIsNewFeatureAtom` atom |

---

## Research Decisions

| Decision | Rationale |
|----------|-----------|
| Use `git branch --show-current` | Already implemented in backend, accessible via tRPC |
| Hardcode protected branches | Limited set, rarely changes |
| Use `min-h-0` for flex scrolling | Standard CSS flexbox pattern for nested flex containers |
| Add button in plan-page header | Matches existing "Workflow" button location |

---

## Alternatives Considered

1. **Branch detection in backend vs frontend**: Backend already has `getCurrentBranch()`, could expose via tRPC. However, for UI-only decisions (button visibility), frontend can use simpler logic since branch name is already loaded in state.

2. **Protected branches in config file**: Could add to `.specify/config/`, but overkill for 5 static values. Hardcode is simpler.

3. **CSS Grid vs Flexbox for modal**: Flexbox is already used, adding `min-h-0` is minimal change vs full CSS Grid refactor.
