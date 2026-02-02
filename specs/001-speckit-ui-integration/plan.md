# Implementation Plan: SpecKit UI Integration

**Branch**: `001-speckit-ui-integration` | **Date**: 2026-02-01 | **Spec**: [spec.md](spec.md)

---

## Summary

Integrate ii-spec workflow tooling into the Electron desktop application using a **file-based, Git-native architecture**:

1. **Right Drawer Widget**: Displays constitution and features list (read from `.specify/` and `specs/` directories)
2. **Full-Screen Modal Workflow**: Dual-pane interface executing ii-spec commands directly via subprocess, streaming output to chat pane

### Architecture Paradigm: ii-spec Native

**Core Principles**:
- ii-spec submodule at `submodules/ii-spec/` owns all workflow state via files
- Current Git branch determines active feature (e.g., `001-speckit-ui-integration`)
- Workflow state detected by checking file existence (spec.md, plan.md, tasks.md)
- Multiple concurrent workflows supported (switch via Git branches)
- UI reads files and invokes ii-spec commands - NO custom state management
- Errors from ii-spec displayed as-is in UI

**Key Simplification**: We do NOT wrap or abstract ii-spec's workflow - we directly execute its commands and read its file outputs.

**See**: `II_SPEC_NATIVE_ARCHITECTURE.md` for complete architectural documentation

---

## Technical Context

**Language/Version**: TypeScript 5.4.5, React 19, Electron 33.4.5

**Primary Dependencies**:
- Frontend: React 19, Jotai (ephemeral UI state only), Radix UI, Tailwind CSS, Motion, Lucide icons
- Backend: Electron, tRPC (IPC), Node.js child_process (subprocess execution)
- Markdown: react-markdown + remark-gfm + react-syntax-highlighter
- ii-spec Integration: Git submodule at `submodules/ii-spec/`, executed via subprocess

**Storage**: File system ONLY (ii-spec manages state via .specify/ and specs/); NO database changes needed

**State Management**:
- Persistent: Git + file system (ii-spec owns this)
- Ephemeral: Jotai atoms (modal open/closed, current document display)
- NO Zustand needed (removed from architecture)

**Testing**: Integration tests for tRPC file reading, E2E tests for command execution and output streaming

**Target Platform**: Desktop (Electron) - macOS, Windows, Linux

**Performance Goals**:
- UI access: <2 seconds to open Plan page
- Artifact viewing: <3 seconds to display selected feature artifacts
- List rendering: <2 seconds for up to 100 features
- Workflow state detection: <500ms

**Constraints**:
- Offline-first: Must work without internet connection
- Type-safe IPC: Must use tRPC patterns, no raw IPC
- Non-destructive: Must not modify user's main Git branch
- Real-time feedback: Progress indicators within 1 second per workflow step

---

## Constitution Check

*GATE: Must pass before implementation.*

Verify compliance with `.specify/memory/constitution.md`:

**Principle I - Desktop-First Experience**:
- [x] Feature works offline-first with local data storage (reads/writes local file system for ii-spec artifacts)
- [x] Uses native Electron APIs where applicable (native file system access, child_process)
- [x] IPC uses type-safe tRPC patterns (new tRPC router for ii-spec operations)
- [x] State persists across app restarts (Git + files are persistent state)
- [x] Platform-specific features degrade gracefully (Git operations show clear errors)

**Principle II - Git Worktree Isolation** (NON-NEGOTIABLE):
- [x] Feature respects worktree boundaries (ii-spec operations execute in project root)
- [x] No worktree logic modifications required

**Principle III - Type Safety & Data Integrity**:
- [x] All tRPC routers have Zod input schemas (speckit router uses Zod for all inputs)
- [x] Database changes use Drizzle migrations only (N/A - no database changes)
- [x] No `any` types without explicit justification (strict TypeScript with proper types)
- [x] Preload APIs are fully typed (no preload changes needed)

**Principle IV - User Transparency & Control**:
- [x] Tool executions render in real-time (workflow steps stream output)
- [x] Changes show diff previews before applying (user reviews generated artifacts)
- [x] Error messages are actionable with recovery suggestions (ii-spec errors shown as-is)
- [x] Background operations show progress and allow cancellation (command execution cancellable)

**Principle V - Performance & Responsiveness**:
- [x] Operations >100ms run in background/workers (ii-spec command execution async)
- [x] Large files stream (not loaded entirely into memory) (markdown rendering optimized)
- [x] Database queries use indexes, avoid N+1 patterns (N/A - no database)
- [x] React components properly memoized (UI components use useMemo/useCallback)

