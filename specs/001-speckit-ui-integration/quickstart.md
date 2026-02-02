# Quickstart: SpecKit UI Integration Development (ii-spec Native)

**Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-01
**Updated**: 2026-02-01 (Simplified for ii-spec native architecture)
**For**: Developers implementing this feature

---

## Architecture Overview (Read This First!)

This feature uses the **ii-spec native approach**:

- ✅ ii-spec submodule at `submodules/ii-spec/` owns all workflow state
- ✅ Files (specs/, .specify/) are the source of truth
- ✅ Git branch determines active feature
- ✅ UI reads files and executes ii-spec commands via subprocess
- ❌ NO custom workflow state management
- ❌ NO Zustand store for workflow sessions
- ❌ NO database changes

**See**: `II_SPEC_NATIVE_ARCHITECTURE.md` for full details.

---

## Prerequisites

Before starting development, ensure you have:

- [ ] Node.js 18+ and Bun installed
- [ ] Git configured with SSH access to GitHub
- [ ] Cloned the `ii-client` repository
- [ ] Checked out the `001-speckit-ui-integration` branch
- [ ] Read `II_SPEC_NATIVE_ARCHITECTURE.md`

---

## Setup Steps

### 1. Relocate ii-spec Submodule

**Current Location**: `spec-kit/` (at project root)
**Target Location**: `submodules/ii-spec/`

```bash
cd /path/to/ii-client

# Remove existing submodule
git submodule deinit -f spec-kit
git rm -f spec-kit
rm -rf .git/modules/spec-kit

# Create submodules directory
mkdir -p submodules

# Add submodule in new location
git submodule add git@github.com:SameeranB/ii-spec.git submodules/ii-spec

# Initialize and update
git submodule update --init --recursive

# Verify
ls -la submodules/ii-spec/
```

### 2. Install Dependencies

```bash
# Add markdown rendering dependencies
bun add react-markdown remark-gfm react-syntax-highlighter
bun add -D @types/react-syntax-highlighter
```

### 3. Verify Project Structure

```bash
# Verify ii-spec is initialized
ls -la .specify/memory/constitution.md  # Should exist
ls -la .specify/templates/              # Should exist
ls -la specs/                           # Should exist

# Verify submodule
ls -la submodules/ii-spec/              # Should exist after step 1
```

### 4. Run the Application

```bash
# Start development mode
bun run dev

# App should launch - verify existing functionality works
```

---

## Development Workflow

### Phase 1: Backend (tRPC Router)

**Goal**: Create simplified tRPC router that reads files and executes ii-spec commands.

**File**: `src/main/lib/trpc/routers/speckit.ts`

**Reference**: `contracts/trpc-router-simplified.ts`

#### 1.1 Create Router File

```bash
touch src/main/lib/trpc/routers/speckit.ts
```

#### 1.2 Implement Core Procedures

Focus on these key procedures (in order):

1. **checkInitialization** - Check if `.specify/` exists
2. **getWorkflowState** - Read Git branch + check file existence
3. **getConstitution** - Read `.specify/memory/constitution.md`
4. **getFeaturesList** - List `specs/` directory
5. **getArtifact** - Read artifact file (spec.md, plan.md, etc.)
6. **executeCommand** - Run ii-spec command via subprocess
7. **onCommandOutput** - Stream command output (subscription)

**Key Implementation Helpers**:

```typescript
// src/main/lib/speckit/file-utils.ts

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export function getCurrentBranch(projectPath: string): string {
  return execSync('git branch --show-current', { cwd: projectPath })
    .toString()
    .trim()
}

export function parseFeatureBranch(branchName: string): {
  featureNumber: string
  featureName: string
} | null {
  const match = branchName.match(/^(\d{3})-(.+)$/)
  if (!match) return null
  return { featureNumber: match[1], featureName: match[2] }
}

export function checkFileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

export function readFileContent(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

export function listFeatureDirectories(projectPath: string): string[] {
  const specsDir = path.join(projectPath, 'specs')
  if (!fs.existsSync(specsDir)) return []

  return fs.readdirSync(specsDir)
    .filter(name => /^\d{3}-/.test(name))
    .sort()
}
```

#### 1.3 Register Router

```typescript
// src/main/lib/trpc/index.ts

import { speckitRouter } from './routers/speckit'

export const appRouter = router({
  // ... existing routers
  speckit: speckitRouter,
})
```

