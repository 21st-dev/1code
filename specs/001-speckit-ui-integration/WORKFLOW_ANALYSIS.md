# SpecKit Workflow Analysis: Complete Command Flow

**Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-01
**Purpose**: Comprehensive analysis of SpecKit workflow to inform UI implementation

## SpecKit Philosophy (From spec-driven.md)

**Core Concept**: Specifications as Executable Artifacts
- Specifications are the **source of truth**, not code
- Code is **generated output** that serves the specification
- Maintaining software means **evolving specifications**
- Changes to specs trigger systematic regenerations, not manual rewrites

**The SDD Workflow**:
1. Idea (vague) → Comprehensive PRD (through AI dialogue)
2. PRD → Implementation Plan (with research, rationale, architecture)
3. Plan → Tasks (executable, parallelizable)
4. Tasks → Code (generated from specs)
5. Production Reality → Spec Evolution (feedback loop)

---

## Pre-Workflow: Initialization Detection

**Purpose**: Ensure SpecKit is initialized before allowing workflow execution

**When**: Every time Plan page is opened

**What It Does**:
1. Checks for `.specify/` directory existence
2. Validates required subdirectories: `templates/`, `memory/`, `scripts/`
3. Validates essential template files exist
4. Returns initialization status

**Outputs**:
- Initialization status: `initialized: boolean`
- Missing components list: `string[]`
- Init command to display: `'specify init . --ai claude'`

**UI Requirements**:
- If not initialized → Show "Initialize SpecKit" prompt instead of constitution/features
- One-click initialization button runs `specify init . --ai claude`
- Show progress during initialization
- Auto-refresh Plan page after successful initialization
- Display clear error messages if initialization fails

**Implementation Details**: See `INITIALIZATION_DETECTION.md`

---

## Complete Command Sequence

### 1. `/speckit.constitution` (Once Per Project)

**Purpose**: Establish project-wide development principles

**When**: Before any features are created (or later to update)

**What It Does**:
1. Loads constitution template from `memory/constitution.md`
2. Collects principle values (from user input or inference)
3. Fills template with concrete principles (removes `[PLACEHOLDER]` tokens)
4. Validates against mandatory principles
5. Versions the constitution (semantic versioning: MAJOR.MINOR.PATCH)
6. Propagates changes to dependent templates (plan, spec, tasks templates)
7. Generates sync impact report

**Outputs**:
- `.specify/memory/constitution.md` (versioned, filled template)
- Sync impact report (HTML comment at top of file)

**UI Requirements**:
- Show form with principle input fields
- Display context/descriptions from SpecKit docs for each principle
- Show current version and allow incremental updates
- Allow returning to same chat session to modify later
- No timeout on input (user can take their time)

---

### 2. `/speckit.specify` (Once Per Feature)

**Purpose**: Create product-level feature specification

**When**: Starting a new feature

**What It Does**:
1. Generates short-name from feature description (2-4 words, kebab-case)
2. Checks existing branches/specs for highest feature number
3. Runs `create-new-feature.sh --json --number N --short-name "..." "description"`
   - Creates Git branch `NNN-short-name`
   - Creates `specs/NNN-short-name/` directory
   - Initializes `spec.md` from template
4. Fills spec template with user scenarios, requirements, success criteria
5. Makes **informed guesses** for unspecified details
6. **Marks ambiguities** with `[NEEDS CLARIFICATION: ...]` (max 3 markers)
7. Creates quality checklist at `checklists/requirements.md`
8. Validates spec against checklist
9. **If clarifications remain**: Presents options to user in markdown table format

**Outputs**:
- `specs/NNN-short-name/spec.md`
- `specs/NNN-short-name/checklists/requirements.md`
- Git branch `NNN-short-name` (created and checked out)

**Clarification Loop** (if `[NEEDS CLARIFICATION]` markers exist):
- Extract all markers from spec.md
- Present each as a question with options table + custom input
- User answers all questions (no timeout, can provide detailed answers)
- Re-run `/speckit.clarify` to update spec with answers
- Repeat until no markers remain

**UI Requirements**:
- Feature description input (initial step)
- Auto-execute `/speckit.specify` command with description
- **Parse output**: Extract `BRANCH_NAME` and `SPEC_FILE` from JSON
- Display generated spec.md in right pane
- **If clarifications needed**:
  - Parse spec.md for `[NEEDS CLARIFICATION: ...]` markers
  - Extract markdown table format for each question
  - Display custom question UI (no timeout, always show custom input)
  - Submit answers and re-run clarify
  - Loop until spec has no markers

---

### 3. `/speckit.clarify` (Iterative, Within Specify Step)

**Purpose**: Reduce ambiguity and missing decisions in spec

**When**: After `/speckit.specify`, before `/speckit.plan` (can run multiple times)

