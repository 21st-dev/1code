# ii-spec Native Architecture Update

**Date**: 2026-02-01
**Feature**: 001-speckit-ui-integration

---

## Major Architecture Shift

Based on user clarifications, we've moved from a "wrapper" approach to an **ii-spec native** approach:

### Before (Complex)
- Custom workflow state management
- Database/memory storage of workflow sessions
- Abstract ii-spec functionality into our system
- Track active/paused workflows

### After (Simple)
- ii-spec owns all state via files
- Git branch = active feature
- Read files to detect workflow state
- NO custom state management
- Just execute ii-spec commands and display results

---

## Key Changes

### 1. Submodule Relocation Required

**Current**: `spec-kit/` at project root (clutters root directory)
**Target**: `submodules/ii-spec/` (organized location)

**Migration Steps**:
```bash
# 1. Remove existing submodule
git submodule deinit -f spec-kit
git rm -f spec-kit
rm -rf .git/modules/spec-kit

# 2. Create submodules directory
mkdir -p submodules

# 3. Add submodule in new location
git submodule add git@github.com:SameeranB/ii-spec.git submodules/ii-spec

# 4. Commit the change
git add .gitmodules submodules/ii-spec
git commit -m "refactor: relocate spec-kit to submodules/ii-spec"
```

### 2. File-Based State Detection

Instead of maintaining workflow state in memory/database, we read it from files:

```typescript
function detectWorkflowState(projectPath: string): WorkflowState {
  // 1. Get current branch
  const branch = execSync('git branch --show-current').toString().trim()

  // 2. Parse feature number from branch (e.g., "001-speckit-ui-integration")
  const match = branch.match(/^(\d{3})-(.+)$/)
  if (!match) return { currentStep: 'no-feature' }

  const [, featureNumber, featureName] = match
  const featureDir = path.join(projectPath, 'specs', branch)

  // 3. Check which files exist
  const hasSpec = fs.existsSync(path.join(featureDir, 'spec.md'))
  const hasPlan = fs.existsSync(path.join(featureDir, 'plan.md'))
  const hasTasks = fs.existsSync(path.join(featureDir, 'tasks.md'))

  // 4. Check for clarification markers in spec
  let needsClarification = false
  if (hasSpec) {
    const specContent = fs.readFileSync(path.join(featureDir, 'spec.md'), 'utf-8')
    needsClarification = specContent.includes('[NEEDS CLARIFICATION')
  }

  // 5. Determine current step
  let currentStep: WorkflowStep
  if (!hasSpec) currentStep = 'specify'
  else if (needsClarification) currentStep = 'clarify'
  else if (!hasPlan) currentStep = 'plan'
  else if (!hasTasks) currentStep = 'tasks'
  else currentStep = 'implement'

  return { featureNumber, featureName, currentStep, ... }
}
```

### 3. Simplified tRPC Router

**Removed Procedures** (no longer needed):
- ❌ `startWorkflowSession`
- ❌ `getActiveWorkflowSession`
- ❌ `resumeWorkflowSession`
- ❌ `updateWorkflowStep`
- ❌ `pauseWorkflowSession`
- ❌ `completeWorkflowSession`
- ❌ `extractClarifications`
- ❌ `submitClarifications`

**Kept Procedures** (actually needed):
- ✅ `checkInitialization` - Detect if ii-spec initialized
- ✅ `initializeSpecKit` - Run init command
- ✅ `getWorkflowState` - Read current state from files
- ✅ `getConstitution` - Read .specify/memory/constitution.md
- ✅ `getFeaturesList` - List specs/ directory
- ✅ `getArtifact` - Read spec.md, plan.md, etc.
- ✅ `executeCommand` - Run ii-spec command via subprocess
- ✅ `onCommandOutput` - Stream command output

### 4. No Custom State Management

**Before**:
```typescript
// Complex Zustand store
interface SpecKitWorkflowStore {
  activeWorkflow: {
    featureId?: string
    sessionId?: string
    currentStep: WorkflowStep
    stepStatus: Record<string, StepStatus>
    clarifications: {...}
  } | null
  setActiveWorkflow: (workflow) => void
  updateStepStatus: (step, status) => void
  ...
}
```