#### 1.4 Test Backend

```bash
# Use Electron DevTools console in renderer process
window.api.trpc.speckit.checkInitialization.query({ projectPath: '/path/to/ii-client' })
```

---

### Phase 2: Frontend (UI Components)

**Goal**: Create Plan page drawer widget and workflow modal.

**Files**:
```
src/renderer/features/speckit/
├── types/
│   ├── index.ts                    # Re-export all types
│   ├── feature.ts                  # SpecKitFeature
│   ├── constitution.ts             # Constitution
│   ├── workflow-state.ts           # WorkflowState
│   ├── initialization.ts           # InitializationStatus
│   └── ui-models.ts                # FeatureTableRow, ConstitutionPreview
├── components/
│   ├── plan-page.tsx               # Main drawer widget
│   ├── initialization-prompt.tsx   # Shown when not initialized
│   ├── constitution-section.tsx    # Constitution preview + button
│   ├── features-table.tsx          # Features list
│   └── workflow-modal.tsx          # Full-screen modal
├── hooks/
│   ├── use-workflow-state.ts       # Hook for getWorkflowState query
│   ├── use-execute-command.ts      # Hook for executeCommand mutation
│   └── use-command-output.ts       # Hook for onCommandOutput subscription
└── atoms/
    └── index.ts                    # Jotai atoms (modal open, current doc)
```

#### 2.1 Create Types

Copy type definitions from `data-model-simplified.md`:

```typescript
// src/renderer/features/speckit/types/feature.ts

import { z } from 'zod'

export const ArtifactPresenceSchema = z.object({
  spec: z.boolean(),
  plan: z.boolean(),
  research: z.boolean(),
  tasks: z.boolean(),
})

export type ArtifactPresence = z.infer<typeof ArtifactPresenceSchema>

export const SpecKitFeatureSchema = z.object({
  featureNumber: z.string().regex(/^\d{3}$/),
  shortName: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  branchName: z.string(),
  description: z.string().optional(),
  artifacts: ArtifactPresenceSchema,
})

export type SpecKitFeature = z.infer<typeof SpecKitFeatureSchema>
```

#### 2.2 Create Atoms

```typescript
// src/renderer/features/speckit/atoms/index.ts

import { atom } from 'jotai'

export const speckitModalOpenAtom = atom(false)

export const speckitCurrentDocumentAtom = atom<{
  type: 'spec' | 'plan' | 'research' | 'tasks' | 'constitution'
  content: string
} | null>(null)

export const speckitLoadingAtom = atom(false)
```

#### 2.3 Create Plan Page

```typescript
// src/renderer/features/speckit/components/plan-page.tsx

import { trpc } from '@/lib/trpc'

export function PlanPage() {
  const projectPath = useAtomValue(selectedProjectPathAtom)

  const { data: initStatus } = trpc.speckit.checkInitialization.useQuery({
    projectPath,
  })

  if (!initStatus?.initialized) {
    return <InitializationPrompt projectPath={projectPath} />
  }

  return (
    <div className="flex flex-col h-full">
      <ConstitutionSection projectPath={projectPath} />
      <FeaturesSection projectPath={projectPath} />
    </div>
  )
}
```

#### 2.4 Create Workflow Modal

```typescript
// src/renderer/features/speckit/components/workflow-modal.tsx

import { useAtom, useAtomValue } from 'jotai'
import { speckitModalOpenAtom } from '../atoms'
import { trpc } from '@/lib/trpc'

export function SpecKitWorkflowModal() {
  const [open, setOpen] = useAtom(speckitModalOpenAtom)
  const projectPath = useAtomValue(selectedProjectPathAtom)

  const { data: workflowState } = trpc.speckit.getWorkflowState.useQuery({
    projectPath,
  })

  const executeCmd = trpc.speckit.executeCommand.useMutation()

  async function handleExecuteCommand(command: string, args: string) {
    await executeCmd.mutateAsync({ projectPath, command, args })
    // Refresh workflow state after command completes
    // (React Query auto-refetch handles this)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-screen-xl h-screen">
        {/* Dual-pane layout */}
        <AgentDocumentModal
          currentStep={workflowState?.currentStep}
          onExecuteCommand={handleExecuteCommand}
        />
      </DialogContent>
    </Dialog>
  )
}
```

---

