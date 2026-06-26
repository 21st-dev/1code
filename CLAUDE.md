<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**Locus** - A local-first Electron desktop app for local coding agents. Users create chat sessions linked to local project folders, interact with Claude/Codex-compatible agents in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, etc.).

## Commands

```bash
# Development
bun run dev              # Start Electron with hot reload

# Build
bun run build            # Compile app
bun run package          # Package for current platform (dir)
bun run package:mac      # Build macOS (DMG + ZIP)
bun run package:win      # Build Windows (NSIS + portable)
bun run package:linux    # Build Linux (AppImage + DEB)

# Database (Drizzle + SQLite)
bun run db:generate      # Generate migrations from schema
bun run db:push          # Push schema directly (dev only)
```

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, window lifecycle
│   ├── auth-manager.ts      # OAuth flow, token refresh
│   ├── auth-store.ts        # Encrypted credential storage (safeStorage)
│   ├── windows/main.ts      # Window creation, IPC handlers
│   └── lib/
│       ├── db/              # Drizzle + SQLite
│       │   ├── index.ts     # DB init, auto-migrate on startup
│       │   ├── schema/      # Drizzle table definitions
│       │   └── utils.ts     # ID generation
│       └── trpc/routers/    # tRPC routers (projects, chats, claude)
│
├── preload/                 # IPC bridge (context isolation)
│   └── index.ts             # Exposes desktopApi + tRPC bridge
│
└── renderer/                # React 19 UI
    ├── App.tsx              # Root with providers
    ├── features/
    │   ├── agents/          # Main chat interface
    │   │   ├── main/        # active-chat.tsx, new-chat-form.tsx
    │   │   ├── ui/          # Tool renderers, preview, diff view
    │   │   ├── commands/    # Slash commands (/plan, /agent, /clear)
    │   │   ├── mentions/    # Agent composer mention editor
    │   │   ├── atoms/       # Jotai atoms for agent state
    │   │   └── stores/      # Zustand store for sub-chats
    │   ├── sidebar/         # Chat list, sub-chat sidebar, archive, navigation
    │   ├── settings/        # Settings shell/content
    │   ├── details-sidebar/ # Terminal, trace, diff, browser, file detail panes
    │   └── layout/          # Main layout with resizable panels
    ├── components/ui/       # Radix UI wrappers (button, dialog, etc.)
    └── lib/
        ├── atoms/           # Global Jotai atoms
        ├── stores/          # Global Zustand stores
        └── trpc.ts          # Real tRPC client
```

Chat hydration uses `src/shared/chat-message-normalizer.ts`; renderer chat
hooks live in `src/renderer/features/agents/lib/agent-chat-api.ts`.

## Database (Drizzle ORM)

**Location:** `{userData}/data/agents.db` (SQLite)

**Schema:** `src/main/lib/db/schema/index.ts`

Current schema source defines these tables:

| Table | Purpose |
|-------|---------|
| `projects` | Registered local project folders plus git metadata and removal state |
| `chats` | Project or folderless chat threads, worktree fields, archive state, PR tracking |
| `worktree_setup_trust_decisions` | Per-project approval decisions for repository-provided worktree setup commands |
| `sub_chats` | Runtime sessions, mode, stream id, and persisted message JSON for each chat tab |
| `claude_code_credentials` | Legacy encrypted Claude Code credential row |
| `anthropic_accounts` | Multi-account Claude Code OAuth credential envelopes |
| `anthropic_settings` | Active Anthropic account pointer |
| `claude_provider_config` | Legacy single Claude-compatible provider config |
| `local_api_provider_configs` | Encrypted helper-provider configs for local utility calls |
| `agent_provider_profiles` | Runtime-neutral provider profiles, headers, target runtimes, diagnostics |
| `agent_provider_defaults` | Default profile/model bindings by purpose |
| `app_agents` | Locus-managed reusable agent profiles |
| `agent_jobs` | Headless/API/daemon/schedule job records and lifecycle state |
| `agent_job_events` | Ordered durable events for agent jobs |
| `agent_schedules` | Recurring local agent schedule definitions |
| `agent_schedule_runs` | Schedule trigger to job linkage records |

Schema details live in `src/main/lib/db/schema/index.ts`; treat that file as the table source of truth.

**Auto-migration:** On app start, `initDatabase()` runs migrations from `drizzle/` folder (dev) or `resources/migrations` (packaged).

**Queries:**
```typescript
import { getDatabase, projects, chats } from "../lib/db"
import { eq } from "drizzle-orm"

