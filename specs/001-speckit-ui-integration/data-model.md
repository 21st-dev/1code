# Data Model: SpecKit UI Integration (Simplified - ii-spec Native)

**Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-01
**Updated**: 2026-02-01 (Simplified for ii-spec native architecture)
**Source**: Extracted from spec.md Key Entities

---

## Architecture Note

With the **ii-spec native approach**, most entities are NOT stored in memory or database - they are READ from the file system. This document defines the TypeScript types used in the UI, not database schemas.

**Key Principle**: Files are the source of truth, not our data structures.

---

## Core Entities (File-Based)

### SpecKitFeature

Represents a feature specification managed by ii-spec.

**Source**: Read from `specs/` directory structure

**Attributes**:
- `featureNumber` (string, required): Zero-padded 3-digit number (e.g., "001", "042")
- `shortName` (string, required): Kebab-case identifier (e.g., "user-auth", "speckit-ui-integration")
- `branchName` (string, computed): Combination of featureNumber and shortName (e.g., "001-speckit-ui-integration")
- `description` (string, optional): Extracted from spec.md first paragraph
- `artifacts` (ArtifactPresence, required): Which artifacts exist on disk

**Validation Rules**:
- `featureNumber` must match pattern: `/^\d{3}$/`
- `shortName` must match pattern: `/^[a-z0-9]+(-[a-z0-9]+)*$/` (kebab-case)
- `branchName` must match pattern: `/^\d{3}-[a-z0-9]+(-[a-z0-9]+)*$/`

**TypeScript Definition**:
```typescript
export interface ArtifactPresence {
  spec: boolean      // specs/###-name/spec.md exists
  plan: boolean      // specs/###-name/plan.md exists
  research: boolean  // specs/###-name/research.md exists
  tasks: boolean     // specs/###-name/tasks.md exists
}

export interface SpecKitFeature {
  featureNumber: string
  shortName: string
  branchName: string
  description?: string
  artifacts: ArtifactPresence
}
```

**Zod Schema**:
```typescript
export const SpecKitFeatureSchema = z.object({
  featureNumber: z.string().regex(/^\d{3}$/),
  shortName: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  branchName: z.string(),
  description: z.string().optional(),
  artifacts: z.object({
    spec: z.boolean(),
    plan: z.boolean(),
    research: z.boolean(),
    tasks: z.boolean(),
  }),
})
```

---

### Constitution

Represents the project constitution document.

**Source**: Read from `.specify/memory/constitution.md`

**Attributes**:
- `content` (string, required): Full markdown content
- `version` (string, optional): Extracted from document footer (e.g., "1.0.0")
- `lastAmended` (Date, optional): Extracted from document footer
- `exists` (boolean, required): Whether the file exists

**TypeScript Definition**:
```typescript
export interface Constitution {
  content: string
  version?: string
  lastAmended?: Date
  exists: boolean
}
```

**Zod Schema**:
```typescript
export const ConstitutionSchema = z.object({
  content: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  lastAmended: z.date().optional(),
  exists: z.boolean(),
})
```

---

### WorkflowState

Represents the current workflow state (detected from Git branch and file system).

**Source**: Detected by reading current Git branch and checking file existence

**Attributes**:
- `featureNumber` (string, optional): Parsed from branch (e.g., "001")
- `featureName` (string, optional): Parsed from branch (e.g., "speckit-ui-integration")
- `branchName` (string, optional): Full branch name (e.g., "001-speckit-ui-integration")
- `currentStep` (WorkflowStepName, required): Detected step
- `artifactsPresent` (ArtifactPresence, required): Which files exist
- `needsClarification` (boolean, required): spec.md contains `[NEEDS CLARIFICATION]`
- `clarificationQuestions` (ClarificationQuestion[], optional): Parsed from spec.md