### Phase 3: Command Execution (Subprocess)

**Goal**: Execute ii-spec commands and stream output.

**File**: `src/main/lib/speckit/command-executor.ts`

```typescript
import { spawn } from 'child_process'
import { EventEmitter } from 'events'

export interface CommandExecution {
  id: string
  process: ReturnType<typeof spawn>
  emitter: EventEmitter
}

const executions = new Map<string, CommandExecution>()

export function executeCommand(
  projectPath: string,
  command: string,
  args: string
): { executionId: string } {
  const executionId = crypto.randomUUID()
  const emitter = new EventEmitter()

  // Spawn ii-spec command
  const proc = spawn(
    command,
    [args],
    {
      cwd: projectPath,
      shell: true,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    }
  )

  // Store execution
  executions.set(executionId, { id: executionId, process: proc, emitter })

  // Stream stdout
  proc.stdout.on('data', (data) => {
    emitter.emit('output', { stream: 'stdout', chunk: data.toString() })
  })

  // Stream stderr
  proc.stderr.on('data', (data) => {
    emitter.emit('output', { stream: 'stderr', chunk: data.toString() })
  })

  // Handle completion
  proc.on('close', (code) => {
    emitter.emit('done', { code })
    executions.delete(executionId)
  })

  return { executionId }
}

export function getExecutionEmitter(executionId: string): EventEmitter | null {
  return executions.get(executionId)?.emitter || null
}

export function cancelExecution(executionId: string): boolean {
  const execution = executions.get(executionId)
  if (!execution) return false

  execution.process.kill()
  executions.delete(executionId)
  return true
}
```

**tRPC Integration**:

```typescript
// In speckit router

import { observable } from '@trpc/server/observable'
import { executeCommand, getExecutionEmitter } from '../speckit/command-executor'

executeCommand: publicProcedure
  .input(z.object({
    projectPath: z.string(),
    command: z.string(),
    args: z.string(),
  }))
  .mutation(({ input }) => {
    const { executionId } = executeCommand(
      input.projectPath,
      input.command,
      input.args
    )
    return { success: true, executionId }
  }),

onCommandOutput: publicProcedure
  .input(z.object({ executionId: z.string() }))
  .subscription(({ input }) => {
    return observable<{ stream: string; chunk: string; done: boolean }>((emit) => {
      const emitter = getExecutionEmitter(input.executionId)
      if (!emitter) {
        emit.error(new Error('Execution not found'))
        return
      }

      emitter.on('output', ({ stream, chunk }) => {
        emit.next({ stream, chunk, done: false })
      })

      emitter.on('done', () => {
        emit.next({ stream: 'stdout', chunk: '', done: true })
        emit.complete()
      })

      return () => {
        // Cleanup
      }
    })
  }),
```

---

### Phase 4: Integration

#### 4.1 Add to Drawer System

```typescript
// src/renderer/features/layout/drawer-content.tsx

import { PlanPage } from '@/features/speckit/components/plan-page'

export function DrawerContent({ activeView }: { activeView: string }) {
  switch (activeView) {
    case 'git':
      return <GitPanel />
    case 'terminal':
      return <TerminalPanel />
    case 'speckit':  // NEW
      return <PlanPage />
    default:
      return null
  }
}
```

#### 4.2 Add Icon Button

```typescript
// src/renderer/features/layout/top-action-bar.tsx

import { FileText } from 'lucide-react'

export function TopActionBar() {
  return (
    <div className="flex gap-2">
      <IconButton icon={GitBranch} onClick={() => setActiveView('git')} />
      <IconButton icon={Terminal} onClick={() => setActiveView('terminal')} />
      <IconButton icon={FileText} onClick={() => setActiveView('speckit')} />
    </div>
  )
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/speckit/file-utils.test.ts

describe('parseFeatureBranch', () => {
  it('parses valid feature branch', () => {
    const result = parseFeatureBranch('001-speckit-ui-integration')
    expect(result).toEqual({
      featureNumber: '001',
      featureName: 'speckit-ui-integration',
    })
  })

  it('returns null for invalid branch', () => {
    const result = parseFeatureBranch('main')
    expect(result).toBeNull()
  })
})
```

### Integration Tests

