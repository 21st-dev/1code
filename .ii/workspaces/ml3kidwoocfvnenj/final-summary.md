# SpecKit UI Integration - Planning Complete

**Date**: 2026-02-01
**Branch**: `001-speckit-ui-integration`
**Status**: ✅ Ready for `/speckit.tasks`

---

## What Was Accomplished

Complete planning for integrating ii-spec workflow UI into the Electron desktop app using an **ii-spec native architecture**.

### Key Architectural Decisions

1. **ii-spec Owns State** - Files (specs/, .specify/) are source of truth
2. **Git Branch = Active Feature** - No session management needed
3. **File-Based Resume** - Read existing files to detect workflow progress
4. **Multiple Concurrent Workflows** - Switch branches freely
5. **Pass-Through Errors** - Show ii-spec errors as-is
6. **Submodule Relocation** - Move from `spec-kit/` to `submodules/ii-spec/`

### Major Simplifications from Original Plan

| Aspect | Before | After |
|--------|--------|-------|
| State Management | Zustand store + database | Files only |
| Workflow Sessions | Track in memory | Git branch is session |
| tRPC Procedures | 25+ procedures | 15 procedures |
| Entities | 7 entities | 4 entities (3 removed) |
| Workflow Orchestration | Custom state machine | ii-spec handles it |
| Resume Logic | Complex session restore | Read files + detect state |

**Result**: ~50% less code, more reliable architecture

---

## Documents Created

### Core Architecture

1. **@[file:local:specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md]**
   - Complete architecture documentation
   - File-based state detection logic
   - Submodule relocation steps
   - Simplified tRPC router
   - Multiple concurrent workflows explanation
   - Benefits summary

2. **@[file:local:specs/001-speckit-ui-integration/INITIALIZATION_DETECTION.md]**
   - Initialization detection logic
   - UI behavior for 3 states (not initialized, partial, full)
   - Security considerations
   - Performance optimizations

### Contracts & Data Models

3. **@[file:local:specs/001-speckit-ui-integration/contracts/trpc-router-simplified.ts]**
   - Simplified tRPC router with 15 procedures
   - File reading, command execution, Git utilities
   - Removed all session management procedures
   - Zod schemas for all inputs/outputs

4. **@[file:local:specs/001-speckit-ui-integration/data-model-simplified.md]**
   - 4 core entities (SpecKitFeature, Constitution, WorkflowState, InitializationStatus)
   - Removed: WorkflowSession, WorkflowClarifications, WorkflowStep
   - File-based state detection patterns
   - Zod schemas for all entities

### Developer Guides

5. **@[file:local:specs/001-speckit-ui-integration/quickstart-simplified.md]**
   - Setup steps including submodule relocation
   - Development workflow (4 phases)
   - Command execution via subprocess
   - Testing strategy
   - Common issues & solutions

6. **@[file:local:specs/001-speckit-ui-integration/WORKFLOW_ANALYSIS.md]** (UPDATED)
   - Added pre-workflow initialization detection step
   - Complete 7-step command sequence
   - Clarification loop implementation

### Workspace Summaries

7. **@[file:local:.ii/workspaces/ml3kidwoocfvnenj/initialization-detection-summary.md]**
   - Quick reference for initialization detection
   - tRPC procedures
   - UI component sketches

8. **@[file:local:.ii/workspaces/ml3kidwoocfvnenj/architecture-update-summary.md]**
   - Before/after comparison
   - What changed and why
   - Impact on implementation

9. **@[file:local:.ii/workspaces/ml3kidwoocfvnenj/final-summary.md]** (THIS FILE)
   - Complete planning summary
   - All documents created
   - Next steps

### Specification Updates

10. **@[file:local:specs/001-speckit-ui-integration/spec.md]** (UPDATED)
    - Added architecture summary at top
    - Added FR-027 through FR-031 (5 new requirements)
    - Updated edge cases for initialization scenarios

