# SpecKit Initialization Detection - Implementation Summary

**Date**: 2026-02-01
**Feature**: 001-speckit-ui-integration
**Status**: Planning Complete - Ready for `/speckit.tasks`

---

## What Was Added

In response to the requirement: "We will also need to handle the case where speckit is not installed in the codebase yet", I've completed the initialization detection planning.

### Files Created/Updated

1. **`INITIALIZATION_DETECTION.md`** (NEW)
   - Complete implementation guide for detecting SpecKit initialization
   - Detection logic with TypeScript examples
   - UI behavior for 3 states: not initialized, partially initialized, fully initialized
   - Security considerations (path traversal, command injection prevention)
   - Performance optimizations (caching, file system watch)

2. **`spec.md`** (UPDATED)
   - Added FR-024: Detect if SpecKit is not initialized
   - Added FR-025: One-click initialization action
   - Added FR-026: Auto-refresh after initialization
   - Added 3 new edge cases for initialization scenarios

3. **`contracts/trpc-router-enhanced.ts`** (UPDATED)
   - Added `checkInitialization` procedure
   - Added `initializeSpecKit` procedure
   - Both with full Zod schemas and documentation

4. **`plan.md`** (UPDATED)
   - Added "Initialization Detection" section under UI Architecture
   - References INITIALIZATION_DETECTION.md for details
   - Updated component hierarchy to show initialization check as first step

5. **`WORKFLOW_ANALYSIS.md`** (UPDATED)
   - Added "Pre-Workflow: Initialization Detection" section
   - Documents this as step 0 before all other workflow commands

---

## Key Technical Decisions

### Initialization Markers

SpecKit is considered **initialized** when ALL of these exist:

```
project-root/
├── .specify/
│   ├── templates/
│   │   ├── spec-template.md
│   │   ├── plan-template.md
│   │   └── tasks-template.md
│   ├── memory/
│   └── scripts/
```

**Minimal Check**: Directory structure + 3 essential templates

**Optional Components**: `constitution.md` is created AFTER first `/speckit.constitution` run, so it's NOT required for initialization detection.

### Initialization Command

```bash
specify init . --ai claude
```

