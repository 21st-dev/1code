# ii-spec Native Architecture

**Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-01
**Purpose**: Define the ii-spec native approach - using the submodule directly for all SpecKit functionality

---

## Paradigm Shift: ii-spec is the Source of Truth

Based on user clarifications, we are **NOT** wrapping SpecKit functionality - we are directly using ii-spec (the submodule) as the execution engine and relying on its file-based state management.

### Key Principles

1. **ii-spec Owns State**: All workflow state is stored in files by ii-spec itself (specs/, .specify/)
2. **Branch = Active Feature**: Current Git branch determines which feature workflow is active
3. **File-Based Resume**: Workflow progress is read from existing files (spec.md, plan.md, etc.)
4. **Multiple Concurrent Workflows**: Users can switch between features by changing branches
5. **No State Duplication**: UI does NOT maintain workflow state - it reads from ii-spec's files
6. **Pass-Through Errors**: ii-spec errors are shown as-is in the UI

---

## Submodule Relocation Plan

### Current Location (Temporary)

```
/Users/caronex/Work/CaronexLabs/ii/ii-client/
└── spec-kit/          # Currently at project root (clutters top level)
```

**Issue**: Root-level submodule clutters the project directory alongside src/, build/, etc.

### Proposed Location (Better Organization)

```
/Users/caronex/Work/CaronexLabs/ii/ii-client/
└── submodules/
    └── ii-spec/       # Grouped with potential future submodules
```

**Benefits**:
- Clear separation of external dependencies
- Scalable for future submodules
- Doesn't clutter root directory
- Follows common monorepo patterns

### Alternative Location (Internal Integration)

```
/Users/caronex/Work/CaronexLabs/ii/ii-client/
└── internal/
    └── ii-spec/       # Treat as internal tool dependency
```

**Benefits**:
- Groups with other internal tooling
- Emphasizes ii-spec as core functionality
- Aligns with existing `internal/` directory structure

### Recommended: `submodules/ii-spec/`

This provides the best balance of organization and clarity.

### Migration Steps

```bash
# 1. Remove existing submodule
git submodule deinit -f spec-kit
git rm -f spec-kit
rm -rf .git/modules/spec-kit

# 2. Create submodules directory
mkdir -p submodules

# 3. Add submodule in new location
git submodule add git@github.com:SameeranB/ii-spec.git submodules/ii-spec

# 4. Update .gitmodules
git add .gitmodules submodules/ii-spec

# 5. Commit the change
git commit -m "refactor: relocate spec-kit to submodules/ii-spec"
```

### Code Changes Required

**Update all references** from `spec-kit` to `submodules/ii-spec`:

1. **tRPC Procedures**: Update paths to ii-spec commands
2. **Process Spawning**: Update command paths
3. **Documentation**: Update all README/docs references

---

## File-Based State Management

### How ii-spec Tracks State

ii-spec does NOT use a database or in-memory state. Everything is tracked via:

1. **Git Branch**: Feature number encoded in branch name (e.g., `001-speckit-ui-integration`)
2. **Spec Files**: Existence and content of artifacts determine workflow progress
3. **File Markers**: `[NEEDS CLARIFICATION]` markers indicate pending work

### State Detection Logic