**TypeScript Definition**:
```typescript
export type WorkflowStepName =
  | 'no-feature'      // No feature branch checked out
  | 'constitution'    // Constitution doesn't exist yet
  | 'specify'         // spec.md doesn't exist yet
  | 'clarify'         // spec.md has [NEEDS CLARIFICATION] markers
  | 'plan'            // spec.md exists, plan.md doesn't
  | 'tasks'           // plan.md exists, tasks.md doesn't
  | 'analyze'         // tasks.md exists, can run analysis
  | 'implement'       // All artifacts exist

export interface WorkflowState {
  featureNumber?: string
  featureName?: string
  branchName?: string
  currentStep: WorkflowStepName
  artifactsPresent: ArtifactPresence
  needsClarification: boolean
  clarificationQuestions?: ClarificationQuestion[]
}
```

**Zod Schema**:
```typescript
export const WorkflowStateSchema = z.object({
  featureNumber: z.string().optional(),
  featureName: z.string().optional(),
  branchName: z.string().optional(),
  currentStep: z.enum([
    'no-feature',
    'constitution',
    'specify',
    'clarify',
    'plan',
    'tasks',
    'analyze',
    'implement',
  ]),
  artifactsPresent: z.object({
    spec: z.boolean(),
    plan: z.boolean(),
    research: z.boolean(),
    tasks: z.boolean(),
  }),
  needsClarification: z.boolean(),
  clarificationQuestions: z.array(ClarificationQuestionSchema).optional(),
})
```

**State Detection Logic**:
```typescript
function detectCurrentStep(artifactsPresent: ArtifactPresence, needsClarification: boolean): WorkflowStepName {
  if (!artifactsPresent.spec) return 'specify'
  if (needsClarification) return 'clarify'
  if (!artifactsPresent.plan) return 'plan'
  if (!artifactsPresent.tasks) return 'tasks'
  return 'implement'
}
```

---

### ClarificationQuestion

Represents a question parsed from spec.md `[NEEDS CLARIFICATION: ...]` markers.

**Source**: Parsed from spec.md content

**Attributes**:
- `id` (string, required): Question ID (e.g., "Q1", "Q2")
- `topic` (string, required): Brief topic/category
- `question` (string, required): The question text
- `options` (string[], optional): Suggested answer options

**TypeScript Definition**:
```typescript
export interface ClarificationQuestion {
  id: string
  topic: string
  question: string
  options?: string[]
}
```

**Zod Schema**:
```typescript
export const ClarificationQuestionSchema = z.object({
  id: z.string().regex(/^Q\d+$/),
  topic: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
})
```

**Parsing Logic**:
```typescript
function parseClarificationQuestions(specContent: string): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = []
  const markerRegex = /\[NEEDS CLARIFICATION: ([^\]]+)\]/g

  let match
  let index = 1
  while ((match = markerRegex.exec(specContent)) !== null) {
    questions.push({
      id: `Q${index}`,
      topic: 'Clarification',
      question: match[1],
    })
    index++
  }

  return questions
}
```

---

### InitializationStatus

Represents whether ii-spec is initialized in the project.

**Source**: Detected by checking `.specify/` directory structure

**Attributes**:
- `initialized` (boolean, required): All required components exist
- `missingComponents` (string[], required): List of missing files/directories
- `initCommand` (string, required): Command to run for initialization

**TypeScript Definition**:
```typescript
export interface InitializationStatus {
  initialized: boolean
  missingComponents: string[]
  initCommand: string
}
```

**Zod Schema**:
```typescript
export const InitializationStatusSchema = z.object({
  initialized: z.boolean(),
  missingComponents: z.array(z.string()),
  initCommand: z.string(),
})
```

---

## UI View Models (Derived)

### FeatureTableRow

Represents a row in the features table (derived from SpecKitFeature).

**Source**: Derived from SpecKitFeature for table display

**TypeScript Definition**:
```typescript
export interface FeatureTableRow {
  id: string          // featureNumber
  name: string        // shortName
  description: string // First paragraph from spec.md
  branch: string      // branchName
  artifacts: {
    spec: string | null    // File path or null
    plan: string | null
    research: string | null
    tasks: string | null
  }
}
```

---

### ConstitutionPreview

Represents condensed constitution for drawer widget.