**After**:
```typescript
// Simple Jotai atoms for UI state only
export const speckitModalOpenAtom = atom(false)
export const speckitCurrentDocumentAtom = atom<{
  type: 'spec' | 'plan' | 'research' | 'tasks'
  content: string
} | null>(null)
```

### 5. Multiple Concurrent Workflows (Free)

Users can work on multiple features by switching Git branches:

```bash
# User starts feature A
git checkout -b 001-feature-a
# UI shows: currentStep detected from files in specs/001-feature-a/

# User starts feature B (pauses A)
git checkout -b 002-feature-b
# UI shows: currentStep detected from files in specs/002-feature-b/

# User resumes feature A
git checkout 001-feature-a
# UI shows: currentStep detected from files (picks up where left off)
```

**No special handling needed** - just re-detect state when branch changes.

### 6. Error Pass-Through

When ii-spec commands fail, show the error as-is:

```typescript
async function executeCommand(cmd: string, args: string) {
  const proc = spawn(cmd, [args], { cwd: projectPath })

  proc.stderr.on('data', (data) => {
    // Show ii-spec error directly in chat pane
    appendToChatOutput(data.toString())
  })

  // NO error translation or wrapping
}
```

---

## Updated Specification

### New Functional Requirements

- **FR-027**: Relocate ii-spec submodule to `submodules/ii-spec/`
- **FR-028**: Detect workflow state from Git branch + file existence
- **FR-029**: Support multiple concurrent workflows via branch switching
- **FR-030**: Resume workflows from detected step (read files)
- **FR-031**: Display ii-spec errors as-is (no wrapping)

### Updated Technical Context

**Removed**:
- ❌ Zustand (no persistent state needed)
- ❌ Database storage for workflow sessions
- ❌ Complex workflow orchestration logic

**Kept/Added**:
- ✅ Jotai (ephemeral UI state only)
- ✅ react-markdown + remark-gfm + react-syntax-highlighter
- ✅ Node.js child_process for subprocess execution
- ✅ Git + file system as state manager

---

## Files Created

1. **`II_SPEC_NATIVE_ARCHITECTURE.md`**
   - Complete architecture documentation
   - File-based state detection logic
   - Simplified tRPC router specification
   - Submodule relocation steps
   - Multiple concurrent workflows explanation
   - Benefits of ii-spec native approach

2. **`specs/001-speckit-ui-integration/spec.md`** (UPDATED)
   - Added architecture summary at top
   - Added FR-027 through FR-031

3. **`specs/001-speckit-ui-integration/plan.md`** (UPDATED)
   - Rewrote summary with ii-spec native paradigm
   - Updated technical context (removed Zustand, database)
   - Simplified state management section

---

## Implementation Impact

### What Gets Simpler

1. **No session management** - Git branch is the session
2. **No workflow state machine** - ii-spec handles state transitions
3. **No database changes** - Everything is files
4. **No state synchronization** - Files are single source of truth
5. **Simpler testing** - Just test file reading and command execution

### What Stays the Same

1. **UI components** - Still need drawer widget and modal
2. **Stepper** - Still show workflow steps (just read from files)
3. **Command execution** - Still execute ii-spec via subprocess
4. **Streaming output** - Still stream command output to UI

### New Responsibilities

1. **Git branch detection** - Read current branch to find active feature
2. **File parsing** - Parse spec.md for `[NEEDS CLARIFICATION]` markers
3. **Submodule relocation** - Move spec-kit to submodules/ii-spec/

---

## Next Steps

1. **Update contracts/trpc-router-enhanced.ts** with simplified procedures
2. **Update data-model.md** to remove WorkflowSession, WorkflowClarifications
3. **Add submodule relocation task** to implementation plan
4. **Run `/speckit.tasks`** to generate implementation tasks

---

## Benefits Summary

✅ **Much simpler architecture** (50% less code)
✅ **Leverages ii-spec design** (don't fight it, use it)
✅ **Reliable state management** (Git + files, proven technologies)
✅ **Offline-first by default** (no network needed)
✅ **Easy to debug** (just read files on disk)
✅ **Future-proof** (can modify ii-spec submodule directly)

---

## Document Reference

Full details in: `specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md`