11. **@[file:local:specs/001-speckit-ui-integration/plan.md]** (UPDATED)
    - Rewrote summary with ii-spec native paradigm
    - Removed Zustand from dependencies
    - Updated storage: "File system ONLY"
    - Added initialization detection section

---

## Functional Requirements Summary

### Total Requirements: 31 (was 23, added 8)

**New Requirements** (FR-024 to FR-031):

- **FR-024**: Detect if SpecKit is not initialized
- **FR-025**: One-click initialization action
- **FR-026**: Auto-refresh after initialization
- **FR-027**: Relocate submodule to `submodules/ii-spec/`
- **FR-028**: Detect workflow state from Git branch + files
- **FR-029**: Support multiple concurrent workflows
- **FR-030**: Resume workflows from detected step
- **FR-031**: Display ii-spec errors as-is

---

## Simplified tRPC Router

### 15 Procedures (down from 25+)

**Initialization** (2):
- `checkInitialization`
- `initializeSpecKit`

**State Detection** (1):
- `getWorkflowState` ⭐ Core procedure - detects current step from files

**File Reading** (4):
- `getConstitution`
- `getFeaturesList`
- `getArtifact`
- `getFeatureDescription`

**Command Execution** (3):
- `executeCommand`
- `onCommandOutput` (streaming subscription)
- `cancelCommand`

**Git Operations** (3):
- `getCurrentBranch`
- `getFeatureBranches`
- `switchBranch`

**File System Utilities** (2):
- `openFileInEditor`
- `watchDirectory` + `onFileChange`

---

## Simplified Data Model

### 4 Core Entities (down from 7)

**Kept**:
1. `SpecKitFeature` - Feature metadata from specs/ directory
2. `Constitution` - Constitution content from .specify/memory/
3. `WorkflowState` - Detected from Git branch + file existence
4. `InitializationStatus` - Detected from .specify/ structure

**Removed** (no longer needed):
- ❌ `WorkflowSession` → Git branch is the session
- ❌ `WorkflowClarifications` → Parse from spec.md on demand
- ❌ `WorkflowStep` → ii-spec manages via files

---

## Implementation Phases

### Phase 1: Submodule Relocation
- Move `spec-kit/` to `submodules/ii-spec/`
- Update .gitmodules
- Update all code references

### Phase 2: Backend (tRPC Router)
- Implement 15 tRPC procedures
- File reading utilities
- Command execution via subprocess
- State detection logic

### Phase 3: Frontend (UI Components)
- Plan page drawer widget
- Initialization prompt
- Constitution section
- Features table
- Workflow modal (dual-pane)

### Phase 4: Integration
- Add to drawer system
- Add icon button to top action bar
- Hook up command execution
- Stream output to chat pane

### Phase 5: Testing
- Unit tests for file utilities
- Integration tests for tRPC router
- E2E tests for workflow execution

---

## Submodule Relocation Steps

**Current**: `spec-kit/` at project root
**Target**: `submodules/ii-spec/`

```bash
# 1. Remove existing submodule
git submodule deinit -f spec-kit
git rm -f spec-kit
rm -rf .git/modules/spec-kit

# 2. Add in new location
mkdir -p submodules
git submodule add git@github.com:SameeranB/ii-spec.git submodules/ii-spec

# 3. Initialize
git submodule update --init --recursive

# 4. Commit
git add .gitmodules submodules/ii-spec
git commit -m "refactor: relocate spec-kit to submodules/ii-spec"
```

---

## File-Based State Detection Example