**Development Standards**:
- [x] Testing strategy defined (integration + E2E tests)
- [x] Follows code organization patterns (feature-based structure)
- [x] Uses conventional commit format (feat: prefix)

**Result**: ✅ All constitutional checks pass. No violations to document.

---

## Project Structure

### Source Code

```text
submodules/
└── ii-spec/                        # NEW: Git submodule (relocated from spec-kit/)

src/main/                           # Electron main process
├── lib/
│   ├── trpc/routers/
│   │   └── speckit.ts              # NEW: Simplified tRPC router (15 procedures)
│   └── speckit/                    # NEW: ii-spec integration utilities
│       ├── file-utils.ts           # NEW: File reading, branch parsing
│       ├── command-executor.ts     # NEW: Subprocess execution, streaming
│       └── state-detector.ts       # NEW: Workflow state detection

src/renderer/                       # React renderer process
├── features/speckit/               # NEW: Complete SpecKit feature
│   ├── types/                      # NEW: TypeScript types
│   │   ├── index.ts
│   │   ├── feature.ts
│   │   ├── constitution.ts
│   │   ├── workflow-state.ts
│   │   ├── initialization.ts
│   │   └── ui-models.ts
│   ├── components/                 # NEW: UI components
│   │   ├── plan-page.tsx           # Main drawer widget
│   │   ├── initialization-prompt.tsx
│   │   ├── constitution-section.tsx
│   │   ├── features-table.tsx
│   │   └── workflow-modal.tsx      # Full-screen modal
│   ├── hooks/                      # NEW: Custom hooks
│   │   ├── use-workflow-state.ts
│   │   ├── use-execute-command.ts
│   │   └── use-command-output.ts
│   └── atoms/                      # NEW: Jotai atoms
│       └── index.ts
│
└── lib/
    └── trpc.ts                     # MODIFY: Add speckit router types
```

### Documentation

```text
specs/001-speckit-ui-integration/
├── README.md                       # Documentation guide & navigation
├── spec.md                         # Product specification (31 FRs)
├── plan.md                         # This file
├── II_SPEC_NATIVE_ARCHITECTURE.md  # Core architecture documentation
├── INITIALIZATION_DETECTION.md     # Initialization detection implementation
├── WORKFLOW_ANALYSIS.md            # ii-spec workflow study
├── data-model.md                   # Entity definitions (4 entities)
├── quickstart.md                   # Developer guide
├── contracts/
│   └── trpc-router.ts              # tRPC contract (15 procedures)
└── checklists/
    └── requirements.md             # Quality validation
```

---

## Architecture Overview

### File-Based State Detection

**Core Concept**: Read current Git branch and file system to detect workflow state.

```typescript
function detectWorkflowState(projectPath: string): WorkflowState {
  // 1. Get current branch
  const branch = execSync('git branch --show-current', { cwd: projectPath })
    .toString().trim()

  // 2. Parse feature number/name (e.g., "001-speckit-ui-integration")
  const match = branch.match(/^(\d{3})-(.+)$/)
  if (!match) return { currentStep: 'no-feature' }

  const [, featureNumber, featureName] = match
  const featureDir = path.join(projectPath, 'specs', branch)

  // 3. Check file existence
  const artifactsPresent = {
    spec: fs.existsSync(path.join(featureDir, 'spec.md')),
    plan: fs.existsSync(path.join(featureDir, 'plan.md')),
    research: fs.existsSync(path.join(featureDir, 'research.md')),
    tasks: fs.existsSync(path.join(featureDir, 'tasks.md')),
  }

  // 4. Check for clarification markers
  let needsClarification = false
  if (artifactsPresent.spec) {
    const specContent = fs.readFileSync(path.join(featureDir, 'spec.md'), 'utf-8')
    needsClarification = specContent.includes('[NEEDS CLARIFICATION')
  }

  // 5. Determine current step
  let currentStep: WorkflowStepName
  if (!artifactsPresent.spec) currentStep = 'specify'
  else if (needsClarification) currentStep = 'clarify'
  else if (!artifactsPresent.plan) currentStep = 'plan'
  else if (!artifactsPresent.tasks) currentStep = 'tasks'
  else currentStep = 'implement'

  return {
    featureNumber,
    featureName,
    branchName: branch,
    currentStep,
    artifactsPresent,
    needsClarification,
  }
}
```

### Simplified tRPC Router

**15 Procedures** (down from 25+ in original design):