```typescript
// tests/speckit/trpc-router.test.ts

describe('speckit router', () => {
  it('detects workflow state from files', async () => {
    // Setup: Create test feature directory with spec.md
    const testProject = await createTestProject({
      branch: '001-test-feature',
      files: ['spec.md'],
    })

    const result = await trpc.speckit.getWorkflowState.query({
      projectPath: testProject.path,
    })

    expect(result.currentStep).toBe('plan') // spec exists, plan doesn't
    expect(result.artifactsPresent.spec).toBe(true)
    expect(result.artifactsPresent.plan).toBe(false)
  })
})
```

### E2E Tests

```typescript
// tests/e2e/speckit-workflow.test.ts

test('complete workflow execution', async () => {
  // 1. Open Plan page
  await page.click('[data-testid="speckit-button"]')

  // 2. Click "New Feature"
  await page.click('[data-testid="new-feature-button"]')

  // 3. Enter feature description
  await page.fill('[data-testid="feature-description"]', 'Add user authentication')

  // 4. Click "Start Workflow"
  await page.click('[data-testid="start-workflow"]')

  // 5. Wait for spec.md to be created
  await page.waitForSelector('[data-testid="spec-artifact"]')

  // 6. Verify current step is 'plan'
  const stepIndicator = await page.textContent('[data-testid="current-step"]')
  expect(stepIndicator).toBe('plan')
})
```

---

## Common Issues & Solutions

### Issue: Submodule Not Found

**Error**: `fatal: Not a git repository: submodules/ii-spec/.git`

**Solution**:
```bash
git submodule update --init --recursive
```

### Issue: Command Execution Fails

**Error**: `Command 'specify' not found`

**Solution**: Ensure ii-spec CLI is installed:
```bash
cd submodules/ii-spec
uv tool install specify-cli --from .
```

### Issue: File Read Permissions

**Error**: `EACCES: permission denied`

**Solution**: Check project path permissions:
```bash
ls -la /path/to/project
chmod -R u+rw .specify/ specs/
```

---

## Key Files Reference

### Backend (Main Process)

| File | Purpose |
|------|---------|
| `src/main/lib/trpc/routers/speckit.ts` | tRPC router with all SpecKit procedures |
| `src/main/lib/speckit/file-utils.ts` | File system utilities (Git, file reading) |
| `src/main/lib/speckit/state-detector.ts` | Workflow state detection from files |
| `src/main/lib/speckit/command-executor.ts` | Subprocess execution for ii-spec commands |

### Frontend (Renderer Process)

| File | Purpose |
|------|---------|
| `src/renderer/features/speckit/components/plan-page.tsx` | Main drawer widget |
| `src/renderer/features/speckit/components/workflow-modal.tsx` | Full-screen workflow modal |
| `src/renderer/features/speckit/components/features-table.tsx` | Features list with pagination |
| `src/renderer/features/speckit/components/document-pane.tsx` | Artifact content viewer |
| `src/renderer/features/speckit/components/workflow-stepper.tsx` | Step progress indicator |
| `src/renderer/features/speckit/hooks/use-workflow-state.ts` | Workflow state query hook |
| `src/renderer/features/speckit/hooks/use-execute-command.ts` | Command execution hook |
| `src/renderer/features/speckit/atoms/index.ts` | Jotai atoms for UI state |
| `src/renderer/features/speckit/types/index.ts` | TypeScript type definitions |

### Specification Files

| File | Purpose |
|------|---------|
| `specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md` | Complete architecture documentation |
| `specs/001-speckit-ui-integration/plan.md` | Implementation plan with phases |
| `specs/001-speckit-ui-integration/tasks.md` | Task breakdown with dependencies |
| `specs/001-speckit-ui-integration/spec.md` | Feature specification |
| `specs/001-speckit-ui-integration/data-model.md` | Entity definitions |

---

## Next Steps

1. **Complete Phase 1**: Implement tRPC router backend
2. **Complete Phase 2**: Build UI components
3. **Complete Phase 3**: Implement command execution
4. **Complete Phase 4**: Integrate with existing app
5. **Test**: Run unit, integration, and E2E tests
6. **Document**: Update README with usage instructions

---

## Getting Help

- **Architecture Questions**: Read `II_SPEC_NATIVE_ARCHITECTURE.md`
- **API Reference**: See `contracts/trpc-router-simplified.ts`
- **Entity Definitions**: See `data-model-simplified.md`
- **ii-spec Documentation**: See `submodules/ii-spec/README.md`
