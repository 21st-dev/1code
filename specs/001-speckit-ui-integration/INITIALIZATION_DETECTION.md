# SpecKit Initialization Detection

**Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-01
**Purpose**: Define how to detect if SpecKit is initialized in a project and guide users through initialization

---

## Problem Statement

When users open the SpecKit Plan page in the UI, the system needs to detect whether SpecKit has been initialized in the current project. If not initialized, the UI should display an initialization prompt instead of attempting to show constitution/features sections that don't exist.

---

## SpecKit Initialization Markers

Based on studying the spec-kit codebase, SpecKit creates the following structure when initialized:

### Directory Structure

```
project-root/
├── .specify/                          # Main SpecKit directory
│   ├── memory/
│   │   └── constitution.md            # Created after /speckit.constitution
│   ├── scripts/
│   │   └── bash/                      # Bash scripts (copied from spec-kit)
│   └── templates/                     # Template files (copied from spec-kit)
│       ├── spec-template.md
│       ├── plan-template.md
│       ├── tasks-template.md
│       ├── checklist-template.md
│       └── agent-file-template.md
└── specs/                             # Created when first feature is specified
    └── 001-feature-name/
        ├── spec.md
        ├── plan.md
        └── ... (other artifacts)
```

### Initialization Command

```bash
# Initialize in current directory
specify init . --ai claude

# Alternative syntax
specify init --here --ai claude

# Initialize in new directory
specify init <PROJECT_NAME>
```

---

## Detection Logic

### Minimal Initialization Check

The **minimum requirement** for SpecKit to be considered initialized:

```typescript
function isSpecKitInitialized(projectPath: string): boolean {
  const specifyDir = path.join(projectPath, '.specify')
  const templatesDir = path.join(specifyDir, 'templates')
  const memoryDir = path.join(specifyDir, 'memory')
  const scriptsDir = path.join(specifyDir, 'scripts')

  // Check directory existence
  if (!fs.existsSync(specifyDir)) return false
  if (!fs.existsSync(templatesDir)) return false
  if (!fs.existsSync(memoryDir)) return false
  if (!fs.existsSync(scriptsDir)) return false

  // Check for essential template files
  const requiredTemplates = [
    'spec-template.md',
    'plan-template.md',
    'tasks-template.md',
  ]

  for (const template of requiredTemplates) {
    const templatePath = path.join(templatesDir, template)
    if (!fs.existsSync(templatePath)) return false
  }

  return true
}
```

### Detailed Status Check

For more granular feedback to users:

```typescript
interface InitializationStatus {
  initialized: boolean
  missingComponents: string[]
  initCommand: string
}

function checkSpecKitInitialization(projectPath: string): InitializationStatus {
  const missingComponents: string[] = []
  const specifyDir = path.join(projectPath, '.specify')

  // Check main directory
  if (!fs.existsSync(specifyDir)) {
    return {
      initialized: false,
      missingComponents: ['.specify/ directory'],
      initCommand: 'specify init . --ai claude',
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
  const templatesDir = path.join(specifyDir, 'templates')
  if (fs.existsSync(templatesDir)) {
    const requiredTemplates = [
      'spec-template.md',
      'plan-template.md',
      'tasks-template.md',
    ]

    for (const template of requiredTemplates) {
      const templatePath = path.join(templatesDir, template)
      if (!fs.existsSync(templatePath)) {
        missingComponents.push(`.specify/templates/${template}`)
      }
    }
  }

  return {
    initialized: missingComponents.length === 0,
    missingComponents,
    initCommand: 'specify init . --ai claude',
  }
}
```

---

## UI Behavior Based on Initialization Status

### Case 1: SpecKit Not Initialized

**Detection**: `.specify/` directory does not exist

**UI Display**:
```
┌────────────────────────────────────────────────────┐
│  SpecKit Not Initialized                           │
│                                                     │
│  SpecKit needs to be initialized in this project   │
│  before you can use spec-driven development.       │
│                                                     │
│  [Initialize SpecKit]                              │
│                                                     │
│  This will run: specify init . --ai claude         │
└────────────────────────────────────────────────────┘
```