**What It Does**:
1. Runs `check-prerequisites.sh --json --paths-only`
2. Loads current spec.md
3. **Structured ambiguity scan** across 10 categories:
   - Functional scope & behavior
   - Domain & data model
   - Interaction & UX flow
   - Non-functional quality attributes
   - Integration & external dependencies
   - Edge cases & failure handling
   - Constraints & tradeoffs
   - Terminology & consistency
   - Completion signals
   - Misc / placeholders
4. Generates prioritized queue of clarification questions (max 5 per iteration)
5. **Asks questions one at a time** (not all at once)
6. Each question: multiple-choice (2-5 options) OR short-phrase (<= 5 words)
7. User answers question
8. Updates spec.md inline with answer (replaces ambiguity with concrete choice)
9. Re-scans spec for remaining ambiguities
10. Repeats until spec is sufficiently clear (max 10 total questions across all iterations)

**Outputs**:
- Updated `spec.md` with clarifications encoded inline
- Iteration count tracked

**UI Requirements**:
- NOT a separate step in stepper (embedded within Specify step)
- Show questions dynamically as they're generated
- Single-question UI (not all questions at once)
- Multiple-choice options + custom input field
- Real-time spec.md updates in right pane
- Progress indicator: "N clarifications remaining"

---

### 4. `/speckit.plan` (Once Per Feature)

**Purpose**: Create technical implementation plan from spec

**When**: After spec is finalized (no clarifications remaining)

**What It Does**:
1. Runs `setup-plan.sh --json` to get file paths
2. Loads spec.md and constitution.md
3. **Phase 0: Research** (resolves technical unknowns):
   - Identifies `NEEDS CLARIFICATION` in technical context
   - Researches tech choices, best practices, patterns
   - Generates `research.md` with decisions, rationale, alternatives
4. **Phase 1: Design & Contracts**:
   - Extracts entities from spec → `data-model.md`
   - Generates API contracts → `contracts/*.ts` or `contracts/*.yaml`
   - Creates `quickstart.md` for developer onboarding
   - Runs `update-agent-context.sh` to update CLAUDE.md
5. **Constitution Check** (both pre-Phase 0 and post-Phase 1):
   - Validates against all constitutional principles
   - Documents violations in complexity tracking table
6. Fills `plan.md` with architecture, phases, file structure

**Outputs**:
- `plan.md` (technical architecture, project structure, phase status)
- `research.md` (technology decisions with rationale)
- `data-model.md` (entity definitions, ERD, Zod schemas)
- `contracts/` (API contracts, tRPC router specs, OpenAPI/GraphQL schemas)
- `quickstart.md` (developer setup guide)
- Updated `CLAUDE.md` (agent context with new technologies)

**UI Requirements**:
- Auto-execute after specify step completion
- Show multi-step progress:
  - "Phase 0: Researching..." (with substep: "Researching [technology]")
  - "Phase 1: Designing..." (with substeps: "Generating data model", "Creating contracts", "Writing quickstart")
  - "Constitution Check..."
- Display each artifact in right pane as it's generated
- Allow navigation between artifacts (tabs or dropdown)

---

### 5. `/speckit.tasks` (Once Per Feature)

**Purpose**: Generate executable task list from plan

**When**: After plan is complete

**What It Does**:
1. Reads `plan.md`, `data-model.md`, `contracts/`, `research.md`
2. Derives tasks from contracts, entities, scenarios
3. Groups tasks by phase and code location (spatial grouping)
4. Marks independent tasks with `[P]` for parallelization
5. Generates task IDs and descriptions
6. Writes `tasks.md` in feature directory

**Outputs**:
- `tasks.md` (executable task list with phase grouping, parallel markers, file references)

**Spatial Grouping** (from user requirements):
- Tasks grouped by codebase location
- Related tasks shown together visually
- Example: All frontend/drawer tasks together, all backend/tRPC tasks together

**UI Requirements**:
- Auto-execute after plan approval
- Show progress: "Generating tasks from plan..."
- Display tasks.md in right pane with **spatial organization**:
  - Group by code location (backend, frontend, components, etc.)
  - Highlight parallel tasks `[P]`
  - Show task IDs and descriptions
  - Allow expanding/collapsing groups

---

### 6. `/speckit.analyze` (Optional Quality Check)

**Purpose**: Cross-artifact consistency and quality analysis

**When**: After tasks are generated, before implementation

**What It Does**:
1. Runs `check-prerequisites.sh --json --require-tasks --include-tasks`
2. Loads spec.md, plan.md, tasks.md, constitution.md
3. **Builds semantic models**:
   - Requirements inventory (functional + non-functional)
   - User story/action inventory
   - Task coverage mapping (tasks → requirements)
   - Constitution rule set