```typescript
interface WorkflowState {
  featureNumber: string         // From git branch (e.g., "001")
  featureName: string          // From git branch (e.g., "speckit-ui-integration")
  currentStep: WorkflowStep    // Derived from file existence
  artifactsPresent: {
    spec: boolean              // specs/001-*/spec.md exists
    plan: boolean              // specs/001-*/plan.md exists
    research: boolean          // specs/001-*/research.md exists
    tasks: boolean             // specs/001-*/tasks.md exists
  }
  needsClarification: boolean  // spec.md contains [NEEDS CLARIFICATION]
  constitutionExists: boolean  // .specify/memory/constitution.md exists
}

function detectWorkflowState(projectPath: string): WorkflowState {
  // 1. Get current branch
  const branch = execSync('git branch --show-current', { cwd: projectPath })
    .toString()
    .trim()

  // 2. Parse feature number and name from branch (e.g., "001-speckit-ui-integration")
  const match = branch.match(/^(\d{3})-(.+)$/)
  if (!match) {
    return { currentStep: 'no-feature' }
  }

  const [, featureNumber, featureName] = match
  const featureDir = path.join(projectPath, 'specs', branch)

  // 3. Check which files exist
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
  let currentStep: WorkflowStep
  if (!artifactsPresent.spec) {
    currentStep = 'specify'
  } else if (needsClarification) {
    currentStep = 'clarify'
  } else if (!artifactsPresent.plan) {
    currentStep = 'plan'
  } else if (!artifactsPresent.tasks) {
    currentStep = 'tasks'
  } else {
    currentStep = 'implement'
  }

  // 6. Check constitution
  const constitutionExists = fs.existsSync(
    path.join(projectPath, '.specify', 'memory', 'constitution.md')
  )

  return {
    featureNumber,
    featureName,
    currentStep,
    artifactsPresent,
    needsClarification,
    constitutionExists,
  }
}
```

---

## Workflow Execution via ii-spec Commands

### No Custom Workflow Engine Needed

We do NOT need to build a workflow state machine. ii-spec handles this via its commands:

```bash
# ii-spec commands automatically handle state transitions
/speckit.constitution    # Creates .specify/memory/constitution.md
/speckit.specify         # Creates specs/NNN-*/spec.md, checks out branch
/speckit.clarify         # Updates spec.md, removes markers
/speckit.plan            # Creates plan.md, research.md, data-model.md
/speckit.tasks           # Creates tasks.md
/speckit.analyze         # Validates cross-artifact consistency
/speckit.implement       # Marks tasks ready
```

### UI Role: Display & Invoke

The UI's job is to:

1. **Read** current workflow state from files
2. **Display** appropriate UI for current step
3. **Invoke** ii-spec commands via subprocess
4. **Stream** command output to chat pane
5. **Refresh** after command completes (re-read files)

### Command Invocation Pattern

```typescript
async function executeSpecKitCommand(
  command: string,
  args: string,
  projectPath: string,
  onOutput: (chunk: string) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Spawn ii-spec command
    const proc = spawn(
      command,
      [args],
      {
        cwd: projectPath,
        shell: true,
        env: {
          ...process.env,
          // Pass Claude API key if needed
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      }
    )

    // Stream stdout to UI
    proc.stdout.on('data', (data) => {
      onOutput(data.toString())
    })

    // Stream stderr to UI (don't hide errors)
    proc.stderr.on('data', (data) => {
      onOutput(data.toString())
    })

    // Handle completion
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `Command exited with code ${code}` })
      }
    })
  })
}
```

---

## Multiple Concurrent Workflows

### How It Works

Users can start multiple features and switch between them:

```bash
# User starts feature A
git checkout -b 001-feature-a
# Work on feature A...

# User starts feature B (pausing A)
git checkout -b 002-feature-b
# Work on feature B...

# User resumes feature A
git checkout 001-feature-a
# Continue where they left off
```

**ii-spec tracks progress per branch via files**:
- `specs/001-feature-a/spec.md` (Feature A state)
- `specs/002-feature-b/spec.md` (Feature B state)

**UI behavior**:
- When branch changes, re-detect workflow state
- Display current step based on files present
- Allow resuming from detected step

### No Special Handling Required

The UI does NOT need to:
- Track which workflows are "active" vs "paused"
- Maintain a queue of workflows
- Prevent starting new workflows

Simply read the current branch and display appropriate UI.

---

## Workflow Resume Logic

### Scenario: User Re-Opens a Feature

User checks out an existing feature branch:

```bash
git checkout 003-authentication
```

**UI Response**:

1. **Detect current state** (via `detectWorkflowState()`)
2. **Read existing files**:
   - `specs/003-authentication/spec.md` exists → Spec step complete
   - `specs/003-authentication/plan.md` missing → Plan step pending
3. **Determine current step**: `plan`
4. **Show modal at Plan step** with:
   - Left pane: Chat ready to run `/speckit.plan`
   - Right pane: Display existing `spec.md`
   - Stepper: Mark "Specify" as complete, "Plan" as current

