# Project Context

## Purpose
**21st Agents** - A local-first Electron desktop app for AI-powered code assistance. Users create chat sessions linked to local project folders, interact with Claude in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, etc.).

## Tech Stack
| Layer | Tech |
|-------|------|
| Desktop | Electron 33.4.5, electron-vite, electron-builder |
| UI | React 19, TypeScript 5.4.5, Tailwind CSS |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Drizzle ORM, better-sqlite3 |
| AI | @anthropic-ai/claude-agent-sdk |
| Package Manager | bun |

## Project Conventions

### Code Style
- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)
- Simplicity over complexity - don't overcomplicate things

### Architecture Patterns
- **IPC Communication**: tRPC with `trpc-electron` for type-safe main↔renderer communication
- **State Management**:
  - Jotai: UI state (selected chat, sidebar open, preview settings)
  - Zustand: Sub-chat tabs and pinned state (persisted to localStorage)
  - React Query: Server state via tRPC (auto-caching, refetch)
- **Database**: Drizzle ORM with SQLite, auto-migration on app startup
- **Claude Integration**: Dynamic import of `@anthropic-ai/claude-agent-sdk` SDK with two modes: "plan" (read-only) and "agent" (full permissions)

### Testing Strategy
[Testing approach not yet established - to be defined]

### Git Workflow
- Main branch: `main`
- Feature branches for development
- PRs for code review

## Domain Context
- **Chat Sessions**: Users create chats linked to local project folders
- **Sub-chats**: Sessions within a chat that can have different modes (plan/agent)
- **Tool Execution**: Real-time display of Claude's tool execution (bash, file edits, web search)
- **Session Resume**: Sessions can be resumed via `sessionId` stored in SubChat

## Important Constraints
- Local-first: All data stored locally in SQLite (`{userData}/data/agents.db`)
- Auth via OAuth with encrypted credential storage (safeStorage)
- macOS notarization required for releases
- Dev vs Production use separate userData paths and protocols

## External Dependencies
- **Claude Code SDK**: `@anthropic-ai/claude-agent-sdk` for AI interactions
- **21st.dev CDN**: Auto-update manifests and releases at `cdn.21st.dev`
- **OAuth Provider**: Authentication flow
