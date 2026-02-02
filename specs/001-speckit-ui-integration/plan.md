# Implementation Plan: Fix Plan Page and Workflow Modal Issues

**Branch**: `001-speckit-ui-integration` | **Date**: 2026-02-02 | **Spec**: [link](../spec.md)
**Input**: Feature specification from `/specs/001-speckit-ui-integration/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Fix two critical UI issues in the SpecKit Plan page integration:
1. **New Feature Flow button visibility**: Button should only appear on named feature branches (not main/master/internal/staging/dev), and clicking it should open the workflow modal in empty state
2. **Workflow modal height**: Both panes must occupy 100% of available container height regardless of content volume

## Technical Context

**Language/Version**: TypeScript 5.4.5, React 19, Electron 33.4.5
**Primary Dependencies**: React components, Electron IPC (tRPC), CSS/styling system
**Storage**: N/A - This is a UI fix, no data persistence changes
**Testing**: E2E tests for UI flows, unit tests for branch detection logic
**Target Platform**: macOS/Windows/Linux desktop (Electron)
**Project Type**: Single Electron desktop app
**Performance Goals**: UI renders instantly, no layout shifts, smooth height transitions
**Constraints**: Must maintain existing drawer/modal component patterns
**Scale/Scope**: Single feature branch, two related bug fixes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `/specify/memory/constitution.md`:

**Principle I - Desktop-First Experience**:
- [x] Feature works offline-first with local data storage (UI-only fix)
- [x] Uses native Electron APIs where applicable (dialogs, notifications, etc.) - N/A
- [x] IPC uses type-safe tRPC patterns - N/A
- [x] State persists across app restarts - N/A
- [x] Platform-specific features degrade gracefully - N/A

**Principle II - Git Worktree Isolation** (NON-NEGOTIABLE):
- [x] Feature respects worktree boundaries (does not bypass isolation) - N/A for UI

**Principle III - Type Safety & Data Integrity**:
- [x] All tRPC routers have Zod input schemas - N/A
- [x] Database changes use Drizzle migrations only (no manual SQL) - N/A
- [x] No `any` types without explicit justification
- [x] Preload APIs are fully typed - N/A

**Principle IV - User Transparency & Control**:
- [x] Tool executions render in real-time - N/A
- [x] Changes show diff previews before applying - N/A
- [x] Error messages are actionable with recovery suggestions
- [x] Background operations show progress and allow cancellation - N/A

**Principle V - Performance & Responsiveness**:
- [x] Operations >100ms run in background/workers - N/A
- [x] Large files stream (not loaded entirely into memory) - N/A
- [x] Database queries use indexes, avoid N+1 patterns - N/A
- [x] React components properly memoized

**Development Standards**:
- [x] Testing strategy defined (E2E for UI, unit for logic)
- [x] Follows code organization patterns (file naming, module structure)
- [x] Uses conventional commit format

**Post-Design Re-check**: All checks pass. No deviations identified.

## Project Structure

### Documentation (this feature)

```text
specs/001-speckit-ui-integration/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── renderer/
│   └── features/
│       └── speckit/            # SpecKit feature components
│           ├── components/
│           │   ├── PlanPage.tsx        # Plan page component
│           │   ├── WorkflowModal.tsx   # Workflow modal component
│           │   └── NewFeatureButton.tsx # New feature button
│           └── hooks/
│               └── useBranchDetection.ts # Branch type detection hook
```

**Structure Decision**: Feature components organized under `src/renderer/features/speckit/` following existing patterns.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Phase 0: Research

### Unknowns to Resolve

1. **Branch detection implementation**: How is the current Git branch determined in the existing codebase? Is there an existing hook or API?
2. **Protected branch list**: Are protected branches defined anywhere, or should they be hardcoded constants?
3. **Modal layout**: What CSS/styling system is used for layout (Tailwind, CSS modules, inline styles)?

### Research Tasks

- [x] Research current branch detection mechanism in the codebase
- [x] Research existing drawer/modal component patterns
- [x] Research CSS approach for layout (flexbox/grid heights)

**Research Complete** - Findings documented in `research.md`

## Phase 1: Design

### Data Model (for UI state)

- **BranchType**: Enum representing branch classification
  - `NAMED_FEATURE` - any branch not matching protected patterns
  - `PROTECTED` - main, master, internal, staging, dev

### Component Changes

1. **NewFeatureButton**:
   - Conditionally render based on branch type
   - OnClick handler to open workflow modal in empty state

2. **WorkflowModal**:
   - Update CSS to use `height: 100%` or `flex: 1` for both panes
   - Ensure parent container has explicit height

### API Contracts

N/A - This is a UI-only change with no backend API changes.

**Design Complete** - Data model documented in `data-model.md` (Appendix A)

## Phase 2: Implementation Tasks

### Task Group 1: Branch Detection Types

| Task ID | Description | Status |
|---------|-------------|--------|
| T-001 | Create `src/renderer/features/speckit/types/branch.ts` with `BranchType` enum, `PROTECTED_BRANCHES` constant, and utility functions | Pending |
| T-002 | Create `src/renderer/features/speckit/types/workflow.ts` with `WorkflowStartMode` enum | Pending |
| T-003 | Create `src/renderer/features/speckit/hooks/useBranchDetection.ts` hook | Pending |
| T-004 | Update `src/renderer/features/speckit/atoms/index.ts` with branch detection atoms | Pending |
| T-005 | Update `src/renderer/features/speckit/types/index.ts` to export new types | Pending |

### Task Group 2: New Feature Button

| Task ID | Description | Status |
|---------|-------------|--------|
| T-006 | Add "New Feature" button to `plan-page.tsx` header, conditionally rendered based on `isNamedFeature` | Pending |
| T-007 | Implement `handleNewFeature` function to set start mode and open modal | Pending |
| T-008 | Wire up button click to trigger new feature workflow in empty state | Pending |

### Task Group 3: Modal Height Fixes

| Task ID | Description | Status |
|---------|-------------|--------|
| T-009 | Add `min-h-0` to workflow modal's main flex container in `workflow-modal.tsx` | Pending |
| T-010 | Add `min-h-0` to left pane container for proper flex scrolling | Pending |
| T-011 | Ensure `DocumentPane` component uses full height (`h-full` class) | Pending |

### Task Group 4: Testing and Validation

| Task ID | Description | Status |
|---------|-------------|--------|
| T-012 | Test button visibility on protected branches (main, dev, staging) | Pending |
| T-013 | Test button visibility on named feature branch (`001-test`) | Pending |
| T-014 | Test modal height with minimal content | Pending |
| T-015 | Test modal height with maximal content | Pending |
| T-016 | Test browser resize behavior | Pending |

### Implementation Order

1. **First**: Create types (T-001, T-002) - foundation for all other changes
2. **Second**: Create hook (T-003) - provides branch detection logic
3. **Third**: Add atoms (T-004) - provides UI state management
4. **Fourth**: Add button to plan page (T-006, T-007, T-008) - user-facing feature
5. **Fifth**: Fix modal height (T-009, T-010, T-011) - CSS fix
6. **Sixth**: Testing (T-012 through T-016) - validate all changes

### Quick Reference Files

| File | Purpose |
|------|---------|
| `src/main/lib/speckit/file-utils.ts` | Existing `getCurrentBranch()` function |
| `src/renderer/features/speckit/components/plan-page.tsx` | Plan page with header |
| `src/renderer/features/speckit/components/workflow-modal.tsx` | Workflow modal with dual panes |
| `src/renderer/features/speckit/atoms/index.ts` | Existing Jotai atoms |

---
