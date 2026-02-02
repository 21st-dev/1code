# Tasks: SpecKit UI Integration

**Input**: Design documents from `/specs/001-speckit-ui-integration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, contracts/trpc-router.ts

**Tests**: No tests requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- Electron desktop app structure: `src/main/`, `src/renderer/`, `submodules/`
- Backend (main process): `src/main/lib/`
- Frontend (renderer): `src/renderer/features/`

---

## Phase 0: Submodule Relocation (Infrastructure)

**Purpose**: Relocate ii-spec submodule to organized location

**⚠️ CRITICAL**: Must be completed before any other work can begin

- [X] T001 Remove existing spec-kit submodule from project root using `git submodule deinit -f spec-kit && git rm -f spec-kit && rm -rf .git/modules/spec-kit`
- [X] T002 Create submodules directory at project root using `mkdir -p submodules`
- [X] T003 Add ii-spec submodule at submodules/ii-spec/ using `git submodule add git@github.com:SameeranB/ii-spec.git submodules/ii-spec`
- [X] T004 Initialize and update submodule using `git submodule update --init --recursive`
- [X] T005 Update .gitmodules file to reflect new submodule path at submodules/ii-spec
- [X] T006 Verify submodule accessibility by checking submodules/ii-spec/ directory structure

**Checkpoint**: Submodule relocated - can now install dependencies

---

## Phase 1: Dependencies & Setup

**Purpose**: Install required packages and verify project structure

- [X] T007 Install react-markdown for markdown rendering using `bun add react-markdown`
- [X] T008 [P] Install remark-gfm for GitHub Flavored Markdown support using `bun add remark-gfm`
- [X] T009 [P] Install react-syntax-highlighter for code highlighting using `bun add react-syntax-highlighter`
- [X] T010 [P] Install TypeScript types for react-syntax-highlighter using `bun add -D @types/react-syntax-highlighter`
- [X] T011 Verify .specify/memory/constitution.md exists in project
- [X] T012 [P] Verify .specify/templates/ directory exists
- [X] T013 [P] Verify specs/ directory exists

**Checkpoint**: Dependencies installed - can now create foundational code

---

## Phase 2: Foundational (Backend Infrastructure)

**Purpose**: Core backend utilities and tRPC router that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend Utilities

- [X] T014 [P] Create src/main/lib/speckit/ directory for ii-spec integration utilities
- [X] T015 [P] Implement getCurrentBranch() function in src/main/lib/speckit/file-utils.ts to read current Git branch using execSync
- [X] T016 [P] Implement parseFeatureBranch() function in src/main/lib/speckit/file-utils.ts to extract feature number and name from branch pattern /^(\d{3})-(.+)$/
- [X] T017 [P] Implement checkFileExists() function in src/main/lib/speckit/file-utils.ts using fs.existsSync()
- [X] T018 [P] Implement readFileContent() function in src/main/lib/speckit/file-utils.ts using fs.readFileSync()
- [X] T019 [P] Implement listFeatureDirectories() function in src/main/lib/speckit/file-utils.ts to list specs/ directory and filter by /^\d{3}-/ pattern
- [X] T020 [P] Implement detectWorkflowState() function in src/main/lib/speckit/state-detector.ts using file-based state detection logic from plan.md
- [X] T021 [P] Implement parseClarificationQuestions() function in src/main/lib/speckit/state-detector.ts to extract [NEEDS CLARIFICATION: ...] markers from spec.md
- [X] T022 [P] Implement executeCommand() function in src/main/lib/speckit/command-executor.ts to spawn ii-spec commands using child_process.spawn()
- [X] T023 [P] Implement getExecutionEmitter() function in src/main/lib/speckit/command-executor.ts to retrieve EventEmitter for streaming output
- [X] T024 [P] Implement cancelExecution() function in src/main/lib/speckit/command-executor.ts to kill running subprocess

### tRPC Router (15 Procedures)

- [X] T025 Create src/main/lib/trpc/routers/speckit.ts with router skeleton and Zod schemas from contracts/trpc-router.ts
- [X] T026 [P] Implement checkInitialization procedure in src/main/lib/trpc/routers/speckit.ts checking .specify/ directory structure
- [X] T027 [P] Implement initializeSpecKit procedure in src/main/lib/trpc/routers/speckit.ts executing `specify init . --ai claude`
- [X] T028 Implement getWorkflowState procedure in src/main/lib/trpc/routers/speckit.ts using detectWorkflowState() from state-detector.ts
- [X] T029 [P] Implement getConstitution procedure in src/main/lib/trpc/routers/speckit.ts reading .specify/memory/constitution.md
- [X] T030 [P] Implement getFeaturesList procedure in src/main/lib/trpc/routers/speckit.ts using listFeatureDirectories() and reading descriptions from spec.md files
- [X] T031 [P] Implement getArtifact procedure in src/main/lib/trpc/routers/speckit.ts reading specs/{branch}/{artifactType}.md files
- [X] T032 [P] Implement getFeatureDescription procedure in src/main/lib/trpc/routers/speckit.ts parsing spec.md first paragraph
- [X] T033 Implement executeCommand procedure in src/main/lib/trpc/routers/speckit.ts using executeCommand() from command-executor.ts
- [X] T034 Implement onCommandOutput subscription in src/main/lib/trpc/routers/speckit.ts using observable pattern and getExecutionEmitter()
- [X] T035 [P] Implement cancelCommand procedure in src/main/lib/trpc/routers/speckit.ts using cancelExecution()
- [X] T036 [P] Implement getCurrentBranch procedure in src/main/lib/trpc/routers/speckit.ts using getCurrentBranch() from file-utils.ts
- [X] T037 [P] Implement getFeatureBranches procedure in src/main/lib/trpc/routers/speckit.ts listing all branches matching /^\d{3}-/ pattern
- [X] T038 [P] Implement switchBranch procedure in src/main/lib/trpc/routers/speckit.ts executing `git checkout <branch>`
- [X] T039 [P] Implement openFileInEditor procedure in src/main/lib/trpc/routers/speckit.ts using Electron shell.openPath()
- [X] T040 [P] Implement watchDirectory procedure in src/main/lib/trpc/routers/speckit.ts using fs.watch() on specs/ or .specify/
- [X] T041 [P] Implement onFileChange subscription in src/main/lib/trpc/routers/speckit.ts emitting file change events
- [X] T042 Register speckit router in src/main/lib/trpc/index.ts appRouter

### Frontend Types (Shared by All Stories)

- [X] T043 [P] Create src/renderer/features/speckit/types/ directory
- [X] T044 [P] Create ArtifactPresenceSchema and type in src/renderer/features/speckit/types/feature.ts
- [X] T045 [P] Create SpecKitFeatureSchema and type in src/renderer/features/speckit/types/feature.ts with Zod validation
- [X] T046 [P] Create ConstitutionSchema and type in src/renderer/features/speckit/types/constitution.ts
- [X] T047 [P] Create WorkflowStateSchema and type in src/renderer/features/speckit/types/workflow-state.ts with all workflow step names
- [X] T048 [P] Create ClarificationQuestionSchema and type in src/renderer/features/speckit/types/workflow-state.ts
- [X] T049 [P] Create InitializationStatusSchema and type in src/renderer/features/speckit/types/initialization.ts
- [X] T050 [P] Create FeatureTableRow interface in src/renderer/features/speckit/types/ui-models.ts
- [X] T051 [P] Create ConstitutionPreview interface in src/renderer/features/speckit/types/ui-models.ts
- [X] T052 Export all types from src/renderer/features/speckit/types/index.ts

### Frontend Atoms (Shared UI State)

- [X] T053 Create src/renderer/features/speckit/atoms/index.ts with speckitModalOpenAtom (boolean)
- [X] T054 [P] Add speckitCurrentDocumentAtom to src/renderer/features/speckit/atoms/index.ts with type { type, content } | null
- [X] T055 [P] Add speckitLoadingAtom to src/renderer/features/speckit/atoms/index.ts (boolean)

### Shared Components & Utilities

- [X] T056 [P] Create extractPrincipleNames() utility function in src/renderer/features/speckit/utils/constitution-parser.ts to extract principle headers from markdown
- [X] T057 [P] Create markdown rendering component MarkdownView in src/renderer/features/speckit/components/markdown-view.tsx using react-markdown with remark-gfm and syntax highlighting

**Checkpoint**: Foundation complete - all user stories can now proceed in parallel

---

## Phase 3: User Story 1 - Access SpecKit Workflow (Priority: P1) 🎯 MVP

**Goal**: Users can click a SpecKit icon button in the top action bar to open a right drawer displaying the Plan page

**Independent Test**: Click the SpecKit icon button and verify the right drawer opens with the Plan page; click again to toggle drawer closed

### Implementation for User Story 1

- [X] T058 [P] [US1] Create src/renderer/features/speckit/components/ directory
- [X] T059 [US1] Create PlanPage component skeleton in src/renderer/features/speckit/components/plan-page.tsx with basic layout structure
- [X] T060 [US1] Add SpecKit icon button (FileText from lucide-react) to sub-chat-selector.tsx in same group as Terminal button
- [X] T061 [US1] Create drawer state atom speckitDrawerOpenAtom in src/renderer/features/speckit/atoms/index.ts
- [X] T062 [US1] Wire SpecKit icon button onClick to toggle drawer open/closed via props from active-chat.tsx
- [X] T063 [US1] Create SpecKitSidebar component in src/renderer/features/speckit/components/speckit-sidebar.tsx using ResizableSidebar pattern
- [X] T064 [US1] Add SpecKitSidebar to active-chat.tsx rendering PlanPage when drawer is open
- [X] T065 [US1] Add toggle behavior so clicking SpecKit button when drawer is open closes it

**Checkpoint**: User Story 1 complete - SpecKit icon button opens Plan page in right drawer with toggle functionality

---

## Phase 4: User Story 4 - Create New Feature Workflow (Priority: P1) 🎯 MVP

**Goal**: Users can initiate and complete the full SpecKit workflow (specify → clarify → plan → tasks) through a guided UI modal

**Independent Test**: Click "New Feature" button, enter feature description, and be guided through each workflow step with visual feedback until tasks.md is generated

**Note**: Implementing US4 before US2/US3 because it's P1 and provides core value proposition

### Workflow Modal (Full-Screen Interface)

- [X] T066 [P] [US4] Create WorkflowModal component in src/renderer/features/speckit/components/workflow-modal.tsx with full-screen dialog layout
- [X] T067 [P] [US4] Create workflow stepper UI in src/renderer/features/speckit/components/workflow-stepper.tsx showing: Constitution | Specify | Clarify | Plan | Tasks | Implement
- [X] T068 [US4] Add dual-pane layout to WorkflowModal with chat pane (left) and document pane (right) in src/renderer/features/speckit/components/workflow-modal.tsx
- [X] T069 [US4] Create chat pane component ChatPane in src/renderer/features/speckit/components/chat-pane.tsx for command execution and output streaming
- [X] T070 [US4] Create document pane component DocumentPane in src/renderer/features/speckit/components/document-pane.tsx for live artifact preview using MarkdownView
- [X] T071 [US4] Wire speckitModalOpenAtom to WorkflowModal open/close state in src/renderer/features/speckit/components/workflow-modal.tsx

### Workflow State Management

- [X] T072 [P] [US4] Create useWorkflowState custom hook in src/renderer/features/speckit/hooks/use-workflow-state.ts wrapping trpc.speckit.getWorkflowState.useQuery
- [X] T073 [P] [US4] Create useExecuteCommand custom hook in src/renderer/features/speckit/hooks/use-execute-command.ts wrapping trpc.speckit.executeCommand.useMutation
- [X] T074 [P] [US4] Create useCommandOutput custom hook in src/renderer/features/speckit/hooks/use-command-output.ts wrapping trpc.speckit.onCommandOutput.useSubscription

### Workflow Steps Implementation

- [X] T075 [US4] Create SpecifyStep component in src/renderer/features/speckit/components/workflow-steps/specify-step.tsx with feature description input form
- [X] T076 [US4] Implement form submit handler in SpecifyStep calling useExecuteCommand with `/speckit.specify` command in src/renderer/features/speckit/components/workflow-steps/specify-step.tsx
- [X] T077 [US4] Create ClarifyStep component in src/renderer/features/speckit/components/workflow-steps/clarify-step.tsx displaying clarification questions from WorkflowState
- [X] T078 [US4] Implement clarification question answer form in ClarifyStep with textarea for each question in src/renderer/features/speckit/components/workflow-steps/clarify-step.tsx
- [X] T079 [US4] Implement form submit handler in ClarifyStep calling useExecuteCommand with `/speckit.clarify` command and answers in src/renderer/features/speckit/components/workflow-steps/clarify-step.tsx
- [X] T080 [US4] Create PlanStep component in src/renderer/features/speckit/components/workflow-steps/plan-step.tsx with auto-initiate plan generation button
- [X] T081 [US4] Implement plan approval UI in PlanStep showing generated plan.md with approve/regenerate actions in src/renderer/features/speckit/components/workflow-steps/plan-step.tsx
- [X] T082 [US4] Create TasksStep component in src/renderer/features/speckit/components/workflow-steps/tasks-step.tsx with auto-generate tasks button
- [X] T083 [US4] Implement tasks generation completion UI in TasksStep showing success message and link to tasks.md in src/renderer/features/speckit/components/workflow-steps/tasks-step.tsx

### Command Execution & Output Streaming

- [X] T084 [US4] Implement real-time command output streaming display in ChatPane using useCommandOutput hook in src/renderer/features/speckit/components/chat-pane.tsx
- [X] T085 [US4] Add stdout/stderr differentiation styling in ChatPane (stdout: normal, stderr: error red) in src/renderer/features/speckit/components/chat-pane.tsx
- [X] T086 [US4] Implement command cancellation button in ChatPane calling trpc.speckit.cancelCommand in src/renderer/features/speckit/components/chat-pane.tsx
- [X] T087 [US4] Add loading/executing state indicators with progress spinners in ChatPane in src/renderer/features/speckit/components/chat-pane.tsx

### Live Artifact Preview

- [X] T088 [US4] Implement auto-refresh artifact content in DocumentPane polling trpc.speckit.getArtifact when workflow step completes in src/renderer/features/speckit/components/document-pane.tsx
- [X] T089 [US4] Add artifact type tabs (Spec | Plan | Research | Tasks) to DocumentPane in src/renderer/features/speckit/components/document-pane.tsx
- [X] T090 [US4] Wire artifact tabs to speckitCurrentDocumentAtom for display in src/renderer/features/speckit/components/document-pane.tsx

### Implement Step (Task List with Copy Buttons)

- [X] T090.1 [US4] Create ImplementStep component in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx with task list layout
- [X] T090.2 [US4] Implement task list parsing from tasks.md file in ImplementStep using trpc.speckit.getArtifact in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T090.3 [US4] Display each task with full description (task ID, description text, file paths) in ImplementStep in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T090.4 [US4] Add copy button per task that copies task reference (e.g., "T001") to clipboard using navigator.clipboard.writeText() in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T090.5 [US4] Show toast notification on successful copy with message "Task reference copied. Use /speckit.implement [task-id] in a new chat" in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx

### Stale Warning & Skip Warning Banners

- [X] T090.6 [US4] Create StaleWarningBanner component in src/renderer/features/speckit/components/stale-warning-banner.tsx showing non-blocking warning when downstream artifacts exist
- [X] T090.7 [US4] Add stale detection logic to WorkflowModal checking if current step has downstream artifacts (e.g., navigating to Specify when plan.md exists) in src/renderer/features/speckit/components/workflow-modal.tsx
- [X] T090.8 [US4] Create SkipClarifyWarningBanner component in src/renderer/features/speckit/components/skip-clarify-warning.tsx showing warning when user tries to skip Clarify step
- [X] T090.9 [US4] Add skip detection logic when user clicks Plan step before completing Clarify, showing warning but allowing continue in src/renderer/features/speckit/components/workflow-modal.tsx

### Stepper Navigation (Free Movement Between Completed Steps)

- [X] T090.10 [US4] Make stepper steps clickable for completed steps in src/renderer/features/speckit/components/workflow-stepper.tsx
- [X] T090.11 [US4] Implement step navigation handler that checks step completion before allowing navigation in src/renderer/features/speckit/components/workflow-stepper.tsx
- [X] T090.12 [US4] Integrate stale warning trigger when navigating backward to a previous step in src/renderer/features/speckit/components/workflow-modal.tsx

### Error Handling & Recovery

- [X] T091 [US4] Implement error message display in ChatPane showing ii-spec errors as-is from stderr in src/renderer/features/speckit/components/chat-pane.tsx
- [X] T092 [US4] Add error recovery suggestions UI (e.g., "Command failed - try again" with retry button) in ChatPane in src/renderer/features/speckit/components/chat-pane.tsx
- [X] T093 [US4] Implement workflow step failure handling preserving state and allowing resume in WorkflowModal in src/renderer/features/speckit/components/workflow-modal.tsx

### Integration with Plan Page

- [X] T094 [US4] Add "New Feature" button to PlanPage opening WorkflowModal in src/renderer/features/speckit/components/plan-page.tsx
- [X] T095 [US4] Wire "New Feature" button onClick to set speckitModalOpenAtom to true in src/renderer/features/speckit/components/plan-page.tsx
- [X] T096 [US4] Implement features list refresh after workflow completion using React Query invalidation in src/renderer/features/speckit/components/plan-page.tsx

**Checkpoint**: User Story 4 complete - users can create new features through full guided workflow with real-time feedback

---

## Phase 5: User Story 2 - View Constitution (Priority: P2)

**Goal**: Users can view the project constitution document from the Plan page

**Independent Test**: Open Plan page and click "View Constitution" to display constitution content

### Implementation for User Story 2

- [X] T097 [P] [US2] Create ConstitutionSection component in src/renderer/features/speckit/components/constitution-section.tsx with section heading and view button
- [X] T098 [US2] Implement trpc.speckit.getConstitution query hook in ConstitutionSection component in src/renderer/features/speckit/components/constitution-section.tsx
- [X] T099 [US2] Add constitution preview UI showing extracted principle names using extractPrincipleNames() utility in src/renderer/features/speckit/components/constitution-section.tsx
- [X] T100 [US2] Create "View Constitution" button opening constitution in modal or expandable section in src/renderer/features/speckit/components/constitution-section.tsx
- [X] T101 [US2] Implement full constitution modal dialog ConstitutionModal in src/renderer/features/speckit/components/constitution-modal.tsx rendering markdown using MarkdownView component
- [X] T102 [US2] Wire "View Constitution" button to open ConstitutionModal in src/renderer/features/speckit/components/constitution-section.tsx
- [X] T103 [US2] Add "Edit Constitution" button in ConstitutionModal calling trpc.speckit.openFileInEditor with .specify/memory/constitution.md path in src/renderer/features/speckit/components/constitution-modal.tsx
- [X] T104 [US2] Implement "No constitution found" message when constitution doesn't exist with "Create Constitution" action in src/renderer/features/speckit/components/constitution-section.tsx
- [X] T105 [US2] Wire "Create Constitution" button to execute `/speckit.constitution` command in src/renderer/features/speckit/components/constitution-section.tsx
- [X] T106 [US2] Add ConstitutionSection to PlanPage layout above features section in src/renderer/features/speckit/components/plan-page.tsx

**Checkpoint**: User Story 2 complete - users can view and edit constitution from Plan page

---

## Phase 6: User Story 3 - Browse Previous Features (Priority: P2)

**Goal**: Users can view a list of all previous SpecKit features and their associated artifacts

**Independent Test**: Open Plan page, view features list, select a feature, and view its spec/plan/research/tasks artifacts

### Implementation for User Story 3

- [X] T107 [P] [US3] Create FeaturesTable component in src/renderer/features/speckit/components/features-table.tsx with table layout (ID | Name | Description | Branch | Artifacts)
- [X] T108 [US3] Implement trpc.speckit.getFeaturesList query hook in FeaturesTable component in src/renderer/features/speckit/components/features-table.tsx
- [X] T109 [US3] Add table row rendering mapping SpecKitFeature to FeatureTableRow display format in src/renderer/features/speckit/components/features-table.tsx
- [X] T110 [US3] Implement artifact presence indicators showing checkmarks for existing artifacts (spec ✓, plan ✓, etc.) in src/renderer/features/speckit/components/features-table.tsx
- [X] T111 [US3] Add "No features yet" empty state message when features list is empty in src/renderer/features/speckit/components/features-table.tsx
- [X] T112 [US3] Create feature selection onClick handler opening FeatureDetailModal in src/renderer/features/speckit/components/features-table.tsx
- [X] T113 [US3] Create FeatureDetailModal component in src/renderer/features/speckit/components/feature-detail-modal.tsx with tabs for Specification | Plan | Research | Tasks
- [X] T114 [US3] Implement artifact tabs switching in FeatureDetailModal calling trpc.speckit.getArtifact for selected artifact type in src/renderer/features/speckit/components/feature-detail-modal.tsx
- [X] T115 [US3] Add markdown rendering of artifact content in FeatureDetailModal using MarkdownView component in src/renderer/features/speckit/components/feature-detail-modal.tsx
- [X] T116 [US3] Implement "Open in Editor" button per artifact in FeatureDetailModal calling trpc.speckit.openFileInEditor in src/renderer/features/speckit/components/feature-detail-modal.tsx
- [X] T117 [US3] Add loading states for artifact content fetching in FeatureDetailModal in src/renderer/features/speckit/components/feature-detail-modal.tsx
- [X] T118 [US3] Add error handling for missing artifacts showing "Artifact not found" message in FeatureDetailModal in src/renderer/features/speckit/components/feature-detail-modal.tsx
- [X] T119 [US3] Add FeaturesTable to PlanPage layout below constitution section in src/renderer/features/speckit/components/plan-page.tsx

**Checkpoint**: User Story 3 complete - users can browse all features and view their artifacts

---

## Phase 7: User Story 5 - Submodule Integration (Priority: P3)

**Goal**: Verify ii-spec submodule is properly integrated and accessible

**Independent Test**: Verify .gitmodules file references forked repository, run `git submodule update --init`, and confirm app can access ii-spec functionality

**Note**: Most of this was completed in Phase 0, this phase is verification only

### Implementation for User Story 5

- [X] T120 [US5] Verify .gitmodules file contains correct ii-spec submodule URL pointing to forked repository
- [X] T121 [US5] Verify submodule initialization works by testing `git submodule update --init` command in fresh clone
- [X] T122 [US5] Verify app can access ii-spec submodule by testing trpc.speckit.executeCommand with `/speckit.specify` command
- [X] T123 [US5] Add submodule verification check to app startup sequence detecting missing/uninitialized submodule in src/main/index.ts
- [X] T124 [US5] Implement user warning dialog when submodule not initialized showing instructions to run `git submodule update --init` in src/renderer/app.tsx or error boundary

**Checkpoint**: User Story 5 complete - submodule integration verified and error handling in place

---

## Phase 8: Initialization Detection & One-Click Setup

**Purpose**: Handle uninitialized SpecKit projects gracefully with one-click initialization

**Cross-cutting concern**: Affects Plan Page initial load (used by US2, US3, US4)

### Implementation

- [X] T125 Create InitializationPrompt component in src/renderer/features/speckit/components/initialization-prompt.tsx with heading "Initialize SpecKit" and description
- [X] T126 Add initialization detection logic to PlanPage checking initStatus.initialized before rendering constitution/features sections in src/renderer/features/speckit/components/plan-page.tsx
- [X] T127 Implement "Initialize SpecKit" button in InitializationPrompt calling trpc.speckit.initializeSpecKit in src/renderer/features/speckit/components/initialization-prompt.tsx
- [X] T128 Add loading state and progress indicator during initialization in InitializationPrompt in src/renderer/features/speckit/components/initialization-prompt.tsx
- [X] T129 Implement initialization success handling refreshing Plan page UI to show constitution/features sections in src/renderer/features/speckit/components/initialization-prompt.tsx
- [X] T130 Add initialization error handling showing error message from ii-spec with retry button in src/renderer/features/speckit/components/initialization-prompt.tsx
- [X] T131 Add partial initialization detection showing "Re-initialize SpecKit" with missing components list in src/renderer/features/speckit/components/initialization-prompt.tsx

**Checkpoint**: Initialization detection complete - users can initialize SpecKit with one click

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Performance Optimization

- [X] T132 [P] Implement features list pagination in FeaturesTable using limit/offset from trpc.speckit.getFeaturesList in src/renderer/features/speckit/components/features-table.tsx
- [X] T133 [P] Add React.memo() to MarkdownView component preventing unnecessary re-renders in src/renderer/features/speckit/components/markdown-view.tsx
- [X] T134 [P] Implement artifact content caching in DocumentPane using React Query cache in src/renderer/features/speckit/components/document-pane.tsx
- [X] T135 [P] Add debouncing to workflow state polling reducing query frequency in src/renderer/features/speckit/hooks/use-workflow-state.ts

### Accessibility

- [X] T136 [P] Add ARIA labels to SpecKit icon button in src/renderer/features/agents/ui/sub-chat-selector.tsx
- [X] T137 [P] Add keyboard shortcuts for workflow modal (Esc to close) in src/renderer/features/speckit/components/workflow-modal.tsx
- [X] T138 [P] Implement focus management in modal dialogs trapping focus within modal in src/renderer/features/speckit/components/workflow-modal.tsx and src/renderer/features/speckit/components/feature-detail-modal.tsx
- [X] T139 [P] Add screen reader announcements for workflow step transitions in src/renderer/features/speckit/components/workflow-stepper.tsx

### Error Handling & Edge Cases

- [X] T140 [P] Add error boundary around PlanPage catching rendering errors in src/renderer/features/speckit/components/plan-page.tsx
- [X] T141 [P] Implement graceful degradation when Git operations fail showing user-friendly error messages in all components calling Git procedures
- [X] T142 [P] Add file watcher integration refreshing features list when specs/ directory changes using trpc.speckit.watchDirectory in src/renderer/features/speckit/components/features-table.tsx
- [X] T143 [P] Handle corrupted spec.md files showing parsing error instead of crashing in src/main/lib/speckit/state-detector.ts

### Documentation & Developer Experience

- [X] T144 [P] Add JSDoc comments to all tRPC procedures in src/main/lib/trpc/routers/speckit.ts
- [X] T145 [P] Add inline code comments explaining workflow state detection logic in src/main/lib/speckit/state-detector.ts
- [X] T146 [P] Add component props TypeScript interfaces with JSDoc in all new components
- [X] T147 Update quickstart.md with actual implementation file paths and verification steps

### Code Cleanup

- [X] T148 [P] Remove any TODO comments and replace with proper implementations or GitHub issues
- [X] T149 [P] Run linter and fix all warnings in src/main/lib/speckit/ and src/renderer/features/speckit/
- [X] T150 [P] Verify all imports use absolute paths via aliases (e.g., @/features/speckit) not relative paths
- [X] T151 Run quickstart.md validation steps ensuring all commands execute successfully

**Checkpoint**: Polish complete - feature ready for production use

---

## Phase 10: v2 - UI Refinements & Post-Implementation Workflow

**Purpose**: Refactor UI based on v2 requirements (FR-037 to FR-045)

**Key Changes**:
- Rename "SpecKit" → "Spec" throughout UI
- Restructure Plan page with Overview + Current Branch sections
- Add collapsible phases with phase-level copy buttons in Implement step
- Update copy button format to include branch name

### Global Renaming (FR-037)

- [X] T152 [P] [V2] Rename "SpecKit" to "Spec" in icon button label in src/renderer/features/agents/ui/sub-chat-selector.tsx
- [X] T153 [P] [V2] Rename "SpecKit Plan Page" to "Spec Plan Page" in src/renderer/features/speckit/components/plan-page.tsx
- [X] T154 [P] [V2] Rename "SpecKit" to "Spec" in WorkflowModal title in src/renderer/features/speckit/components/workflow-modal.tsx
- [X] T155 [P] [V2] Update all user-facing text from "SpecKit" to "Spec" in InitializationPrompt in src/renderer/features/speckit/components/initialization-prompt.tsx
- [X] T156 [P] [V2] Update atom names from `speckit*` to `spec*` (optional - SKIPPED: kept for backward compat and internal consistency)

### Plan Page Restructure (FR-038, FR-039)

- [X] T157 [V2] Refactor PlanPage into two main sections: Overview and Current Branch in src/renderer/features/speckit/components/plan-page.tsx
- [X] T158 [V2] Create OverviewSection component containing constitution and features list in src/renderer/features/speckit/components/overview-section.tsx
- [X] T159 [V2] Create CurrentBranchSection component with branch header and workflow progress in src/renderer/features/speckit/components/current-branch-section.tsx
- [X] T160 [V2] Implement branch detection in PlanPage showing CurrentBranchSection only when on feature branch in src/renderer/features/speckit/components/plan-page.tsx
- [X] T161 [V2] Create WorkflowProgressIndicator component showing Spec → Plan → Tasks → Implement progress in src/renderer/features/speckit/components/workflow-progress-indicator.tsx
- [X] T162 [V2] Create tabbed interface for Specification/Plan/Tasks/Implement in CurrentBranchSection using Radix Tabs in src/renderer/features/speckit/components/current-branch-section.tsx
- [X] T163 [V2] Wire Specification tab to render spec.md using trpc.speckit.getArtifact in src/renderer/features/speckit/components/current-branch-section.tsx
- [X] T164 [V2] Wire Plan tab to render plan.md using trpc.speckit.getArtifact in src/renderer/features/speckit/components/current-branch-section.tsx
- [X] T165 [V2] Wire Tasks tab to render tasks.md using trpc.speckit.getArtifact in src/renderer/features/speckit/components/current-branch-section.tsx
- [X] T166 [V2] Wire Implement tab to show task list by phase (only if tasks.md exists) in src/renderer/features/speckit/components/current-branch-section.tsx

### Implement Step - Collapsible Phases (FR-040, FR-041)

- [X] T167 [V2] Refactor ImplementStep to group tasks by phase instead of flat list in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T168 [V2] Parse phase headers from tasks.md (e.g., "## Phase 0: Submodule Relocation") in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T169 [V2] Create PhaseSection component with collapsible/expandable UI using Radix Collapsible in src/renderer/features/speckit/components/phase-section.tsx
- [X] T170 [V2] Display phase number and title in PhaseSection header (e.g., "Phase 0: Submodule Relocation") in src/renderer/features/speckit/components/phase-section.tsx
- [X] T171 [V2] Implement collapse/expand toggle in PhaseSection header in src/renderer/features/speckit/components/phase-section.tsx
- [X] T172 [V2] Group tasks under their respective phases in ImplementStep rendering in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx

### Phase & Task Copy Buttons (FR-042, FR-043, FR-044, FR-045)

- [X] T173 [V2] Add phase-level copy button to PhaseSection header in src/renderer/features/speckit/components/phase-section.tsx
- [X] T174 [V2] Implement phase copy button onClick to copy `/speckit.implement [branch-name] Phase-[N]` format in src/renderer/features/speckit/components/phase-section.tsx
- [X] T175 [V2] Add tooltip "Copy command to implement all tasks in this phase" to phase copy button in src/renderer/features/speckit/components/phase-section.tsx
- [X] T176 [V2] Update task copy button to include branch name: `/speckit.implement [branch-name] [task-id]` in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T177 [V2] Add tooltip "Copy command to implement this specific task" to task copy button in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T178 [V2] Get current branch name using trpc.speckit.getCurrentBranch for copy button format in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx
- [X] T179 [V2] Update toast notification message to reflect new format with branch name in src/renderer/features/speckit/components/workflow-steps/implement-step.tsx

### Current Branch Section Integration

- [X] T180 [V2] Apply same collapsible phase structure to Implement tab in CurrentBranchSection (reuse PhaseSection component) in src/renderer/features/speckit/components/current-branch-section.tsx
- [X] T181 [V2] Ensure phase/task copy buttons work consistently in both WorkflowModal and CurrentBranchSection contexts in src/renderer/features/speckit/components/phase-section.tsx

**Checkpoint**: v2 complete - UI refactored with improved structure and usability

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Submodule Relocation)**: No dependencies - MUST complete first (BLOCKING)
- **Phase 1 (Dependencies)**: Depends on Phase 0 completion
- **Phase 2 (Foundational)**: Depends on Phase 1 completion - BLOCKS all user stories
- **Phase 3 (US1 - Access)**: Depends on Phase 2 completion - Can run in parallel with other user stories
- **Phase 4 (US4 - Workflow)**: Depends on Phase 2 completion - Can run in parallel with US1, US2, US3
- **Phase 5 (US2 - Constitution)**: Depends on Phase 2 completion - Can run in parallel with US1, US3, US4
- **Phase 6 (US3 - Features)**: Depends on Phase 2 completion - Can run in parallel with US1, US2, US4
- **Phase 7 (US5 - Submodule)**: Depends on Phase 0 completion - Verification only, can run anytime after Phase 0
- **Phase 8 (Initialization)**: Depends on Phase 2 completion - Should complete before US2/US3/US4 integration testing
- **Phase 9 (Polish)**: Depends on all desired user stories being complete
- **Phase 10 (v2 Refinements)**: Depends on Phases 3-6 completion - Refactors existing UI components

### User Story Dependencies

- **User Story 1 (US1 - Access)**: Depends on Phase 2 - No dependencies on other stories - PROVIDES drawer access for US2/US3/US4
- **User Story 4 (US4 - Workflow)**: Depends on Phase 2 and US1 (needs drawer) - Core value proposition
- **User Story 2 (US2 - Constitution)**: Depends on Phase 2 and US1 (needs Plan page) - Independent from US3/US4
- **User Story 3 (US3 - Features)**: Depends on Phase 2 and US1 (needs Plan page) - Independent from US2/US4
- **User Story 5 (US5 - Submodule)**: Depends on Phase 0 - Verification only, independent from all other stories

### Within Each Phase

**Phase 2 (Foundational)**:
- Backend utilities (T014-T024) can run in parallel after directory creation
- tRPC procedures (T026-T041) depend on backend utilities being complete
- Frontend types (T043-T052) can run in parallel with backend work
- Frontend atoms (T053-T055) can run in parallel with types
- Shared components (T056-T057) depend on types being complete

**Phase 3 (US1)**:
- All tasks after component directory creation can proceed sequentially
- T061-T062 and T063-T064 can run in parallel (different files)

**Phase 4 (US4)**:
- Modal components (T066-T071) can run in parallel after skeleton creation
- Hooks (T072-T074) can run in parallel
- Workflow step components (T075-T083) can run in parallel after hooks complete
- Command execution (T084-T087) depends on hooks
- Live preview (T088-T090) can run in parallel with command execution
- Error handling (T091-T093) can run in parallel with other modal features
- Integration (T094-T096) runs last after modal complete

**Phase 5 (US2)**:
- T097-T099 can run together (same component)
- T100-T103 can run in parallel with T104-T105 (different modals)
- T106 runs last (integration)

**Phase 6 (US3)**:
- T107-T112 can run together (same table component)
- T113-T118 can run together (same modal component)
- T119 runs last (integration)

**Phase 8 (Initialization)**:
- T125-T126 can run in parallel
- T127-T131 run sequentially (same component logic)

**Phase 9 (Polish)**:
- All performance tasks (T132-T135) can run in parallel
- All accessibility tasks (T136-T139) can run in parallel
- All error handling tasks (T140-T143) can run in parallel
- All documentation tasks (T144-T147) can run in parallel
- All cleanup tasks (T148-T151) can run in parallel

### Parallel Opportunities

**Maximum Parallelization After Phase 2 Complete**:
```bash
# Four developers can work simultaneously:
Developer A: Phase 3 (US1 - Access) → T058-T065
Developer B: Phase 4 (US4 - Workflow) → T066-T096
Developer C: Phase 5 (US2 - Constitution) → T097-T106
Developer D: Phase 6 (US3 - Features) → T107-T119
```

**Within Phase 2 (Foundational) - Two developers can parallelize**:
```bash
Developer A: Backend (T014-T042)
Developer B: Frontend types + atoms + shared components (T043-T057)
```

---

## Implementation Strategy

### MVP First (US1 + US4 Only)

**Goal**: Deliver core SpecKit functionality in fastest path to value

1. Complete Phase 0: Submodule Relocation (T001-T006)
2. Complete Phase 1: Dependencies (T007-T013)
3. Complete Phase 2: Foundational (T014-T057) - CRITICAL BLOCKER
4. Complete Phase 3: User Story 1 (T058-T065) - Access to UI
5. Complete Phase 8: Initialization (T125-T131) - Required before US4 works
6. Complete Phase 4: User Story 4 (T066-T096) - Core workflow
7. **STOP and VALIDATE**: Create a new feature end-to-end using the workflow
8. Fix critical bugs if found
9. Demo/Deploy MVP

**Estimated Tasks**: 131 tasks for MVP (T001-T065 + T125-T131 + T066-T096)

### Full Feature (All User Stories)

**Goal**: Complete all P1, P2, P3 user stories in priority order

1. Complete MVP (above)
2. Complete Phase 5: User Story 2 (T097-T106) - Constitution viewing
3. Complete Phase 6: User Story 3 (T107-T119) - Features browsing
4. Complete Phase 7: User Story 5 (T120-T124) - Submodule verification
5. Complete Phase 9: Polish (T132-T151) - Production readiness
6. **STOP and VALIDATE**: Test all user stories independently
7. Run full E2E testing
8. Fix all bugs
9. Production deployment

**Total Tasks**: 151 tasks

### Parallel Team Strategy

With 4 developers after Phase 2 complete:

1. **Week 1**: All developers complete Phase 0-2 together (T001-T057) → Foundation ready
2. **Week 2-3**: Parallel user story development
   - Dev A: US1 (T058-T065) + US5 verification (T120-T124)
   - Dev B: US4 (T066-T096) + Initialization (T125-T131)
   - Dev C: US2 (T097-T106) + Polish docs (T144-T147)
   - Dev D: US3 (T107-T119) + Polish performance (T132-T135)
3. **Week 4**: Integration + Polish
   - All devs: Cross-story testing + remaining polish tasks (T136-T151)
   - Bug fixes and final validation

---

## Notes

- [P] tasks = different files/components, can execute in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently testable after completion
- Phase 2 (Foundational) is CRITICAL - blocks all user stories
- US1 provides access point - should complete before US2/US3/US4 can be tested
- US4 is highest value (P1) but requires US1 + Phase 8 (Initialization)
- All file paths are absolute from repository root
- **Total tasks: 193** (11 phases: 0-10, including v2 refinements)
- **Workflow Completion**: tasks.md exists = workflow at "implement" step (complete)
- **Implement Step**: Shows task list with copy buttons; user runs `/speckit.implement [task-id]` in new chat
- **Free Navigation**: Users can click any completed stepper step to return and modify
- **Stale Warnings**: Non-blocking banners appear when navigating backward with downstream artifacts
- **Skip Clarify Warning**: Shows warning when skipping clarify, but allows user to continue
- Commit after each logical group of tasks
- Stop at any checkpoint to validate independently

---

## Bug Fix: Plan Page and Workflow Modal Issues (2026-02-02)

**Feature Branch**: `001-speckit-ui-integration`
**Purpose**: Fix two critical UI issues in the SpecKit Plan page integration

**Issues Fixed**:
1. New Feature Flow button visibility - button should only appear on named feature branches
2. Workflow modal height - both panes must occupy 100% of available container height

### Implementation Strategy

This is a bug fix affecting two related issues. Tasks are organized to enable independent implementation and testing.

**MVP Scope**: Complete both fixes as a single deliverable - they are tightly coupled through the Plan page component.

**Parallel Execution**: Type creation tasks (T201-T205) can run in parallel. Button fix (T206-T209) and modal fix (T210-T213) can run in parallel after types are created.

---

### Phase 1: Setup - Create Types and Utilities

**Goal**: Establish the branch detection foundation used by all subsequent changes.

- [x] T201 Create `src/renderer/features/speckit/types/branch.ts` with `BranchType` enum, `PROTECTED_BRANCHES` constant, `isProtectedBranch()`, and `isNamedFeatureBranch()` utility functions
- [x] T202 Create `src/renderer/features/speckit/types/workflow.ts` with `WorkflowStartMode` enum
- [x] T203 Update `src/renderer/features/speckit/atoms/index.ts` to add `speckitWorkflowStartModeAtom`, `speckitWorkflowStartStepAtom`, `speckitCurrentBranchTypeAtom`, and `speckitCurrentBranchNameAtom`
- [x] T204 Create `src/renderer/features/speckit/hooks/useBranchDetection.ts` hook that returns branch detection results
- [x] T205 Update `src/renderer/features/speckit/types/index.ts` to export new types from `branch.ts` and `workflow.ts`

---

### Phase 2: Foundational - Add Branch Name Source

**Goal**: Connect the branch detection utilities to a source of truth for the current branch name.

- [x] T206 [P] Read `src/renderer/features/speckit/components/plan-page.tsx` to find where the current branch name is obtained
- [x] T207 [P] Add the branch name value to `speckitCurrentBranchNameAtom` on component mount or use existing atom if available

---

### Phase 3: User Story 1 - Fix New Feature Flow Button Visibility

**Story Goal**: The "New Feature Flow" button appears only on named feature branches (not main/master/internal/staging/dev) and clicking it opens the workflow modal in empty state.

**Independent Test**: Verify button visibility rules on different branch types and that clicking opens the modal correctly.

**Acceptance Criteria**:
- Button visible on `001-test-feature` branch
- Button hidden on `main`, `master`, `internal`, `staging`, `dev` branches
- Clicking button opens workflow modal in empty state

- [x] T208 [P] [US1-FIX] Read `src/renderer/features/speckit/components/plan-page.tsx` to locate the header section where buttons are rendered
- [x] T209 [P] [US1-FIX] Add conditional rendering of "New Feature" button using `useBranchDetection()` hook, showing only when `isNamedFeature === true`
- [x] T210 [US1-FIX] Implement `handleNewFeature` function that sets `speckitWorkflowStartModeAtom` to `NEW_FEATURE`, clears `speckitWorkflowStartStepAtom`, and opens the modal
- [x] T211 [US1-FIX] Wire up the button's `onClick` to call `handleNewFeature`

---

### Phase 4: User Story 2 - Fix Workflow Modal Height

**Story Goal**: Both left and right panes of the workflow modal occupy 100% of available container height regardless of content volume.

**Independent Test**: Open the modal with minimal and maximal content, verify both panes always fill available height.

**Acceptance Criteria**:
- Both panes fill 100% of available height with minimal content
- Both panes fill 100% of available height with maximal content
- Height updates correctly on browser resize

- [x] T212 [P] [US2-FIX] Read `src/renderer/features/speckit/components/workflow-modal.tsx` to identify the flex container structure
- [x] T213 [P] [US2-FIX] Add `min-h-0` class to the main flex container (`div className="flex-1 flex overflow-hidden"`)
- [x] T214 [P] [US2-FIX] Add `min-h-0` class to the left pane container (`div className="flex-1 flex flex-col border-r border-border overflow-hidden"`)
- [x] T215 [US2-FIX] Add `h-full` class to `DocumentPane` component usage to ensure it fills full height

---

### Phase 5: Validation

**Goal**: Verify the complete fix works correctly.

- [ ] T216 Test button visibility on protected branches (main, dev, staging)
- [ ] T217 Test button visibility on named feature branch (`001-test`)
- [ ] T218 Test modal height with minimal content
- [ ] T219 Test modal height with maximal content
- [ ] T220 Test browser resize behavior
- [ ] T221 Review all modified files for consistent TypeScript types and no `any` usage

---

### Dependencies

```
Phase 1 (Types) ──► Phase 2 (Branch Source)
                       │
                       ├──► Phase 3 (US1: Button)
                       │
                       └──► Phase 4 (US2: Modal)
                                │
                                ▼
                          Phase 5 (Validation)