4. **Detection passes** (10 analyses):
   - Untraced requirements (no tasks cover them)
   - Orphan tasks (not linked to requirements)
   - Spec-plan mismatch (spec requires X, plan doesn't address it)
   - Plan-tasks mismatch (plan defines X, tasks don't implement it)
   - Constitution violations (plan/tasks violate principles)
   - Duplication (redundant tasks)
   - Ambiguity leakage (spec ambiguities not resolved)
   - Test coverage gaps (no acceptance test for requirement)
   - Underspecified tasks (vague descriptions)
   - Naming/terminology drift (inconsistent terms across artifacts)
5. **Generates structured analysis report** (read-only, no modifications)
6. Offers optional remediation plan (user must approve)

**Outputs**:
- Analysis report (markdown or JSON)
- Optional remediation plan

**UI Requirements**:
- Show as optional step in stepper (can skip)
- Display analysis report in right pane
- Highlight issues by severity (critical, warning, info)
- Show remediation suggestions if applicable
- Allow user to approve/reject remediation

---

### 7. `/speckit.implement` (Task Execution Preparation)

**Purpose**: Mark tasks as ready for implementation

**When**: After tasks (and optionally analyze) are complete

**What It Does** (from user requirements):
- **Does NOT execute code** (unlike traditional implementation)
- Marks feature as "ready to implement"
- Provides task summary with copy-paste functionality
- Allows user to copy task details and paste into active chat

**Outputs**:
- Status update (no new files)
- Task summary for manual execution

**UI Requirements**:
- Show task summary view
- Provide copy buttons for individual tasks
- Show "Feature ready for implementation" status
- Allow user to copy task descriptions to clipboard
- Link back to active chat for pasting

---

## Workflow State Transitions

```
Start
  ↓
Constitution (if not exists)
  ↓
Specify → [Clarify Loop] → Spec Complete
  ↓
Plan (Phase 0: Research → Phase 1: Design)
  ↓
Tasks (with spatial grouping)
  ↓
Analyze (optional) → Remediation
  ↓
Implement (mark ready)
  ↓
End (user copies tasks to active chat)
```

---

## UI Workflow Integration Requirements

### Stepper Steps (7 total)

1. **Constitution** - Once per project
   - Status: `completed` | `skipped` (if already exists)
   - Can return to modify later

2. **Specify** - Once per feature
   - Embedded clarify loop (dynamic step)
   - Status: `in-progress` (if clarifications needed) | `completed`

3. **Clarify** - Embedded in Specify (dynamic visibility)
   - Shows when `[NEEDS CLARIFICATION]` markers exist
   - Hides when spec is clear
   - Status: `in-progress` (questions remaining) | `completed`

4. **Plan** - Once per feature
   - Sub-steps: Research → Design → Contracts
   - Status: `in-progress` (show current sub-step) | `completed`

5. **Tasks** - Once per feature
   - Spatial grouping UI
   - Status: `in-progress` | `completed`

6. **Analyze** - Optional
   - Can be skipped
   - Status: `pending` | `in-progress` | `completed` | `skipped`

7. **Implement** - Preparation phase
   - Task summary with copy functionality
   - Status: `completed` (always, just marks ready)

### Auto-Command Execution

Each step auto-executes its SpecKit command:

- Constitution: `/speckit.constitution` + user principle inputs
- Specify: `/speckit.specify` + feature description
- Clarify: `/speckit.clarify` (triggered when markers detected)
- Plan: `/speckit.plan` (triggered after specify completion)
- Tasks: `/speckit.tasks` (triggered after plan completion)
- Analyze: `/speckit.analyze` (optional, user-triggered)
- Implement: No command, just UI state change

### Chat Integration Pattern

**How Commands are Executed** (from Agent Builder pattern):

1. User input → Modal UI state change
2. Modal sends message to chat session: `/speckit.[command] [args]`
3. Chat session (using existing IPCChatTransport):
   - Receives command
   - Invokes SpecKit CLI via tRPC procedure
   - Streams output back to modal
4. Modal parses output:
   - Extracts JSON (e.g., `BRANCH_NAME`, `SPEC_FILE`)
   - Updates workflow state (Zustand store)
   - Updates document viewer (right pane) with generated artifact
   - Advances to next step if command succeeds

**Session Persistence**:
- Chat session ID stored in Zustand store
- Allows modal close/reopen without losing context
- Workflow state (current step, clarifications, etc.) persisted to localStorage

---

## Clarification Loop Implementation Details

**Challenge**: SpecKit clarify asks questions **one at a time**, but our UI should support answering multiple questions in one view (better UX).

**Solution**: Hybrid approach:

1. **Initial Parse**: After `/speckit.specify`, scan spec.md for all `[NEEDS CLARIFICATION: ...]` markers
2. **Extract Questions**: Parse markdown format to build question objects
3. **Display All Questions**: Show all questions at once in custom UI (not one-by-one)
4. **User Answers All**: User fills in all answers before submitting
5. **Submit Batch**: Send all answers together via `/speckit.clarify` (or direct spec update)
6. **Re-scan**: After update, check for new clarifications (may appear after first round)
7. **Iterate**: Repeat until no markers remain

**Markdown Question Format** (from specify command):
```markdown
## Question [N]: [Topic]

**Context**: [Quote from spec]

**What we need to know**: [Specific question]

**Suggested Answers**:

| Option | Answer | Implications |
|--------|--------|--------------|
| A      | [First answer] | [What this means] |
| B      | [Second answer] | [What this means] |
| C      | [Third answer] | [What this means] |
| Custom | Provide your own answer | [How to provide custom input] |

**Your choice**: _[User's answer]_
```

**UI Parsing Logic**:
```typescript
interface ParsedClarification {
  number: string        // "Q1", "Q2", etc.
  topic: string
  context: string       // Quote from spec
  question: string
  options: {
    label: string       // "A", "B", "C", "Custom"
    answer: string
    implications: string
  }[]
  userAnswer?: string
}

function parseClarifications(specContent: string): ParsedClarification[] {
  // Regex to extract ## Question [N]: sections
  // Parse markdown table for options
  // Return array of structured questions
}
```

---

## Key Implementation Notes

### 1. Script Execution via tRPC

All bash scripts must be invoked from main process:

```typescript
// tRPC procedure example
executeSpecifyCommand: protectedProcedure
  .input(z.object({
    projectPath: z.string(),
    featureDescription: z.string(),
  }))
  .mutation(async ({ input }) => {
    const { stdout } = await execAsync(
      `.specify/scripts/bash/create-new-feature.sh --json "${input.featureDescription}"`,
      { cwd: input.projectPath }
    )
    const json = parseJSON(stdout) // Extract { BRANCH_NAME, SPEC_FILE, ... }
    return json
  })
```

### 2. File System Watching

Monitor artifact files for changes (auto-update right pane):

```typescript
// Use Node.js fs.watch or chokidar
const watcher = chokidar.watch('specs/001-speckit-ui-integration/*.md')
watcher.on('change', (filePath) => {
  // Notify renderer to reload document
  mainWindow.webContents.send('artifact-changed', { filePath })
})
```

### 3. Workflow State Persistence

Zustand store schema (refined):

```typescript
interface SpecKitWorkflowStore {
  sessions: Record<string, WorkflowSession> // Key: session ID
  activeSessionId: string | null

  // Methods
  createSession: (projectPath: string) => WorkflowSession
  updateSession: (id: string, updates: Partial<WorkflowSession>) => void
  pauseSession: (id: string) => void
  resumeSession: (id: string) => void
  completeSession: (id: string) => void
}

interface WorkflowSession {
  id: string
  chatSessionId: string
  projectPath: string
  featureId?: string // "001"
  currentStep: WorkflowStepName
  stepStatus: Record<WorkflowStepName, StepStatus>
  constitutionComplete: boolean

  // Specify step state
  specify: {
    description?: string
    specFilePath?: string
    clarificationsNeeded: ParsedClarification[]
    clarificationsAnswered: Record<string, string>
    iterationCount: number
  }

  // Plan step state
  plan: {
    researchComplete: boolean
    designComplete: boolean
    artifactPaths: {
      plan?: string
      research?: string
      dataModel?: string
      contracts?: string[]
      quickstart?: string
    }
  }

  // Tasks step state
  tasks: {
    generated: boolean
    tasksFilePath?: string
    taskCount: number
  }

  // Analyze step state (optional)
  analyze: {
    skipped: boolean
    reportPath?: string
  }

  // Timestamps
  startedAt: Date
  pausedAt?: Date
  completedAt?: Date
}
```

---

## Success Criteria for UI Implementation

Based on this workflow analysis, the UI must:

1. **Accurately reflect SpecKit command sequence** (7 steps with proper transitions)
2. **Support clarification loop** (dynamic question UI, batch answers, iteration)
3. **Show multi-step progress** (Plan has sub-steps: Research → Design)
4. **Display artifacts in real-time** (right pane updates as files are generated)
5. **Allow workflow pause/resume** (close modal, reopen, continue where left off)
6. **Support optional steps** (Analyze can be skipped)
7. **Provide task copy functionality** (Implement step allows copying tasks to clipboard)
8. **Maintain session persistence** (workflow state survives app restart)

---

## Next Steps

With this comprehensive workflow understanding:

1. Update `plan.md` to reflect accurate SpecKit command flow
2. Refine modal stepper design to show sub-steps (especially for Plan)
3. Design clarification UI to support batch question answering
4. Create tRPC procedures for each SpecKit command execution
5. Implement file watching for artifact auto-updates
6. Build workflow state machine in Zustand store