**User Action**: Click "Initialize SpecKit" button
- Runs `specify init . --ai claude` in the project directory
- Shows progress indicator during initialization
- On success: Refreshes Plan page to show constitution/features sections
- On error: Shows error message with troubleshooting link

### Case 2: SpecKit Partially Initialized

**Detection**: `.specify/` exists but missing components

**UI Display**:
```
┌────────────────────────────────────────────────────┐
│  SpecKit Incomplete Installation                   │
│                                                     │
│  Missing components:                               │
│  • .specify/templates/spec-template.md             │
│  • .specify/memory/ directory                      │
│                                                     │
│  [Re-initialize SpecKit]                           │
│                                                     │
│  This will run: specify init . --ai claude --force │
└────────────────────────────────────────────────────┘
```

**User Action**: Click "Re-initialize SpecKit" button
- Runs `specify init . --ai claude --force` (if force flag is supported)
- Otherwise, shows manual instructions to delete `.specify/` and re-run init

### Case 3: SpecKit Fully Initialized

**Detection**: All required directories and templates exist

**UI Display**: Show normal Plan page with:
- Constitution section (button + preview)
- Features section (CTA + table)

---

## tRPC Procedures

### `checkInitialization`

```typescript
input: {
  projectPath: string
}

output: {
  initialized: boolean
  missingComponents: string[]
  initCommand: string
}
```

**Implementation**:
1. Check for `.specify/` directory
2. Check for required subdirectories (templates, memory, scripts)
3. Check for essential template files
4. Return status with missing components list

### `initializeSpecKit`

```typescript
input: {
  projectPath: string
}

output: {
  success: boolean
  output: string
  error?: string
}
```

**Implementation**:
1. Validate project path exists
2. Execute `specify init . --ai claude` in project directory
3. Capture stdout/stderr
4. Return success status with output

---

## Error Handling

### Initialization Fails

**Scenario**: `specify init` command returns non-zero exit code

**UI Response**:
```
┌────────────────────────────────────────────────────┐
│  ✗ Initialization Failed                           │
│                                                     │
│  Could not initialize SpecKit. Please ensure:      │
│  • 'specify' CLI is installed (uv tool install...) │
│  • Current directory is a valid project            │
│                                                     │
│  Error output:                                     │
│  [error message from specify init]                 │
│                                                     │
│  [Try Again]  [View Documentation]                 │
└────────────────────────────────────────────────────┘
```

### Specify CLI Not Found

**Scenario**: `specify` command not found in PATH

**UI Response**:
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

---

## Workflow Integration

### On Plan Page Load

```typescript
async function onPlanPageOpen(projectPath: string) {
  // 1. Check initialization status
  const status = await trpc.speckit.checkInitialization.query({ projectPath })

  if (!status.initialized) {
    // 2. Show initialization prompt UI
    showInitializationPrompt(status)
    return
  }

  // 3. Load normal Plan page (constitution + features)
  await Promise.all([
    loadConstitutionPreview(projectPath),
    loadFeaturesTable(projectPath),
  ])
}
```

### After Successful Initialization