```typescript
function detectWorkflowState(projectPath: string): WorkflowState {
  // 1. Get current branch
  const branch = execSync('git branch --show-current', { cwd: projectPath })
    .toString().trim()

  // 2. Parse feature number/name
  const match = branch.match(/^(\d{3})-(.+)$/)
  if (!match) return { currentStep: 'no-feature' }

  const [, featureNumber, featureName] = match
  const featureDir = path.join(projectPath, 'specs', branch)

  // 3. Check file existence
  const hasSpec = fs.existsSync(path.join(featureDir, 'spec.md'))
  const hasPlan = fs.existsSync(path.join(featureDir, 'plan.md'))
  const hasTasks = fs.existsSync(path.join(featureDir, 'tasks.md'))

  // 4. Check for clarification markers
  let needsClarification = false
  if (hasSpec) {
    const specContent = fs.readFileSync(path.join(featureDir, 'spec.md'), 'utf-8')
    needsClarification = specContent.includes('[NEEDS CLARIFICATION')
  }

  // 5. Determine current step
  let currentStep: WorkflowStepName
  if (!hasSpec) currentStep = 'specify'
  else if (needsClarification) currentStep = 'clarify'
  else if (!hasPlan) currentStep = 'plan'
  else if (!hasTasks) currentStep = 'tasks'
  else currentStep = 'implement'

  return {
    featureNumber,
    featureName,
    branchName: branch,
    currentStep,
    artifactsPresent: { spec: hasSpec, plan: hasPlan, research: false, tasks: hasTasks },
    needsClarification,
  }
}
```

---

## Benefits of ii-spec Native Architecture

✅ **Simplicity** - 50% less code than original plan
✅ **Reliability** - Git + files are proven state managers
✅ **Offline-First** - No database or network dependency
✅ **Easy Debugging** - Just read files on disk
✅ **Flexibility** - Users can switch features freely
✅ **Future-Proof** - Can modify ii-spec submodule directly
✅ **Maintainability** - Less abstraction, clearer architecture

---

## Dependencies to Add

```bash
bun add react-markdown remark-gfm react-syntax-highlighter
bun add -D @types/react-syntax-highlighter
```

**Note**: Zustand was removed from dependencies (not needed).

---

## Testing Strategy

### Unit Tests
- File utilities (parseFeatureBranch, checkFileExists, etc.)
- State detection logic
- Clarification question parsing

### Integration Tests
- tRPC router procedures
- File reading/writing
- Command execution

### E2E Tests
- Complete workflow execution
- Branch switching
- Error handling

---

## Ready for Task Generation

All planning is complete. The architecture is well-documented and significantly simpler than the original plan.

**Next Command**: `/speckit.tasks`

This will generate implementation tasks organized by:
- User story priority (P1, P2, P3)
- Architectural layer (backend, frontend, integration)
- Spatial grouping (which files to modify)

---

## Key Takeaways

1. **Files are the source of truth** - Don't duplicate state
2. **Git branch is the session** - No need to track separately
3. **ii-spec owns workflow logic** - Don't wrap it, use it
4. **Subprocess execution** - Stream output, don't parse
5. **Pass-through errors** - ii-spec errors are already user-friendly

---

## Document Map

```
specs/001-speckit-ui-integration/
├── spec.md                              # ✅ Updated with new FRs
├── plan.md                              # ✅ Updated with simplified architecture
├── research.md                          # Original research (Phase 0)
├── research-enhanced.md                 # Enhanced with modal architecture
├── WORKFLOW_ANALYSIS.md                 # ✅ Updated with init detection
├── INITIALIZATION_DETECTION.md          # 🆕 Complete init detection guide
├── II_SPEC_NATIVE_ARCHITECTURE.md       # 🆕 Core architecture document
├── data-model.md                        # Original (complex)
├── data-model-simplified.md             # 🆕 Simplified for ii-spec native
├── quickstart.md                        # Original (complex)
├── quickstart-simplified.md             # 🆕 Simplified developer guide
├── contracts/
│   ├── trpc-router-enhanced.ts          # Original (complex, 25+ procedures)
│   └── trpc-router-simplified.ts        # 🆕 Simplified (15 procedures)
└── checklists/
    └── requirements.md                  # Quality validation checklist

.ii/workspaces/ml3kidwoocfvnenj/
├── initialization-detection-summary.md  # 🆕 Init detection quick reference
├── architecture-update-summary.md       # 🆕 Before/after comparison
└── final-summary.md                     # 🆕 This file
```

---

## Status: ✅ Planning Complete

All architectural decisions documented, all edge cases addressed, ready for implementation task generation.