This command:
- Creates `.specify/` directory
- Copies template files from spec-kit installation
- Sets up scripts directory
- Does NOT create constitution (that's done via `/speckit.constitution`)

### UI Flow

```
User opens Plan page
    ↓
Check initialization status (tRPC: checkInitialization)
    ↓
┌─────────────────────────────────────────┐
│ Is .specify/ fully initialized?         │
└─────────────────────────────────────────┘
    │                                     │
    │ NO                                  │ YES
    ↓                                     ↓
Show Initialization Prompt         Show Normal Plan Page
- "Initialize SpecKit" button      - Constitution section
- Runs: specify init . --ai claude - Features table
- On success → Reload page         - "New Feature" button
```

### tRPC Procedures

#### `checkInitialization`

**Purpose**: Detect if SpecKit is initialized

**Input**:
```typescript
{ projectPath: string }
```

**Output**:
```typescript
{
  initialized: boolean
  missingComponents: string[]  // e.g., [".specify/templates/"]
  initCommand: string          // "specify init . --ai claude"
}
```

**Implementation**:
```typescript
async function checkInitialization(projectPath: string) {
  const specifyDir = path.join(projectPath, '.specify')
  const missingComponents: string[] = []

  // Check main directory
  if (!fs.existsSync(specifyDir)) {
    return {
      initialized: false,
      missingComponents: ['.specify/ directory'],
      initCommand: 'specify init . --ai claude'
    }
  }

  // Check subdirectories
  const requiredDirs = {
    'templates': path.join(specifyDir, 'templates'),
    'memory': path.join(specifyDir, 'memory'),
    'scripts': path.join(specifyDir, 'scripts'),
  }

  for (const [name, dirPath] of Object.entries(requiredDirs)) {
    if (!fs.existsSync(dirPath)) {
      missingComponents.push(`.specify/${name}/ directory`)
    }
  }

  // Check essential templates
  const requiredTemplates = [
    'spec-template.md',
    'plan-template.md',
    'tasks-template.md',
  ]

  for (const template of requiredTemplates) {
    const templatePath = path.join(specifyDir, 'templates', template)
    if (!fs.existsSync(templatePath)) {
      missingComponents.push(`.specify/templates/${template}`)
    }
  }

  return {
    initialized: missingComponents.length === 0,
    missingComponents,
    initCommand: 'specify init . --ai claude'
  }
}
```

#### `initializeSpecKit`

**Purpose**: Run SpecKit initialization command

**Input**:
```typescript
{ projectPath: string }
```

**Output**:
```typescript
{
  success: boolean
  output: string
  error?: string
}
```

**Implementation**:
```typescript
async function initializeSpecKit(projectPath: string) {
  try {
    // Validate path
    validateProjectPath(projectPath)

    // Execute command (NOT using shell: true to prevent injection)
    const { stdout, stderr } = await execFile(
      'specify',
      ['init', '.', '--ai', 'claude'],
      {
        cwd: projectPath,
        timeout: 60000, // 1 minute
        maxBuffer: 1024 * 1024, // 1MB
      }
    )

    return {
      success: true,
      output: stdout,
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error.message,
    }
  }
}
```

---

## UI Component Sketch

### Not Initialized State

```tsx
function PlanPageInitPrompt() {
  const [initializing, setInitializing] = useState(false)
  const initMutation = trpc.speckit.initializeSpecKit.useMutation()

  async function handleInitialize() {
    setInitializing(true)
    try {
      const result = await initMutation.mutateAsync({ projectPath })

      if (!result.success) {
        toast.error('Initialization failed: ' + result.error)
        return
      }

      toast.success('SpecKit initialized successfully!')
      // Reload Plan page
      window.location.reload()
    } catch (error) {
      toast.error('Failed to initialize: ' + error.message)
    } finally {
      setInitializing(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <FileQuestion className="w-16 h-16 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">SpecKit Not Initialized</h2>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        SpecKit needs to be initialized in this project before you can use
        spec-driven development.
      </p>

      <Button
        onClick={handleInitialize}
        disabled={initializing}
        size="lg"
      >
        {initializing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Initializing...
          </>
        ) : (
          'Initialize SpecKit'
        )}
      </Button>

      <div className="mt-4 p-3 bg-muted rounded text-sm font-mono">
        specify init . --ai claude
      </div>
    </div>
  )
}
```

### Initialized State (Normal Plan Page)

```tsx
function PlanPage() {
  const { data: initStatus } = trpc.speckit.checkInitialization.useQuery({ projectPath })

  if (!initStatus?.initialized) {
    return <PlanPageInitPrompt />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Constitution Section */}
      <ConstitutionSection />

      {/* Features Section */}
      <FeaturesSection />
    </div>
  )
}
```

---

## Security Considerations

### 1. Path Traversal Prevention

```typescript
function validateProjectPath(projectPath: string): void {
  const absolutePath = path.resolve(projectPath)
  const allowedPaths = [
    os.homedir(),
    process.env.WORKSPACE_DIR,
  ]

  const isAllowed = allowedPaths.some(allowed =>
    absolutePath.startsWith(path.resolve(allowed))
  )

  if (!isAllowed) {
    throw new Error('Project path is outside allowed directories')
  }
}
```

### 2. Command Injection Prevention

**DO NOT DO THIS** (vulnerable to injection):
```typescript
// WRONG - shell injection risk
exec(`cd ${projectPath} && specify init . --ai claude`)
```

**DO THIS** (safe):
```typescript
// CORRECT - array args prevent injection
execFile('specify', ['init', '.', '--ai', 'claude'], { cwd: projectPath })
```

---

## Performance Optimizations

### 1. Cache Initialization Status

```typescript
// Cache for 5 minutes to avoid repeated file system checks
const initStatusCache = new Map<string, {
  status: InitializationStatus
  timestamp: number
}>()

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
```

### 2. File System Watch for Auto-Refresh

```typescript
// Watch .specify directory for changes
const watcher = chokidar.watch('.specify', {
  cwd: projectPath,
  ignoreInitial: true,
})

watcher.on('addDir', () => {
  // Invalidate cache and notify renderer
  initStatusCache.delete(projectPath)
  mainWindow.webContents.send('speckit:initialized', { projectPath })
})
```

---

## Error Handling

### 1. Specify CLI Not Found

```
┌────────────────────────────────────────────────────┐
│  SpecKit CLI Not Installed                         │
│                                                     │
│  The 'specify' command-line tool is required.      │
│                                                     │
│  Install it with:                                  │
│  uv tool install specify-cli \                     │
│    --from git+https://github.com/github/spec-kit.git│
│                                                     │
│  [Copy Install Command]  [View Documentation]      │
└────────────────────────────────────────────────────┘
```

### 2. Initialization Fails

```
┌────────────────────────────────────────────────────┐
│  ✗ Initialization Failed                           │
│                                                     │
│  Could not initialize SpecKit. Please ensure:      │
│  • 'specify' CLI is installed                      │
│  • Current directory is a valid project            │
│                                                     │
│  Error output:                                     │
│  [stderr from specify init]                        │
│                                                     │
│  [Try Again]  [View Documentation]                 │
└────────────────────────────────────────────────────┘
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('checkInitialization', () => {
  it('returns false when .specify does not exist', async () => {
    const result = await checkInitialization('/path/without/specify')
    expect(result.initialized).toBe(false)
    expect(result.missingComponents).toContain('.specify/ directory')
  })

  it('returns true when fully initialized', async () => {
    // Setup: Create full .specify structure
    const result = await checkInitialization(testProjectPath)
    expect(result.initialized).toBe(true)
    expect(result.missingComponents).toHaveLength(0)
  })
})
```

### Integration Tests

```typescript
describe('initializeSpecKit', () => {
  it('creates .specify directory and templates', async () => {
    const result = await initializeSpecKit(testProjectPath)
    expect(result.success).toBe(true)
    expect(fs.existsSync(path.join(testProjectPath, '.specify'))).toBe(true)
  })
})
```

---

## Next Steps

1. **Run `/speckit.tasks`** to generate implementation tasks
2. **Review** all planning documents for consistency
3. **Begin implementation** starting with tRPC procedures
4. **Test** initialization detection on projects without SpecKit

---

## Summary

✅ **Complete**: Initialization detection fully planned and documented

**3 New Functional Requirements**: FR-024, FR-025, FR-026
**2 New tRPC Procedures**: `checkInitialization`, `initializeSpecKit`
**New Planning Document**: `INITIALIZATION_DETECTION.md`
**Updated Documents**: `spec.md`, `plan.md`, `WORKFLOW_ANALYSIS.md`, `contracts/trpc-router-enhanced.ts`

The Plan page will now handle projects without SpecKit gracefully, guiding users through one-click initialization before allowing access to constitution and features sections.