### Resuming Partial Clarification

If `spec.md` exists but has `[NEEDS CLARIFICATION]` markers:

1. **Detect**: Parse spec.md for markers
2. **Extract questions**: Find all `[NEEDS CLARIFICATION: ...]` text
3. **Display**: Show clarification questions UI
4. **On submit**: Run `/speckit.clarify` with answers
5. **Refresh**: Re-read spec.md to check if markers removed

---

## Error Handling: Pass-Through Approach

### Principle: Show ii-spec Errors As-Is

When ii-spec commands fail, we show the stderr output directly in the UI.

**Example**:

```bash
$ /speckit.plan

ERROR: spec.md not found in /path/to/project/specs/001-feature
Please run /speckit.specify first.
```

**UI Display** (in chat pane):

```
❌ Error executing /speckit.plan

spec.md not found in /path/to/project/specs/001-feature
Please run /speckit.specify first.
```

**No Translation Needed**: ii-spec errors are already user-friendly.

### When to Add UI-Level Errors

Only add custom error handling for **our** system failures:

- tRPC connection errors
- File system permission errors
- Process spawn failures
- Invalid project path

**Example**:

```typescript
try {
  await executeSpecKitCommand('/speckit.plan', '', projectPath, onOutput)
} catch (error) {
  // UI-level error (our failure, not ii-spec's)
  showError('Failed to execute command: ' + error.message)
}
```

---

## Simplified tRPC Router

### What We Actually Need

With the ii-spec native approach, our tRPC procedures become much simpler:

```typescript
export const speckitRouter = {
  // ==========================================
  // Initialization
  // ==========================================
  checkInitialization: {
    input: z.object({ projectPath: z.string() }),
    output: z.object({
      initialized: boolean,
      missingComponents: z.array(z.string()),
    }),
  },

  initializeSpecKit: {
    input: z.object({ projectPath: z.string() }),
    output: z.object({ success: boolean, error: z.string().optional() }),
  },

  // ==========================================
  // Workflow State Detection (Read-Only)
  // ==========================================
  getWorkflowState: {
    input: z.object({ projectPath: z.string() }),
    output: WorkflowStateSchema,
  },

  // ==========================================
  // File Reading (for UI display)
  // ==========================================
  getConstitution: {
    input: z.object({ projectPath: z.string() }),
    output: z.object({ content: z.string(), exists: boolean }),
  },

  getFeaturesList: {
    input: z.object({ projectPath: z.string() }),
    output: z.array(FeatureSchema),
  },

  getArtifact: {
    input: z.object({
      projectPath: z.string(),
      featureBranch: z.string(),
      artifactType: z.enum(['spec', 'plan', 'research', 'tasks']),
    }),
    output: z.object({ content: z.string(), exists: boolean }),
  },

  // ==========================================
  // Command Execution
  // ==========================================
  executeCommand: {
    input: z.object({
      projectPath: z.string(),
      command: z.string(),  // e.g., '/speckit.specify'
      args: z.string(),     // User's input
    }),
    output: z.object({ success: boolean, error: z.string().optional() }),
  },

  // Streaming output
  onCommandOutput: {
    input: z.object({ projectPath: z.string() }),
    output: z.object({ chunk: z.string() }),
  },
}
```

**Removed**:
- ❌ `startWorkflowSession` (no session state needed)
- ❌ `updateWorkflowStep` (ii-spec manages this via files)
- ❌ `extractClarifications` (read from spec.md directly)
- ❌ `submitClarifications` (just call `/speckit.clarify`)
- ❌ Complex workflow orchestration procedures

---

## UI State Management (Simplified)

### Jotai (Ephemeral UI State)

```typescript
// Modal open/closed
export const speckitModalOpenAtom = atom(false)

// Currently displayed document
export const speckitCurrentDocumentAtom = atom<{
  type: 'spec' | 'plan' | 'research' | 'tasks' | 'constitution'
  content: string
} | null>(null)

// Loading states
export const speckitLoadingAtom = atom(false)
```

### Zustand (Persistent State)

**Not needed!** ii-spec files are the persistent state.

