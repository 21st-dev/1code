# SpecKit UI Integration - Planning Documentation

**Branch**: `001-speckit-ui-integration`
**Status**: ✅ Planning Complete - Ready for `/speckit.tasks`
**Architecture**: ii-spec Native (file-based, Git-driven)

---

## Quick Navigation

### Core Documents (Start Here)

1. **[spec.md](spec.md)** - Product specification
   - 31 functional requirements
   - 5 user stories (P1-P3)
   - 7 success criteria

2. **[plan.md](plan.md)** - Implementation plan
   - ii-spec native architecture overview
   - 6 implementation phases
   - 15 tRPC procedures
   - Technical context and decisions

3. **[data-model.md](data-model.md)** - Entity definitions
   - 4 core entities (SpecKitFeature, Constitution, WorkflowState, InitializationStatus)
   - Zod schemas for all types
   - Storage strategy

4. **[quickstart.md](quickstart.md)** - Developer guide
   - Setup steps
   - Development workflow (Phases 1-6)
   - Testing strategy
   - Common issues & solutions

### Detailed Architecture

5. **[II_SPEC_NATIVE_ARCHITECTURE.md](II_SPEC_NATIVE_ARCHITECTURE.md)** - Core architecture
   - File-based state management
   - Subprocess execution patterns
   - Multiple concurrent workflows
   - Submodule relocation plan
   - Complete implementation examples

6. **[INITIALIZATION_DETECTION.md](INITIALIZATION_DETECTION.md)** - Initialization logic
   - Detection criteria
   - UI states (not initialized, partial, full)
   - Security considerations
   - Performance optimizations

7. **[WORKFLOW_ANALYSIS.md](WORKFLOW_ANALYSIS.md)** - ii-spec workflow study
   - Pre-workflow initialization step
   - 7-step command sequence
   - Clarification loop details
   - State transition diagrams

### Contracts & Supporting Docs

8. **[contracts/trpc-router.ts](contracts/trpc-router.ts)** - tRPC API contract
   - 15 procedures with Zod schemas
   - Complete type definitions
   - Implementation notes

9. **[checklists/requirements.md](checklists/requirements.md)** - Quality validation
   - All checks passed

### Legacy (Deprecated)

10. **[REUSABLE_MODAL_DESIGN.md](REUSABLE_MODAL_DESIGN.md)** - Original generic modal design
    - **Note**: This design is from the original "wrapper" approach
    - **Status**: Not part of simplified ii-spec native architecture
    - **Keep for reference only** - may be useful for future features

---

## Architecture Summary

### ii-spec Native Approach

**Core Principle**: ii-spec owns all state via files - UI reads and displays

**Key Decisions**:
1. **File-Based State** - Read Git branch + files, don't maintain state
2. **Git Branch = Session** - No session management needed
3. **Subprocess Execution** - Execute ii-spec commands directly
4. **Pass-Through Errors** - Show ii-spec errors as-is
5. **Multiple Workflows** - Free via Git branch switching

### Simplified vs Original Design

| Aspect | Original | Simplified |
|--------|----------|------------|
| tRPC Procedures | 25+ | 15 |
| Entities | 7 | 4 |
| State Management | Zustand + Database | Files only |
| Workflow Tracking | In-memory sessions | Git branch |
| Code Reduction | Baseline | ~50% less |

---

## Implementation Phases

### Phase 0: Submodule Relocation
- Move `spec-kit/` → `submodules/ii-spec/`
- Update all references

### Phase 1: Backend (tRPC Router)
- Implement 15 procedures
- File utilities, command executor, state detector

### Phase 2: Frontend Types
- TypeScript types with Zod schemas
- 4 core entities

### Phase 3: Frontend Components
- Plan page drawer widget
- Initialization prompt
- Constitution section
- Features table
- Workflow modal

### Phase 4: Command Execution
- Subprocess spawning
- Output streaming
- Process lifecycle management

### Phase 5: Integration
- Add to drawer system
- Icon button in top action bar
- End-to-end testing

### Phase 6: Testing
- Unit tests (file utilities, state detection)
- Integration tests (tRPC router)
- E2E tests (workflow execution)

---

## File Structure

```
specs/001-speckit-ui-integration/
├── README.md                        # This file
├── spec.md                          # ✅ Product specification
├── plan.md                          # ✅ Implementation plan
├── data-model.md                    # ✅ Entity definitions
├── quickstart.md                    # ✅ Developer guide
├── II_SPEC_NATIVE_ARCHITECTURE.md   # ✅ Core architecture
├── INITIALIZATION_DETECTION.md      # ✅ Init detection
├── WORKFLOW_ANALYSIS.md             # ✅ ii-spec workflow study
├── REUSABLE_MODAL_DESIGN.md         # 📦 Legacy (reference only)
├── contracts/
│   └── trpc-router.ts               # ✅ tRPC contract
└── checklists/
    └── requirements.md              # ✅ Quality validation
```

