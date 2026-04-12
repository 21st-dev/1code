# Tasks: App Architecture Restructure

## Phase 1: Component Architecture (Foundation)

### 1.1 Split `active-chat.tsx` (8,216 lines)
- [ ] 1.1.1 Extract `ActiveChatLayout` — resizable panel shell + providers
- [ ] 1.1.2 Extract `ChatHeader` — title, mode toggle, model selector, actions bar
- [ ] 1.1.3 Extract `MessagesArea` — virtual scroll orchestration (delegates to `messages-list.tsx`)
- [ ] 1.1.4 Extract `ToolOutputPanel` — right panel for file viewer, diff, terminal preview
- [ ] 1.1.5 Extract `StreamingIndicator` — thinking/typing animation states
- [ ] 1.1.6 Extract hooks: `useChatSession`, `useMessageStream`, `useToolExecution`, `useChatKeyboard`
- [ ] 1.1.7 Slim `active-chat.tsx` to <300 lines (layout shell + composition)
- [ ] 1.1.8 Verify all features still work after split (manual QA)

### 1.2 Split `chat-input-area.tsx` (1,742 lines)
- [ ] 1.2.1 Extract `InputToolbar` — mode buttons, model select, send button
- [ ] 1.2.2 Extract `MentionPopover` — @mention dropdown and file picker
- [ ] 1.2.3 Extract `AttachmentBar` — file attachment display and management
- [ ] 1.2.4 Slim `chat-input-area.tsx` to <500 lines

### 1.3 Split `agents-sidebar.tsx` (3,989 lines)
- [ ] 1.3.1 Extract `SidebarHeader` — project selector, new chat button
- [ ] 1.3.2 Extract `ChatList` — scrollable chat list with virtual scroll
- [ ] 1.3.3 Extract `ChatListItem` — single chat row (title, timestamp, context menu)
- [ ] 1.3.4 Extract `ArchiveSection` — archived chats collapsible section
- [ ] 1.3.5 Slim `agents-sidebar.tsx` to <400 lines

### 1.4 Split `agents-subchats-sidebar.tsx` (1,976 lines)
- [ ] 1.4.1 Extract `SubChatList` — sub-chat items with drag reordering
- [ ] 1.4.2 Extract `SubChatListItem` — single sub-chat row
- [ ] 1.4.3 Slim to <400 lines

### 1.5 Add Error Boundaries
- [ ] 1.5.1 Create `AppErrorBoundary` — top-level with Sentry reporting
- [ ] 1.5.2 Create `FeatureErrorBoundary` — per-feature with retry button
- [ ] 1.5.3 Create `ToolErrorBoundary` — per tool renderer with inline fallback
- [ ] 1.5.4 Wrap: chat area, sidebar, terminal, file viewer, diff view, each tool renderer
- [ ] 1.5.5 Add Sentry context (chatId, projectId, toolType) to error reports

### 1.6 Implement Lazy Loading
- [ ] 1.6.1 Lazy load Monaco Editor with Suspense fallback
- [ ] 1.6.2 Lazy load Mermaid renderer with Suspense fallback
- [ ] 1.6.3 Lazy load terminal (xterm) with Suspense fallback
- [ ] 1.6.4 Create tool renderer registry with dynamic imports
- [ ] 1.6.5 Add loading skeletons for lazy-loaded components

---

## Phase 2: State Management Cleanup

### 2.1 Reorganize Jotai Atoms
- [ ] 2.1.1 Create `atoms/chat.ts` — move chat-related atoms (selectedChatId, subChatMode, lastModel)
- [ ] 2.1.2 Create `atoms/sidebar.ts` — move sidebar atoms (open, width, subchats sidebar)
- [ ] 2.1.3 Create `atoms/preview.ts` — move preview panel atoms
- [ ] 2.1.4 Create `atoms/diff.ts` — move diff view atoms
- [ ] 2.1.5 Create `atoms/settings.ts` — move all feature flags and settings
- [ ] 2.1.6 Create `atoms/theme.ts` — move VS Code theme, font size, editor settings
- [ ] 2.1.7 Create `atoms/layout.ts` — move panel widths, terminal height
- [ ] 2.1.8 Create `atoms/ui.ts` — move transient UI atoms (tooltips, menus)
- [ ] 2.1.9 Update `atoms/index.ts` to re-export from new files
- [ ] 2.1.10 Update all imports across renderer (find-and-replace safe since re-exports exist)

### 2.2 Eliminate Message State Duplication
- [ ] 2.2.1 Audit all message reads: where does the renderer read messages from? (Zustand vs tRPC cache)
- [ ] 2.2.2 Migrate message reads to use tRPC queries exclusively
- [ ] 2.2.3 Implement optimistic updates via `queryClient.setQueryData` for streaming messages
- [ ] 2.2.4 Remove `message-store.ts` Zustand store (or reduce to streaming-only buffer)
- [ ] 2.2.5 Verify message persistence, streaming, and resume all work

### 2.3 Remove `mock-api.ts`
- [ ] 2.3.1 Audit all imports of `mock-api.ts` across renderer
- [ ] 2.3.2 Replace each call with direct tRPC hook usage
- [ ] 2.3.3 Delete `mock-api.ts`

### 2.4 Document State Architecture
- [ ] 2.4.1 Write state management guide (which layer owns what)
- [ ] 2.4.2 Add inline comments to atom/store files explaining ownership boundaries