**Initialization** (2):
- `checkInitialization` - Detect if ii-spec initialized
- `initializeSpecKit` - Run init command

**State Detection** (1):
- `getWorkflowState` - Core state detection from files

**File Reading** (4):
- `getConstitution` - Read constitution.md
- `getFeaturesList` - List specs/ directory
- `getArtifact` - Read spec.md, plan.md, etc.
- `getFeatureDescription` - Extract description from spec.md

**Command Execution** (3):
- `executeCommand` - Run ii-spec command via subprocess
- `onCommandOutput` - Stream output (subscription)
- `cancelCommand` - Cancel running command

**Git Operations** (3):
- `getCurrentBranch` - Get current branch
- `getFeatureBranches` - List feature branches
- `switchBranch` - Checkout branch

**File System Utilities** (2):
- `openFileInEditor` - Open file in system editor
- `watchDirectory` + `onFileChange` - File watcher

### Simplified Data Model

**4 Core Entities** (down from 7):

1. **SpecKitFeature** - Feature metadata from specs/ directory
2. **Constitution** - Constitution content from .specify/memory/
3. **WorkflowState** - Detected from Git branch + file existence
4. **InitializationStatus** - Detected from .specify/ structure

**Removed** (no longer needed):
- ❌ WorkflowSession → Git branch is the session
- ❌ WorkflowClarifications → Parse from spec.md on demand
- ❌ WorkflowStep → ii-spec manages via files

---

## UI Architecture

### Initialization Detection

**Before showing constitution/features, check if ii-spec is initialized:**

**Detection Logic**:
- Check `.specify/` directory exists
- Check `.specify/templates/` with required templates
- Check `.specify/memory/` directory
- Check `.specify/scripts/` directory

**UI States**:
1. **Not Initialized**: Show "Initialize SpecKit" prompt with one-click button
2. **Partially Initialized**: Show "Re-initialize SpecKit" with missing components
3. **Fully Initialized**: Show normal Plan page

**See**: `INITIALIZATION_DETECTION.md` for complete details

### Component Hierarchy

```
Plan Page (Drawer Widget)
├── Initialization Check
│   └── If not initialized → InitializationPrompt
├── Constitution Section (if initialized)
│   ├── "Edit Constitution" Button
│   └── Principles Preview (condensed)
└── Features Section (if initialized)
    ├── "New Feature" Button → Opens Modal
    └── Features Table
        └── Columns: ID | Name | Description | Branch | Artifacts

Workflow Modal (Full-Screen)
├── Stepper (Top) - Clickable for navigation between completed steps
│   └── Constitution | Specify | Clarify | Plan | Tasks | Implement
├── Stale Warning Banner (conditional)
│   └── Shows when navigating to previous step with downstream artifacts
├── Skip Warning Banner (conditional)
│   └── Shows when skipping Clarify step
├── Chat Pane (Left)
│   ├── Command execution
│   └── Output streaming
└── Document Pane (Right)
    ├── Live artifact preview (markdown) - for Constitution/Specify/Clarify/Plan/Tasks
    └── Task List with Copy Buttons - for Implement step
```

### Workflow Step Completion Detection

The workflow is file-based. Step completion is determined by file existence:

| Step | Considered Complete When |
|------|-------------------------|
| Constitution | `.specify/memory/constitution.md` exists |
| Specify | `specs/{branch}/spec.md` exists |
| Clarify | No `[NEEDS CLARIFICATION` markers in spec.md |
| Plan | `specs/{branch}/plan.md` exists |
| Tasks | `specs/{branch}/tasks.md` exists |
| Implement | Terminal state - shows task list for manual execution |

**Free Navigation**: Users can click any completed step in the stepper to return and modify it. When navigating backward, a non-blocking stale warning banner appears if downstream artifacts exist.

### State Management

**Jotai Atoms** (ephemeral UI state only):
```typescript
speckitModalOpenAtom           // boolean
speckitCurrentDocumentAtom     // { type, content } | null
speckitLoadingAtom             // boolean
```

**NO Zustand Store**: Files are the persistent state

---

## Implementation Phases

*Note: The detailed tasks.md file expands these into 10 phases (0-9) for granular task tracking.*

### Phase 0: Submodule Relocation

**Goal**: Move ii-spec to organized location

**Tasks**:
1. Remove existing `spec-kit/` submodule
2. Create `submodules/` directory
3. Add ii-spec at `submodules/ii-spec/`
4. Update all code references

### Phase 1: Dependencies & Setup

**Goal**: Install required packages and verify structure

