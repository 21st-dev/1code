# Change: Comprehensive App Architecture Restructure

## Why

1Code has grown to ~500 files and 95K+ lines of TypeScript. While the tech stack is modern (React 19, tRPC, Drizzle, Electron), the codebase has accumulated significant structural debt that impacts developer velocity, app performance, and reliability:

- **`active-chat.tsx` is 8,216 lines** — a god component handling messages, input, streaming, tool output, diff view, file viewer, terminal, and sub-chat tabs all in one file
- **102 Jotai atoms in 2 files** — impossible to navigate or understand dependency graphs
- **Message state duplicated across 3 systems** — Zustand store, tRPC/React Query cache, and SQLite
- **Zero test coverage** — no tests exist anywhere in the codebase
- **Icon bloat** — 8,500+ lines across 3 icon files
- **No error boundaries** — a single render error crashes the entire app
- **21 flat tRPC routers** — no grouping, no middleware patterns
- **Deprecated `mock-api.ts`** still used as intermediary instead of direct tRPC calls

## What Changes

This is a phased restructure organized into 6 workstreams:

### Phase 1: Component Architecture (High Impact, Foundation)
- Split `active-chat.tsx` (8,216 lines) into 6-8 focused components
- Split `agents-sidebar.tsx` (3,989 lines) into modular pieces
- Split `agents-subchats-sidebar.tsx` (1,976 lines)
- Introduce error boundaries at feature boundaries
- Implement lazy loading for heavy components (Monaco, Mermaid, xterm)

### Phase 2: State Management Cleanup (Medium Impact, Reduces Bugs)
- Reorganize 102 atoms into domain-based files (`atoms/chat.ts`, `atoms/sidebar.ts`, `atoms/settings.ts`, etc.)
- Eliminate message state duplication — single source of truth via tRPC/React Query
- Remove `mock-api.ts` — all calls go directly through tRPC
- Audit Zustand vs Jotai boundaries — clear ownership rules
- Document state architecture with data flow diagram

### Phase 3: Performance Optimization (High Impact, User-Facing)
- Dynamic imports for tool renderers (agent-bash-tool, agent-diff-view, etc.)
- Lazy load Monaco Editor, Mermaid, and Shiki
- Consolidate icon libraries (Lucide + Tabler + Radix + custom → single strategy)
- Add systematic `memo()` / `useCallback()` to prevent re-render cascades
- Profile and fix message list rendering performance
- Implement `React.Suspense` boundaries with loading states

### Phase 4: Backend & Data Layer Hardening (Medium Impact, Reliability)
- Group tRPC routers into logical namespaces (ai, workspace, git, system)
- Add input validation (Zod) to all tRPC procedures
- Add error handling middleware to tRPC
- Normalize message storage (consider separate messages table vs JSON blob)
- Add database indexes for common queries
- Implement proper session cleanup on crash/force-quit

### Phase 5: Testing Foundation (Long-Term, Prevents Regressions)
- Set up Vitest for unit tests
- Set up Playwright for E2E tests
- Add tests for critical paths:
  - Chat creation → message send → response stream → tool execution
  - Project creation → folder linking
  - Auth flow (login → token refresh → logout)
  - Session resume after app restart
- Target: 30% coverage on critical paths

### Phase 6: DX & Code Quality (Medium Impact, Velocity)
- Add ESLint with strict rules (no-unused-vars, consistent-type-imports, etc.)
- Configure Prettier consistently (confirm config exists)
- Split icon files into tree-shakeable modules
- Add barrel exports for feature modules
- Document architecture decisions in ADR format
- Clean up dead code and unused exports

## Impact

- **Affected specs**: All capabilities — this is a structural refactor
- **Affected code**: Every directory under `src/`
- **Risk**: High — phased approach mitigates this
- **Breaking changes**: None user-facing; internal API changes only
- **Timeline**: 6 phases, each independently shippable