const db = getDatabase()
const allProjects = db.select().from(projects).all()
const projectChats = db.select().from(chats).where(eq(chats.projectId, id)).all()
```

## Key Patterns

### IPC Communication
- Uses **tRPC** with `trpc-electron` for type-safe main↔renderer communication
- All backend calls go through tRPC routers, not raw IPC
- Preload exposes `window.desktopApi` for native features (window controls, clipboard, notifications)

### State Management
- **Jotai**: UI state (selected chat, sidebar open, preview settings)
- **Zustand**: Sub-chat tabs and pinned state (persisted to localStorage)
- **React Query**: Server state via tRPC (auto-caching, refetch)

### Runtime Integrations
- Claude Code: `@anthropic-ai/claude-agent-sdk` for desktop chat plus bundled Claude Code executable for local runtime/auth surfaces
- Codex: bundled Codex CLI/app-server adapter for desktop chat, provider binding, approvals, and headless/batch fallback
- Qwen Code: experimental desktop runtime behind the Qwen runtime feature gate
- Kun: experimental desktop runtime behind the Kun feature gate, with CLI/config status and guarded shell approval
- Ollama: local/offline Claude-compatible fallback and diagnostics for model availability
- Headless jobs: Local Job API, CLI, daemon, schedule, and protocol runners using `src/main/lib/headless/`
- Shared modes: "plan" (read-only) and "agent" (write-capable under the selected runtime policy)
- Runtime capability truth lives in `src/shared/agent-runtime-capabilities.ts` and `src/main/lib/agent-runtime/runtime-registry.ts`

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 39, electron-vite, electron-builder |
| UI | React 19, TypeScript 5.x, Tailwind CSS |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Drizzle ORM, better-sqlite3 |
| AI runtimes | Claude Code, Codex, Qwen Code, Kun, Ollama, headless Local Job API |
| Package Manager | bun |

## File Naming

- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## Important Files

- `electron.vite.config.ts` - Build config (main/preload/renderer entries)
- `src/main/lib/db/schema/index.ts` - Drizzle schema (source of truth)
- `src/main/lib/db/index.ts` - DB initialization + auto-migrate
- `src/renderer/features/agents/atoms/index.ts` - Agent UI state atoms
- `src/renderer/features/agents/main/active-chat.tsx` - Main chat component
- `src/main/lib/trpc/routers/claude.ts` - Claude Agent SDK integration

## Debugging First Install Issues

When testing auth flows or behavior for new users, you need to simulate a fresh install:

```bash
# 1. Clear all app data (auth, database, settings)
rm -rf ~/Library/Application\ Support/Agent\ Code\ for\ Me\ Dev/

# 2. Reset macOS protocol handler registration (if testing deep links)
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user

# 3. Clear app preferences if present
defaults delete io.github.lupanpan1030.locus.dev 2>/dev/null || true
defaults delete io.github.lupanpan1030.locus 2>/dev/null || true
defaults delete io.github.lupanpan1030.agentcodeforme.dev 2>/dev/null || true
defaults delete io.github.lupanpan1030.agentcodeforme 2>/dev/null || true