Only use localStorage for UI preferences:

```typescript
interface SpeckitUIPreferences {
  drawerOpen: boolean
  lastViewedFeature?: string
  modalSplitRatio: number
}
```

---

## Simplified Component Architecture

### Plan Page (Drawer Widget)

```tsx
function PlanPage() {
  const { data: initStatus } = trpc.speckit.checkInitialization.useQuery({ projectPath })
  const { data: workflowState } = trpc.speckit.getWorkflowState.useQuery({ projectPath })
  const { data: constitution } = trpc.speckit.getConstitution.useQuery({ projectPath })
  const { data: features } = trpc.speckit.getFeaturesList.useQuery({ projectPath })

  if (!initStatus?.initialized) {
    return <InitializationPrompt />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Constitution Section */}
      <ConstitutionSection constitution={constitution} />

      {/* Features Section */}
      <FeaturesSection
        features={features}
        currentFeature={workflowState?.featureNumber}
      />
    </div>
  )
}
```

### Workflow Modal

```tsx
function SpecKitWorkflowModal() {
  const { data: workflowState } = trpc.speckit.getWorkflowState.useQuery({ projectPath })
  const executeCmd = trpc.speckit.executeCommand.useMutation()

  // Resume from detected step
  const currentStep = workflowState?.currentStep || 'specify'

  async function handleExecuteCommand(command: string, args: string) {
    await executeCmd.mutateAsync({ projectPath, command, args })

    // Refresh workflow state after command completes
    await refetchWorkflowState()
  }

  return (
    <AgentDocumentModal
      chat={{
        onCommand: handleExecuteCommand,
        currentStep,
      }}
      document={{
        content: workflowState?.artifactsPresent.spec
          ? await loadArtifact('spec')
          : '',
      }}
      stepper={{
        steps: SPECKIT_STEPS,
        currentStep,
      }}
    />
  )
}
```

---

## Benefits of ii-spec Native Approach

### 1. **Simplicity**
- No complex state management
- No workflow orchestration logic
- No session persistence needed

### 2. **Reliability**
- Single source of truth (files)
- Works offline (no database dependency)
- Git is the state manager (proven, reliable)

### 3. **Flexibility**
- Users can switch features freely
- Workflows can be paused indefinitely
- Manual file edits are respected

### 4. **Maintainability**
- Less code to maintain
- ii-spec handles workflow logic
- UI is just a view layer

### 5. **Direct ii-spec Integration**
- Can modify ii-spec submodule directly
- Changes propagate to UI automatically
- No abstraction layer to maintain

---

## Implementation Checklist

### Phase 1: Submodule Relocation

- [ ] Move `spec-kit/` to `submodules/ii-spec/`
- [ ] Update all code references to new path
- [ ] Test submodule commands still work

### Phase 2: Simplified tRPC Router

- [ ] Remove complex workflow session procedures
- [ ] Keep only: init check, file reading, command execution
- [ ] Add streaming output subscription

### Phase 3: File-Based State Detection

- [ ] Implement `detectWorkflowState()` function
- [ ] Parse Git branch for feature number/name
- [ ] Check file existence for artifacts
- [ ] Parse spec.md for clarification markers

### Phase 4: UI Implementation

- [ ] Plan page with init check + constitution + features
- [ ] Modal workflow with stepper
- [ ] Command execution with streaming output
- [ ] Automatic refresh after commands

### Phase 5: Testing

- [ ] Test workflow resume from each step
- [ ] Test multiple concurrent features
- [ ] Test error pass-through
- [ ] Test branch switching

---

## Summary

**Key Changes from Original Plan**:

1. ✅ **Use ii-spec directly** (not wrap it)
2. ✅ **Files are state** (not database/memory)
3. ✅ **Branch = active feature** (Git is the state manager)
4. ✅ **No workflow orchestration** (ii-spec handles it)
5. ✅ **Pass-through errors** (show ii-spec errors as-is)
6. ✅ **Relocate submodule** to `submodules/ii-spec/`

**Result**: Much simpler, more reliable architecture that leverages ii-spec's design rather than fighting it.