**Source**: Derived from Constitution for preview display

**TypeScript Definition**:
```typescript
export interface ConstitutionPreview {
  principleNames: string[]  // Extracted from content
  principleCount: number
  lastAmended?: Date
}
```

**Extraction Logic**:
```typescript
function extractPrincipleNames(constitutionContent: string): string[] {
  const lines = constitutionContent.split('\n')
  const principleNames: string[] = []

  for (const line of lines) {
    // Match markdown headers like "## Principle I - Desktop-First"
    const match = line.match(/^##\s+Principle\s+[IVX]+\s+-\s+(.+)$/)
    if (match) {
      principleNames.push(match[1])
    }
  }

  return principleNames
}
```

---

## Removed Entities (Not Needed in ii-spec Native Architecture)

### ❌ WorkflowSession (REMOVED)

**Why Removed**: Git branch is the session. No need to track in memory.

**Replacement**: Read current Git branch + detect state from files

---

### ❌ WorkflowClarifications (REMOVED)

**Why Removed**: Parse clarifications from spec.md on demand.

**Replacement**: `parseClarificationQuestions(specContent)` function

---

### ❌ WorkflowStep (REMOVED)

**Why Removed**: ii-spec manages step transitions via file creation.

**Replacement**: `detectCurrentStep()` function reads from file system

---

### ❌ SpecKitArtifact (SIMPLIFIED)

**Why Simplified**: Don't need full entity - just boolean flags for existence.

**Replacement**: `ArtifactPresence` interface with boolean flags

---

## Entity Relationship Diagram (Simplified)

```
Project (existing)
  │
  ├─── .specify/memory/constitution.md ─── Constitution
  │                                           └─── derived ─── ConstitutionPreview
  │
  └─── specs/###-name/ ─── SpecKitFeature
                              ├─── derived ─── FeatureTableRow
                              └─── files ─── spec.md, plan.md, research.md, tasks.md

Git Branch (e.g., "001-speckit-ui-integration")
  └─── detected ─── WorkflowState
                       └─── includes ─── ClarificationQuestion[]
```

---

## Storage Strategy

**File System** (primary and ONLY storage):
- `SpecKitFeature`: Directory structure in `specs/###-short-name/`
- `Constitution`: File at `.specify/memory/constitution.md`
- `WorkflowState`: Derived from current Git branch + file existence checks
- `ClarificationQuestion`: Parsed from spec.md `[NEEDS CLARIFICATION: ...]` markers

**Ephemeral UI State** (Jotai atoms):
- `speckitModalOpenAtom`: boolean (modal open/closed)
- `speckitCurrentDocumentAtom`: { type, content } (which document is displayed)
- `speckitLoadingAtom`: boolean (loading state)

**NO Zustand Store**: Not needed - files are the persistent state

**NO Database Changes**: No SQLite schema changes required

---

## Type Export Structure

**Recommended File Organization**:

```typescript
// src/renderer/features/speckit/types/index.ts

export * from './feature'
export * from './constitution'
export * from './workflow-state'
export * from './initialization'
export * from './ui-models'
```

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

---

## Summary of Simplifications

| Original Entity | New Approach | Reason |
|----------------|-------------|---------|
| WorkflowSession | Read Git branch | Branch is the session |
| WorkflowClarifications | Parse spec.md | Don't store, parse on demand |
| WorkflowStep | Detect from files | ii-spec manages transitions |
| SpecKitArtifact (full) | ArtifactPresence (booleans) | Only need existence flags |

**Result**: 4 fewer entities, no state synchronization, simpler architecture.

---

## Validation Library

**Decision**: Use Zod for runtime validation

All entity types have corresponding Zod schemas for:
- tRPC input/output validation
- File content parsing validation
- UI form validation (if needed)

**Import Pattern**:
```typescript
import { SpecKitFeatureSchema, type SpecKitFeature } from '@/features/speckit/types'

// Runtime validation
const feature = SpecKitFeatureSchema.parse(unknownData)

// Type-only import
function processFeature(feature: SpecKitFeature) { ... }
```