```typescript
async function handleInitializeClick(projectPath: string) {
  // 1. Show loading state
  setInitializing(true)

  try {
    // 2. Run initialization
    const result = await trpc.speckit.initializeSpecKit.mutate({ projectPath })

    if (!result.success) {
      // 3. Show error
      showErrorMessage(result.error || 'Unknown error')
      return
    }

    // 4. Show success notification
    showSuccessNotification('SpecKit initialized successfully!')

    // 5. Reload Plan page with normal UI
    await onPlanPageOpen(projectPath)
  } catch (error) {
    showErrorMessage(error.message)
  } finally {
    setInitializing(false)
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('SpecKit Initialization Detection', () => {
  it('returns false when .specify directory does not exist', () => {
    const status = checkSpecKitInitialization('/path/to/project')
    expect(status.initialized).toBe(false)
    expect(status.missingComponents).toContain('.specify/ directory')
  })

  it('returns false when templates are missing', () => {
    // Setup: Create .specify but no templates
    const status = checkSpecKitInitialization('/path/to/project')
    expect(status.initialized).toBe(false)
    expect(status.missingComponents).toContain('.specify/templates/ directory')
  })

  it('returns true when fully initialized', () => {
    // Setup: Create full .specify structure
    const status = checkSpecKitInitialization('/path/to/project')
    expect(status.initialized).toBe(true)
    expect(status.missingComponents).toHaveLength(0)
  })
})
```

### Integration Tests

```typescript
describe('SpecKit Initialization Flow', () => {
  it('successfully initializes SpecKit in project', async () => {
    const result = await trpc.speckit.initializeSpecKit.mutate({
      projectPath: testProjectPath,
    })

    expect(result.success).toBe(true)
    expect(fs.existsSync(path.join(testProjectPath, '.specify'))).toBe(true)
  })

  it('handles initialization failure gracefully', async () => {
    // Setup: Make project path read-only
    const result = await trpc.speckit.initializeSpecKit.mutate({
      projectPath: readOnlyProjectPath,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
```

---

## Security Considerations

### Path Traversal Prevention

```typescript
function validateProjectPath(projectPath: string): void {
  // Resolve to absolute path
  const absolutePath = path.resolve(projectPath)

  // Ensure path is within allowed directories
  // (e.g., user's home directory or workspace)
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

### Command Injection Prevention

```typescript
async function initializeSpecKit(projectPath: string): Promise<InitResult> {
  // Validate path
  validateProjectPath(projectPath)

  // Use spawn with array args (NOT shell: true)
  const { stdout, stderr } = await execFile(
    'specify',
    ['init', '.', '--ai', 'claude'],
    {
      cwd: projectPath,
      timeout: 60000, // 1 minute timeout
      maxBuffer: 1024 * 1024, // 1MB max output
    }
  )

  return {
    success: true,
    output: stdout,
  }
}
```

---

## Performance Considerations

### Caching Initialization Status

```typescript
// Cache initialization status for 5 minutes
const initStatusCache = new Map<string, {
  status: InitializationStatus
  timestamp: number
}>()

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCachedInitStatus(projectPath: string): InitializationStatus | null {
  const cached = initStatusCache.get(projectPath)
  if (!cached) return null

  const age = Date.now() - cached.timestamp
  if (age > CACHE_TTL) {
    initStatusCache.delete(projectPath)
    return null
  }

  return cached.status
}

function setCachedInitStatus(projectPath: string, status: InitializationStatus): void {
  initStatusCache.set(projectPath, {
    status,
    timestamp: Date.now(),
  })
}
```

### File System Watch for Automatic Refresh

```typescript
// Watch .specify directory for changes
const watcher = chokidar.watch('.specify', {
  cwd: projectPath,
  ignoreInitial: true,
})

watcher.on('addDir', (dirPath) => {
  // Invalidate cache when .specify structure changes
  initStatusCache.delete(projectPath)

  // Notify renderer to refresh Plan page
  mainWindow.webContents.send('speckit:initialized', { projectPath })
})
```

---

## Summary

**Initialization Detection Criteria**:
1. `.specify/` directory exists
2. `.specify/templates/` exists with core templates
3. `.specify/memory/` directory exists
4. `.specify/scripts/` directory exists

**User Flow**:
1. User opens Plan page
2. System checks initialization status
3. If not initialized → Show initialization prompt
4. User clicks "Initialize SpecKit" button
5. System runs `specify init . --ai claude`
6. On success → Reload Plan page with normal UI
7. On error → Show error message with troubleshooting

**tRPC Procedures**:
- `checkInitialization`: Detect initialization status
- `initializeSpecKit`: Run initialization command