# 4. Run in dev mode with clean state
bun run dev
```

**Common First-Install Bugs:**
- **OAuth deep link not working**: macOS Launch Services may not immediately recognize protocol handlers on first app launch. User may need to click "Sign in" again after the first attempt.
- **Folder dialog not appearing**: Window focus timing issues on first launch. Fixed by ensuring window focus before showing `dialog.showOpenDialog()`.

**Dev vs Production App:**
- Dev mode uses `locus-dev://` protocol and accepts legacy `agent-code-for-me-dev://` links
- Production uses `locus://` protocol and accepts legacy `agent-code-for-me://` links
- Dev mode keeps the existing userData compatibility path (`~/Library/Application Support/Agent Code for Me Dev/`)
- Production keeps the existing userData compatibility path (`~/Library/Application Support/Agent Code for Me/`)
- This prevents conflicts between dev and production installs

## Releasing a New Version

### Prerequisites for Notarization

- Apple signing identity configured through `APPLE_IDENTITY`
- Optional keychain profile for manual notarization, for example `locus-notarize`
- Create with: `xcrun notarytool store-credentials "locus-notarize" --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`

### Release Commands

```bash
# Full local release build
bun run release

# Or step by step:
bun run build              # Compile TypeScript
bun run package:mac        # Build macOS app artifacts
bun run dist:manifest      # Generate fallback latest-mac.yml metadata
```

### Bump Version Before Release

```bash
npm version patch --no-git-tag-version
```

### After Release Script Completes

1. If signing/notarizing, submit and check notarization with your configured keychain profile.
2. Staple DMGs: `cd release && xcrun stapler staple *.dmg`
3. Publish signed artifacts through GitHub Releases/electron-builder publish metadata when using Auto Update.
4. Update GitHub release notes if publishing a GitHub release.

### Update Artifacts

| File | Purpose |
|------|---------|
| `latest-mac.yml` | Manifest for arm64 auto-updates / fallback metadata |
| `latest-mac-x64.yml` | Manifest for Intel auto-updates / fallback metadata |
| `*{version}-arm64-mac.zip` | Auto-update payload (arm64) |
| `*{version}-mac.zip` | Auto-update payload (Intel) |
| `*{version}-arm64.dmg` | Manual download (arm64) |
| `*{version}.dmg` | Manual download (Intel) |

### Auto-Update Flow

1. Auto Update uses this fork's GitHub Releases feed through `electron-updater`.
2. Packaged macOS apps and Windows NSIS installs check on startup and when the window regains focus (with 1 min cooldown).
3. Development, Linux, and Windows portable builds show manual GitHub Releases fallback behavior.
4. If the feed version is newer than `package.json`'s app version, Settings > About shows an update-available state.
5. User clicks Download → downloads the update in background.
6. User clicks "Restart to install" → installs update and restarts.

### Signing Boundary

Automatic update production readiness depends on signing. macOS builds need Developer ID signing plus notarization/stapling, and Windows NSIS builds should be code signed. Unsigned GitHub Release artifacts are internal test builds only and must be labeled that way.

## Current Status

Locus is a multi-runtime desktop workbench. Core shipped areas include Drizzle auto-migrations, project/chat/sub-chat persistence, worktree isolation with setup trust decisions, Claude and Codex desktop runtimes, experimental Qwen/Kun runtime gates, Ollama fallback, provider profiles, MCP registry/auth surfaces, app agents, and headless Local Job API jobs/schedules.

## Debug Mode

When debugging runtime issues in the renderer or main process, use the structured debug logging system. This avoids asking the user to manually copy-paste console output.

**Start the server:**
```bash
bun packages/debug/src/server.ts &
```

**Instrument renderer code** (no import needed, fails silently):
```js
fetch('http://localhost:7799/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag:'TAG',msg:'MESSAGE',data:{},ts:Date.now()})}).catch(()=>{});
```

**Read logs:** Read `.debug/logs.ndjson` - each line is a JSON object with `tag`, `msg`, `data`, `ts`.

**Clear logs:** `curl -X DELETE http://localhost:7799/logs`

**Workflow:** Hypothesize → instrument → user reproduces → read logs → fix with evidence → verify → remove instrumentation.

See `packages/debug/INSTRUCTIONS.md` for the full protocol.
