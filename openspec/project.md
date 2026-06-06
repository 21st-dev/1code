# Project Context

## Purpose
**Locus** - A local-first Electron AI workbench for operating on local projects with multiple agent runtimes. Users select local projects and worktrees, interact with Claude Code, Codex, custom providers, MCP, and local tools in Plan or Agent mode, and observe or control real-time file edits, shell commands, git workflows, and other authorized tool execution.

## Tech Stack
| Layer | Tech |
|-------|------|
| Desktop | Electron ~39.4.0, electron-vite, electron-builder |
| UI | React 19, TypeScript 5.4.5, Tailwind CSS |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Drizzle ORM, better-sqlite3 |
| AI | @anthropic-ai/claude-agent-sdk, bundled Claude Code and Codex runtime integrations |
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
- **Claude Integration**: Dynamic import of `@anthropic-ai/claude-agent-sdk` with two modes: "plan" (read-only) and "agent" (full permissions). The `@anthropic-ai/claude-code` package name refers to the Claude Code CLI install surface, not the SDK dependency used by desktop chat.

### Testing Strategy
- Minimal Bun test suite under `tests/`
- `bun run test` for targeted behavioral checks
- `bun run ts:check` and `bun run build` before release handoff

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
- macOS notarization required for public releases
- Internal macOS/Windows test builds may be unsigned or ad-hoc signed if the limitation is documented for testers
- Dev vs Production use separate userData paths and protocols

## External Dependencies
- **Claude Agent SDK**: `@anthropic-ai/claude-agent-sdk` for desktop chat AI interactions
- **Claude Code CLI**: `@anthropic-ai/claude-code` for the local CLI install surface
- **Manual Release Check**: Optional fork-owned GitHub Releases latest endpoint configured with `LOCUS_RELEASES_REPO` or `MAIN_VITE_RELEASES_REPO`
- **OAuth Provider**: Optional hosted authentication flow configured with `MAIN_VITE_API_URL`