### Phase 2: Backend (tRPC Router + Utilities)

**Goal**: Implement simplified tRPC router and backend utilities

**Key Files**:
- `src/main/lib/trpc/routers/speckit.ts`
- `src/main/lib/speckit/file-utils.ts`
- `src/main/lib/speckit/command-executor.ts`
- `src/main/lib/speckit/state-detector.ts`

**Key Procedures** (15 total):
1. `checkInitialization` - File system checks
2. `initializeSpecKit` - Run `specify init . --ai claude`
3. `getWorkflowState` - State detection logic
4. `getConstitution` - Read constitution.md
5. `getFeaturesList` - Directory listing
6. `getArtifact` - Read spec.md, plan.md, etc.
7. `getFeatureDescription` - Extract description from spec.md
8. `executeCommand` - Subprocess execution
9. `onCommandOutput` - Streaming subscription
10. `cancelCommand` - Cancel running command
11. `getCurrentBranch` - Get current Git branch
12. `getFeatureBranches` - List feature branches
13. `switchBranch` - Checkout branch
14. `openFileInEditor` - Open in system editor
15. `watchDirectory` / `onFileChange` - File watcher

### Phase 3: Frontend Types & Atoms

**Goal**: Create TypeScript types for all entities

**Key Files**:
- `src/renderer/features/speckit/types/feature.ts`
- `src/renderer/features/speckit/types/constitution.ts`
- `src/renderer/features/speckit/types/workflow-state.ts`
- `src/renderer/features/speckit/types/initialization.ts`
- `src/renderer/features/speckit/atoms/index.ts`

**All types have Zod schemas for validation**

### Phase 4-7: User Story Implementation

**Goal**: Build UI components for each user story

**User Stories** (in implementation order):
1. **US1** (Phase 3): Access SpecKit Workflow - Icon button, drawer, Plan page
2. **US4** (Phase 4): Create New Feature Workflow - Full-screen modal, stepper, all workflow steps including Implement step with task list and copy buttons
3. **US2** (Phase 5): View Constitution - Constitution section, modal
4. **US3** (Phase 6): Browse Previous Features - Features table, detail modal
5. **US5** (Phase 7): Submodule Integration - Verification

### Phase 8: Initialization Detection

**Goal**: Handle uninitialized SpecKit projects with one-click setup

### Phase 9: Polish & Cross-Cutting Concerns

**Goal**: Performance, accessibility, error handling, documentation

**Key Features**:
- Stale artifact warning banners (FR-032)
- Skip Clarify step warning (FR-033)
- Free navigation between completed steps (FR-036)

---

## Dependencies

### To Add

```bash
bun add react-markdown remark-gfm react-syntax-highlighter
bun add -D @types/react-syntax-highlighter
```

### Removed from Original Plan

- ❌ Zustand (state management not needed)

---

## Key Technical Decisions

### 1. File-Based State
**Decision**: Read Git branch + files instead of maintaining state
**Rationale**: Simpler, more reliable, leverages ii-spec's design

### 2. No Session Management
**Decision**: Git branch is the session
**Rationale**: No need to track sessions when files persist state

### 3. Subprocess Execution
**Decision**: Execute ii-spec commands via child_process
**Rationale**: Direct integration, stream output, pass-through errors

### 4. Pass-Through Errors
**Decision**: Show ii-spec errors as-is
**Rationale**: ii-spec errors are already user-friendly

### 5. Multiple Concurrent Workflows
**Decision**: Switch Git branches to change features
**Rationale**: Free via Git, no special handling needed

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

## Related Documentation

- **Navigation Guide**: `README.md` - Start here for document overview
- **Architecture**: `II_SPEC_NATIVE_ARCHITECTURE.md` - Complete architecture guide
- **Initialization**: `INITIALIZATION_DETECTION.md` - Init detection implementation
- **Workflow Study**: `WORKFLOW_ANALYSIS.md` - ii-spec workflow analysis
- **Data Model**: `data-model.md` - Entity definitions
- **Developer Guide**: `quickstart.md` - Setup and development workflow
- **tRPC Contract**: `contracts/trpc-router.ts` - API contract

---

## Next Steps

**Ready for**: `/speckit.tasks`

This will generate implementation tasks organized by:
- User story priority (P1, P2, P3)
- Implementation phase (0-6)
- Spatial grouping (which files to modify)

**Before Implementation**:
1. Review all planning documents
2. Ensure ii-spec submodule is accessible
3. Install new dependencies
4. Set up development environment