---

## Phase 3: Performance Optimization

### 3.1 Bundle Size Reduction
- [ ] 3.1.1 Audit current bundle size (run `npx electron-vite build` and check output)
- [ ] 3.1.2 Consolidate icon libraries: remove `@radix-ui/react-icons` and `@tabler/icons-react`
- [ ] 3.1.3 Replace all Radix icon and Tabler icon usages with Lucide equivalents
- [ ] 3.1.4 Split `icons.tsx` (5,873 lines) into `icons/brand.tsx`, `icons/tool.tsx`, `icons/status.tsx`
- [ ] 3.1.5 Split `canvas-icons.tsx` similarly
- [ ] 3.1.6 Split `framework-icons.tsx` into per-framework modules
- [ ] 3.1.7 Add tree-shaking verification (ensure unused icons don't ship)

### 3.2 Render Performance
- [ ] 3.2.1 Profile message list rendering with React DevTools
- [ ] 3.2.2 Add `memo()` to message item components with proper comparison
- [ ] 3.2.3 Add `useCallback()` to event handlers passed as props
- [ ] 3.2.4 Optimize virtual scroll item size estimation
- [ ] 3.2.5 Profile and fix sidebar re-renders on chat selection
- [ ] 3.2.6 Profile and fix unnecessary re-renders from atom subscriptions

### 3.3 Startup Performance
- [ ] 3.3.1 Measure current app startup time (cold + warm)
- [ ] 3.3.2 Defer non-critical initialization (analytics, updater, voice, plugins)
- [ ] 3.3.3 Preload critical CSS/fonts during splash
- [ ] 3.3.4 Lazy load settings, onboarding, and kanban features
- [ ] 3.3.5 Measure improvement

---

## Phase 4: Backend & Data Layer Hardening

### 4.1 tRPC Router Reorganization
- [ ] 4.1.1 Create namespaced router structure (workspace, ai, git, system)
- [ ] 4.1.2 Move routers into namespace groups
- [ ] 4.1.3 Add backward-compatible aliases during migration
- [ ] 4.1.4 Update all renderer tRPC calls to new namespaces
- [ ] 4.1.5 Remove aliases
- [ ] 4.1.6 Add tRPC error handling middleware (log + transform errors)

### 4.2 Input Validation
- [ ] 4.2.1 Audit all tRPC procedures for missing Zod input validation
- [ ] 4.2.2 Add Zod schemas to procedures that accept user input
- [ ] 4.2.3 Add consistent error responses for validation failures

### 4.3 Database Improvements
- [ ] 4.3.1 Add indexes on frequently queried columns (chats.projectId, subChats.chatId)
- [ ] 4.3.2 Evaluate normalizing messages into separate table (benchmark query performance)
- [ ] 4.3.3 Add database health check on startup
- [ ] 4.3.4 Implement graceful session cleanup on crash (detect orphaned streams)
- [ ] 4.3.5 Add database backup before migration

---

## Phase 5: Testing Foundation

### 5.1 Test Infrastructure
- [ ] 5.1.1 Set up Vitest config (`vitest.config.ts`)
- [ ] 5.1.2 Set up Playwright config for Electron (`playwright.config.ts`)
- [ ] 5.1.3 Add test scripts to `package.json` (`test`, `test:unit`, `test:e2e`)
- [ ] 5.1.4 Set up test utilities (render helpers, mock tRPC, mock Electron APIs)

### 5.2 Unit Tests (Vitest)
- [ ] 5.2.1 Test Jotai atoms (chat selection, settings persistence)
- [ ] 5.2.2 Test Zustand stores (sub-chat tabs, streaming status)
- [ ] 5.2.3 Test utility functions (formatters, detect-language, diff-parser)
- [ ] 5.2.4 Test tRPC router logic (project CRUD, chat CRUD)
- [ ] 5.2.5 Test database schema (migrations, constraints)

### 5.3 E2E Tests (Playwright)
- [ ] 5.3.1 Test: Create project → link folder → verify in sidebar
- [ ] 5.3.2 Test: Create chat → send message → see streaming response
- [ ] 5.3.3 Test: Switch between plan/agent modes
- [ ] 5.3.4 Test: Session resume after app restart
- [ ] 5.3.5 Test: Tool execution display (bash output, file edit diff)

---

## Phase 6: DX & Code Quality

### 6.1 Linting & Formatting
- [ ] 6.1.1 Add ESLint config with TypeScript rules
- [ ] 6.1.2 Add rules: no-unused-vars, consistent-type-imports, no-explicit-any
- [ ] 6.1.3 Verify Prettier config exists and is consistent
- [ ] 6.1.4 Run linter, fix auto-fixable issues
- [ ] 6.1.5 Add lint script to package.json

### 6.2 Code Cleanup
- [ ] 6.2.1 Remove dead code (unused exports, commented-out code)
- [ ] 6.2.2 Remove unused dependencies from package.json
- [ ] 6.2.3 Consolidate duplicate utility functions
- [ ] 6.2.4 Standardize import ordering (external → internal → relative)

### 6.3 Documentation
- [ ] 6.3.1 Update CLAUDE.md with new architecture patterns
- [ ] 6.3.2 Update OpenSpec project.md with new conventions
- [ ] 6.3.3 Add architecture decision records (ADRs) for key decisions
- [ ] 6.3.4 Add inline comments to complex business logic