**Legend**:
- ✅ Active (part of ii-spec native architecture)
- 📦 Legacy (reference only, from original design)

---

## Key Technical Specs

### tRPC Procedures (15)

**Initialization** (2):
- `checkInitialization`, `initializeSpecKit`

**State Detection** (1):
- `getWorkflowState` ⭐ Core procedure

**File Reading** (4):
- `getConstitution`, `getFeaturesList`, `getArtifact`, `getFeatureDescription`

**Command Execution** (3):
- `executeCommand`, `onCommandOutput`, `cancelCommand`

**Git Operations** (3):
- `getCurrentBranch`, `getFeatureBranches`, `switchBranch`

**File System** (2):
- `openFileInEditor`, `watchDirectory` + `onFileChange`

### Entities (4)

1. **SpecKitFeature** - Feature metadata from `specs/` directory
2. **Constitution** - Constitution from `.specify/memory/constitution.md`
3. **WorkflowState** - Detected from Git branch + file existence
4. **InitializationStatus** - Detected from `.specify/` structure

### Dependencies to Add

```bash
bun add react-markdown remark-gfm react-syntax-highlighter
bun add -D @types/react-syntax-highlighter
```

---

## State Detection Example

```typescript
function detectWorkflowState(projectPath: string): WorkflowState {
  // 1. Get current branch
  const branch = execSync('git branch --show-current', { cwd: projectPath })
    .toString().trim()

  // 2. Parse feature number/name (e.g., "001-speckit-ui-integration")
  const match = branch.match(/^(\d{3})-(.+)$/)
  if (!match) return { currentStep: 'no-feature' }

  // 3. Check file existence
  const hasSpec = fs.existsSync(`specs/${branch}/spec.md`)
  const hasPlan = fs.existsSync(`specs/${branch}/plan.md`)
  const hasTasks = fs.existsSync(`specs/${branch}/tasks.md`)

  // 4. Determine current step
  if (!hasSpec) return { currentStep: 'specify', ... }
  if (hasClarifications) return { currentStep: 'clarify', ... }
  if (!hasPlan) return { currentStep: 'plan', ... }
  if (!hasTasks) return { currentStep: 'tasks', ... }
  return { currentStep: 'implement', ... }
}
```

---

## Next Steps

**Ready for**: `/speckit.tasks`

This will generate implementation tasks organized by:
- User story priority (P1, P2, P3)
- Implementation phase (0-6)
- Spatial grouping (which files to modify)

**Before Implementation**:
1. ✅ Review all planning documents (use this README as guide)
2. ✅ Ensure ii-spec submodule is accessible at `spec-kit/` (will be relocated)
3. ⏳ Install new dependencies (after tasks generated)
4. ⏳ Set up development environment (after tasks generated)

---

## Benefits of ii-spec Native Architecture

✅ **Simplicity** - 50% less code than wrapper approach
✅ **Reliability** - Git + files are proven state managers
✅ **Offline-First** - No database or network dependency
✅ **Easy Debugging** - Just read files on disk
✅ **Flexibility** - Users can switch features freely
✅ **Future-Proof** - Can modify ii-spec submodule directly
✅ **Maintainability** - Less abstraction, clearer code

---

## Document Reading Order

**For Implementers**:
1. Start: [README.md](README.md) (this file)
2. Understand: [II_SPEC_NATIVE_ARCHITECTURE.md](II_SPEC_NATIVE_ARCHITECTURE.md)
3. Reference: [plan.md](plan.md)
4. Code: [data-model.md](data-model.md) + [contracts/trpc-router.ts](contracts/trpc-router.ts)
5. Develop: [quickstart.md](quickstart.md)

**For Reviewers**:
1. Product: [spec.md](spec.md)
2. Technical: [plan.md](plan.md)
3. Architecture: [II_SPEC_NATIVE_ARCHITECTURE.md](II_SPEC_NATIVE_ARCHITECTURE.md)

**For Understanding ii-spec**:
1. Workflow: [WORKFLOW_ANALYSIS.md](WORKFLOW_ANALYSIS.md)
2. Initialization: [INITIALIZATION_DETECTION.md](INITIALIZATION_DETECTION.md)

---

## Status: ✅ Planning Complete

All architectural decisions documented, consolidated, and ready for task generation.