```

**Critical Path**: T201 → T202 → T203 → T204 → T205 → T206 → T207 → T208 → T209 → T210 → T211
**Modal fix tasks** (T212-T215) can run in parallel with button tasks (T208-T211) after Phase 2

---

### Parallel Execution Examples

**After Phase 2 completes**, the following tasks can run in parallel:

| Parallel Group | Tasks | Why Parallel |
|----------------|-------|--------------|
| Group A | T208, T212 | Read different source files |
| Group B | T209, T213, T214 | Implement CSS/class changes |
| Group C | T210, T215 | Complete logic for different features |

**Example Parallel Execution**:
```
T201 ──► T202 ──► T203 ──► T204 ──► T205
                                    │
                                    ▼
T206 ───────────────────────────────┤
                                    ├──► T208 ──► T209 ──► T210 ──► T211 (US1)
                                    │
                                    ├──► T212 ──► T213 ──► T214 ──► T215 (US2)
                                    │
                                    ▼
                                  T216-T221 (Validation)
```

---

### Task Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| Phase 1 | T201-T205 | Create types and utilities |
| Phase 2 | T206-T207 | Connect branch name source |
| Phase 3 | T208-T211 | Fix New Feature button visibility |
| Phase 4 | T212-T215 | Fix modal height issues |
| Phase 5 | T216-T221 | Validation and testing |

**New Tasks**: 21 (T201-T221)
**Total Tasks in File**: 214 (193 original + 21 new)

---

### File Reference

| File | Tasks |
|------|-------|
| `src/renderer/features/speckit/types/branch.ts` | T201 |
| `src/renderer/features/speckit/types/workflow.ts` | T202 |
| `src/renderer/features/speckit/atoms/index.ts` | T203 |
| `src/renderer/features/speckit/hooks/useBranchDetection.ts` | T204 |
| `src/renderer/features/speckit/types/index.ts` | T205 |
| `src/renderer/features/speckit/components/plan-page.tsx` | T206-T211 |
| `src/renderer/features/speckit/components/workflow-modal.tsx` | T212-T215 |
