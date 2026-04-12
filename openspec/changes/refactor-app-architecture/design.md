# Design: App Architecture Restructure

## Context

1Code is a local-first Electron desktop app (~500 files, 95K+ LoC) that has grown organically. The current architecture works but has pain points that slow development and cause subtle bugs. This document captures technical decisions for the restructure.

## Goals / Non-Goals

**Goals:**
- Make the codebase maintainable for a solo developer
- Improve app startup time and rendering performance
- Prevent regressions with test coverage on critical paths
- Clear separation of concerns between features
- Every file under 500 lines (soft target)

**Non-Goals:**
- Rewrite from scratch (we're refactoring, not rebuilding)
- Change the tech stack (React, Electron, tRPC, Drizzle all stay)
- Add new features (this is pure structural improvement)
- Achieve 100% test coverage
- Monorepo migration (out of scope)

---

## Decisions

### 1. Component Decomposition Strategy

**Decision:** Split by responsibility, not by visual area.

`active-chat.tsx` (8,216 lines) becomes:

```
features/agents/main/
├── active-chat.tsx              # ~200 lines — layout shell, providers, routing
├── active-chat-layout.tsx       # ~300 lines — panel layout (resizable panels)
├── chat-header.tsx              # ~200 lines — chat title, mode toggle, actions
├── messages-area.tsx            # ~400 lines — virtual scroll + message list orchestration
├── chat-input-area.tsx          # (already exists, ~1,742 lines → further split)
│   ├── chat-input-area.tsx      # ~400 lines — input orchestration
│   ├── input-toolbar.tsx        # ~200 lines — buttons, model select
│   └── mention-popover.tsx      # ~200 lines — @mention dropdown
├── tool-output-panel.tsx        # ~300 lines — right panel for file/diff/terminal
├── streaming-indicator.tsx      # ~100 lines — typing/thinking states
└── hooks/
    ├── use-chat-session.ts      # Session lifecycle (start, resume, cancel)
    ├── use-message-stream.ts    # Streaming message subscription
    ├── use-tool-execution.ts    # Tool call tracking
    └── use-chat-keyboard.ts     # Keyboard shortcuts
```

**Rationale:** Responsibility-based splitting makes each file testable in isolation. The layout shell (`active-chat.tsx`) becomes a thin coordinator that composes the pieces.

**Alternatives considered:**
- Split by visual quadrant (top/bottom/left/right) — rejected because visual layout changes more often than responsibilities
- Extract everything into hooks — rejected because it just moves complexity without reducing it

### 2. State Management Architecture

**Decision:** Three-tier model with clear ownership boundaries.

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Server State (tRPC + React Query)         │
│  Source of truth for: projects, chats, subChats,    │
│  messages, git status, file contents                │
│  Pattern: useQuery / useMutation / useSubscription  │
│  Cache: React Query with stale-while-revalidate     │
└──────────────────────┬──────────────────────────────┘
                       │ drives
┌──────────────────────▼──────────────────────────────┐
│  Layer 2: UI State (Jotai atoms)                    │
│  Source of truth for: selected IDs, panel widths,   │
│  toggle states, user preferences, theme settings    │
│  Pattern: atomWithStorage / atomWithWindowStorage    │
│  Persistence: localStorage (window-scoped)          │
└──────────────────────┬──────────────────────────────┘
                       │ drives
┌──────────────────────▼──────────────────────────────┐
│  Layer 3: Ephemeral State (Zustand or local state)  │
│  Source of truth for: streaming status, input draft, │
│  hover states, animation states, transient UI       │
│  Pattern: Zustand for cross-component, useState for │
│  component-local                                    │
│  Persistence: None (lost on unmount/refresh)        │
└─────────────────────────────────────────────────────┘
```

**Key rule:** Messages are ONLY in React Query cache (from tRPC). Remove `message-store.ts` Zustand store. If we need optimistic updates, use React Query's `setQueryData`.

**Atom reorganization:**

```
src/renderer/lib/atoms/
├── index.ts                    # Re-exports only
├── chat.ts                     # selectedChatId, subChatMode, lastModel
├── sidebar.ts                  # sidebarOpen, sidebarWidth, subChatsSidebarOpen
├── preview.ts                  # previewOpen, previewWidth, previewPath
├── diff.ts                     # diffOpen, diffWidth, diffSettings
├── settings.ts                 # extendedThinking, sounds, beta flags
├── theme.ts                    # vscodeTheme, chatFontSize
├── layout.ts                   # changesPanelWidth, terminalHeight
└── ui.ts                       # tooltipOpen, contextMenuTarget
```

### 3. Lazy Loading Strategy

**Decision:** Code-split at feature boundary + heavy library level.

```typescript
// Tool renderers — loaded on demand
const toolRegistry = {
  bash: () => import('./ui/agent-bash-tool'),
  diff: () => import('./ui/agent-diff-view'),
  file_edit: () => import('./ui/agent-file-edit'),
  web_search: () => import('./ui/agent-web-search'),
  // ... 20+ tool types
}

// Heavy libraries — lazy with Suspense
const MonacoEditor = lazy(() => import('@monaco-editor/react'))
const MermaidDiagram = lazy(() => import('./ui/mermaid-renderer'))
const TerminalView = lazy(() => import('../terminal/terminal-view'))
```

**Estimated bundle savings:**
- Monaco Editor: ~2MB (loaded only when file viewer opens)
- Mermaid: ~500KB (loaded only on diagram render)
- Shiki themes: ~300KB (loaded per-theme on demand)
- Tool renderers: ~200KB total (loaded per tool type)

### 4. tRPC Router Organization

**Decision:** Group routers into 4 namespaces.

```typescript
// Before: 21 flat routers
appRouter = t.router({
  projects, chats, agents, claude, claudeCode, claudeSettings,
  codex, ollama, anthropicAccounts, terminal, files, commands,
  skills, voice, plugins, external, debug, worktreeConfig,
  sandboxImport, agentUtils, changes
})

// After: 4 grouped namespaces
appRouter = t.router({
  workspace: t.router({     // Project & chat management
    projects, chats, files, worktreeConfig, sandboxImport
  }),
  ai: t.router({            // AI provider integrations
    claude, claudeCode, claudeSettings, codex, ollama,
    anthropicAccounts, agentUtils, agents
  }),
  git: t.router({           // Git operations
    changes, commands        // (git-related commands)
  }),
  system: t.router({        // System-level features
    terminal, voice, plugins, skills, external, debug
  })
})
```

**Migration:** This is a **BREAKING** internal API change. All `trpc.projects.list` becomes `trpc.workspace.projects.list`. Use find-and-replace with TypeScript compiler as safety net.

### 5. Testing Strategy

**Decision:** Playwright E2E for critical flows, Vitest for utilities and stores.

**E2E tests (Playwright):**
```
tests/e2e/
├── auth.spec.ts           # Login → token refresh → logout
├── project-create.spec.ts # Create project → link folder
├── chat-flow.spec.ts      # Create chat → send message → see response
├── session-resume.spec.ts # Close app → reopen → resume session
└── tool-execution.spec.ts # Trigger bash/file_edit → see output
```

**Unit tests (Vitest):**
```
src/**/__tests__/
├── atoms/chat.test.ts
├── stores/message-store.test.ts
├── lib/formatters.test.ts
├── lib/detect-language.test.ts
└── main/lib/db/schema.test.ts
```

### 6. Icon Consolidation

**Decision:** Standardize on Lucide as primary icon library. Keep custom framework icons as SVG sprites.

- **Remove:** `@radix-ui/react-icons` (overlaps with Lucide)
- **Remove:** `@tabler/icons-react` (overlaps with Lucide)
- **Keep:** `lucide-react` (primary)
- **Keep:** Custom framework icons (convert from TSX to SVG sprite)
- **Refactor:** `icons.tsx` (5,873 lines) → split into `icons/brand.tsx`, `icons/tool.tsx`, `icons/status.tsx`

### 7. Error Boundary Strategy

**Decision:** Error boundaries at 3 levels.

```
<AppErrorBoundary>              # Catches catastrophic errors, shows recovery UI
  <FeatureErrorBoundary>        # Per-feature (chat, sidebar, terminal, file-viewer)
    <ToolErrorBoundary>         # Per tool renderer (bash output, diff view, etc.)
      <Component />
    </ToolErrorBoundary>
  </FeatureErrorBoundary>
</AppErrorBoundary>
```

Each boundary:
- Logs to Sentry with context (chatId, toolType, etc.)
- Shows inline fallback UI ("Something went wrong. Retry?")
- Does NOT crash the entire app

---

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large refactor breaks existing features | High | Phase approach; each phase is independently shippable |
| tRPC namespace migration causes broken calls | Medium | TypeScript compiler catches all mismatches |
| Performance regressions from lazy loading | Low | Suspense fallbacks + preload on hover |
| Developer context loss during refactor | Medium | Detailed PR descriptions, commit per logical change |
| Message store migration loses data | High | Migration script; keep old store as readonly fallback for 1 release |

## Migration Plan

Each phase ships independently. No phase depends on another being complete first (though Phase 1 → Phase 2 order is recommended).

**Phase 1 (Components):**
1. Create new files alongside old ones
2. Move code function-by-function with tests
3. Old file shrinks until it's just imports
4. Delete old file, update imports

**Phase 2 (State):**
1. Create new atom files with re-exports from old
2. Move atoms one domain at a time
3. Audit and remove duplicates
4. Delete old atom file

**Phase 4 (tRPC):**
1. Create namespaced routers
2. Add aliases: `trpc.projects` → `trpc.workspace.projects`
3. Migrate renderer calls one router at a time
4. Remove aliases

## Open Questions

1. **Should we normalize messages into their own DB table?** Currently stored as JSON blob in `subChats.messages`. Normalizing enables search, pagination, and reduces memory. But adds migration complexity.

2. **React Compiler vs manual memoization?** React Compiler (experimental) could eliminate need for memo()/useCallback(). But it's not stable yet and may cause subtle bugs. Start with manual, switch when Compiler stabilizes?

3. **Should icon framework icons become an npm package?** They're project-specific but could be extracted for reuse. Probably not worth it for a solo project.

4. **Monorepo structure for shared types?** `src/shared/` is currently 4 files. Not enough to justify a separate package. Revisit when/if web version is built.
