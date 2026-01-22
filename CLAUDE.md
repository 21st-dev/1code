# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**1Code** (formerly 21st Agents) - A local-first Electron desktop app for AI-powered code assistance. Users create chat sessions linked to local project folders, interact with Claude in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, etc.).

**Platforms:** macOS (native), Linux (native), Windows (experimental since v0.0.29)

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
│   ├── windows/main.ts      # Window creation, IPC handlers, platform-specific handling
│   └── lib/
│       ├── db/              # Drizzle + SQLite
│       │   ├── index.ts     # DB init, auto-migrate on startup
│       │   ├── schema/      # Drizzle table definitions
│       │   └── utils.ts     # ID generation
│       ├── trpc/routers/    # tRPC routers
│       │   ├── projects.ts  # Project management
│       │   ├── chats.ts     # Chat and subchat operations
│       │   ├── claude.ts    # Claude SDK integration
│       │   ├── claude-code.ts # Claude Code OAuth
│       │   └── commands.ts  # Custom slash commands (NEW in v0.0.30)
│       ├── git/             # Git operations (worktree, stash, etc.)
│       └── terminal/        # Terminal session management
│
├── preload/                 # IPC bridge (context isolation)
│   └── index.ts             # Exposes desktopApi + tRPC bridge
│
└── renderer/                # React 19 UI
    ├── App.tsx              # Root with providers
    ├── components/
    │   ├── ui/              # Radix UI wrappers (button, dialog, etc.)
    │   ├── dialogs/         # Settings, shortcuts, agents dialogs
    │   │   └── settings-tabs/
    │   │       ├── agents-keyboard-tab.tsx  # NEW: Keyboard shortcuts config
    │   │       └── agents-appearance-tab.tsx
    │   └── windows-title-bar.tsx  # NEW: Windows platform title bar
    ├── features/
    │   ├── agents/          # Main chat interface
    │   │   ├── main/        # active-chat.tsx, new-chat-form.tsx, chat-input-area.tsx
    │   │   ├── ui/          # Tool renderers, preview, diff view
    │   │   │   ├── agent-diff-text-context-item.tsx  # NEW: Text selection from diffs
    │   │   │   └── quick-comment-input.tsx  # NEW: Fast question responses
    │   │   ├── commands/    # Slash commands (/plan, /agent, /clear, custom)
    │   │   ├── mentions/    # File mentions and text selection
    │   │   ├── context/     # Text selection context provider
    │   │   ├── atoms/       # Jotai atoms for agent state
    │   │   └── stores/      # Zustand store for sub-chats
    │   ├── sidebar/         # Chat list, archive, navigation
    │   ├── changes/         # Git changes view with file tracking
    │   └── layout/          # Main layout with resizable panels
    └── lib/
        ├── atoms/           # Global Jotai atoms
        ├── stores/          # Global Zustand stores
        ├── hotkeys/         # NEW: Configurable keyboard shortcuts system
        │   ├── types.ts
        │   ├── shortcut-registry.ts
        │   └── use-hotkey-recorder.ts
        └── trpc.ts          # tRPC client
```

## Database (Drizzle ORM)

**Location:** `{userData}/data/agents.db` (SQLite)

**Schema:** `src/main/lib/db/schema/index.ts`

```typescript
// Three main tables:
projects    → id, name, path (local folder), timestamps
chats       → id, name, projectId, worktree fields, timestamps
sub_chats   → id, name, chatId, sessionId, mode, messages (JSON)
```

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

### Claude Integration
- Dynamic import of `@anthropic-ai/claude-code` SDK
- Two modes: "plan" (read-only) and "agent" (full permissions)
- Session resume via `sessionId` stored in SubChat
- Message streaming via tRPC subscription (`claude.onMessage`)

### Custom Slash Commands (v0.0.30+)

Users can create custom slash commands by placing markdown files in:
- **User-level**: `~/.claude/commands/` (available in all projects)
- **Project-level**: `{projectPath}/.claude/commands/` (project-specific)

**File structure:**
```markdown
---
description: "Brief description shown in autocomplete"
argument-hint: "Optional hint for arguments"
---

Your custom prompt goes here.
Use {{argument}} to reference user-provided arguments.
```

**Namespaces:**
- Organize commands in subdirectories: `git/commit.md` becomes `/git:commit`
- Nested directories create namespace chains: `ops/deploy/staging.md` → `/ops:deploy:staging`

**Example:**
```markdown
---
description: "Write comprehensive tests for this code"
argument-hint: "file path or code selection"
---

Please write comprehensive unit tests for the following code, including:
- Edge cases
- Error handling
- Mock external dependencies

{{argument}}
```

**Implementation:**
- Scanned via `src/main/lib/trpc/routers/commands.ts`
- Frontmatter parsed with `gray-matter`
- Security: Path traversal prevention, filename validation
- Merged with built-in commands in renderer

### Keyboard Shortcuts (v0.0.30+)

Fully customizable keyboard shortcuts system with conflict detection.

**Categories:**
- **General**: Settings, shortcuts panel, sidebar toggle, undo archive
- **Workspaces**: New workspace, search, archive, quick switch
- **Agents**: New chat, search, stop generation, model selector, terminal, diff view, PR creation

**Configuration:**
- Access via Settings → Keyboard tab
- Record new shortcuts with visual feedback
- Conflict detection shows which actions conflict
- Reset individual shortcuts or all to defaults
- Stored in localStorage: `custom-hotkeys-config` key

**Implementation:**
- `src/renderer/lib/hotkeys/shortcut-registry.ts` - Registry of all shortcuts
- `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` - Recording hook
- `src/renderer/lib/hotkeys/types.ts` - Type definitions
- `src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx` - UI

**Storage format:**
```typescript
{
  version: 1,
  bindings: {
    "new-agent": "cmd+shift+n",  // Custom binding
    "stop-generation": null      // Use default
  }
}
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 33.4.5, electron-vite, electron-builder |
| UI | React 19, TypeScript 5.4.5, Tailwind CSS |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Drizzle ORM, better-sqlite3 |
| AI | @anthropic-ai/claude-code |
| Package Manager | bun |

## File Naming

- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## Important Files

### Core
- `electron.vite.config.ts` - Build config (main/preload/renderer entries)
- `src/main/lib/db/schema/index.ts` - Drizzle schema (source of truth)
- `src/main/lib/db/index.ts` - DB initialization + auto-migrate
- `src/main/windows/main.ts` - Window management, platform-specific handling

### tRPC Routers
- `src/main/lib/trpc/routers/claude.ts` - Claude SDK integration
- `src/main/lib/trpc/routers/claude-code.ts` - Claude Code OAuth
- `src/main/lib/trpc/routers/commands.ts` - Custom slash commands (v0.0.30+)
- `src/main/lib/trpc/routers/chats.ts` - Chat and subchat operations

### UI Components
- `src/renderer/features/agents/main/active-chat.tsx` - Main chat component
- `src/renderer/features/agents/main/chat-input-area.tsx` - Input with model selector
- `src/renderer/features/agents/atoms/index.ts` - Agent UI state atoms
- `src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx` - Keyboard shortcuts config

### New Features (v0.0.27+)
- `src/renderer/features/agents/context/text-selection-context.tsx` - Text selection from code blocks
- `src/renderer/features/agents/ui/agent-diff-text-context-item.tsx` - Diff text selection UI
- `src/renderer/lib/hotkeys/shortcut-registry.ts` - Keyboard shortcuts registry
- `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` - Shortcut recording hook

## Debugging First Install Issues

When testing auth flows or behavior for new users, you need to simulate a fresh install:

```bash
# 1. Clear all app data (auth, database, settings)
rm -rf ~/Library/Application\ Support/Agents\ Dev/

# 2. Reset macOS protocol handler registration (if testing deep links)
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user

# 3. Clear app preferences
defaults delete dev.21st.agents.dev  # Dev mode
defaults delete dev.21st.agents      # Production

# 4. Run in dev mode with clean state
cd apps/desktop
bun run dev
```

**Common First-Install Bugs:**
- **OAuth deep link not working**: macOS Launch Services may not immediately recognize protocol handlers on first app launch. User may need to click "Sign in" again after the first attempt.
- **Folder dialog not appearing**: Window focus timing issues on first launch. Fixed by ensuring window focus before showing `dialog.showOpenDialog()`.

**Dev vs Production App:**
- Dev mode uses `twentyfirst-agents-dev://` protocol
- Dev mode uses separate userData path (`~/Library/Application Support/Agents Dev/`)
- This prevents conflicts between dev and production installs

## Releasing a New Version

### Prerequisites for Notarization

- Keychain profile: `21st-notarize`
- Create with: `xcrun notarytool store-credentials "21st-notarize" --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`

### Release Commands

```bash
# Full release (build, sign, submit notarization, upload to CDN)
bun run release

# Or step by step:
bun run build              # Compile TypeScript
bun run package:mac        # Build & sign macOS app
bun run dist:manifest      # Generate latest-mac.yml manifests
./scripts/upload-release-wrangler.sh  # Submit notarization & upload to R2 CDN
```

### Bump Version Before Release

```bash
npm version patch --no-git-tag-version  # 0.0.27 → 0.0.28
```

### After Release Script Completes

1. Wait for notarization (2-5 min): `xcrun notarytool history --keychain-profile "21st-notarize"`
2. Staple DMGs: `cd release && xcrun stapler staple *.dmg`
3. Re-upload stapled DMGs to R2 and GitHub (see RELEASE.md for commands)
4. Update changelog: `gh release edit v0.0.X --notes "..."`
5. **Upload manifests (triggers auto-updates!)** — see RELEASE.md
6. Sync to public: `./scripts/sync-to-public.sh`

### Files Uploaded to CDN

| File | Purpose |
|------|---------|
| `latest-mac.yml` | Manifest for arm64 auto-updates |
| `latest-mac-x64.yml` | Manifest for Intel auto-updates |
| `1Code-{version}-arm64-mac.zip` | Auto-update payload (arm64) |
| `1Code-{version}-mac.zip` | Auto-update payload (Intel) |
| `1Code-{version}-arm64.dmg` | Manual download (arm64) |
| `1Code-{version}.dmg` | Manual download (Intel) |

### Auto-Update Flow

1. App checks `https://cdn.21st.dev/releases/desktop/latest-mac.yml` on startup and when window regains focus (with 1 min cooldown)
2. If version in manifest > current version, shows "Update Available" banner
3. User clicks Download → downloads ZIP in background
4. User clicks "Restart Now" → installs update and restarts

## Current Status

**Stable Features (v0.0.30):**
- ✅ Full Claude Code integration with streaming
- ✅ Git worktree isolation per chat
- ✅ Plan and Agent modes
- ✅ Real-time diff view with text selection
- ✅ Viewed files tracking (GitHub-style)
- ✅ Custom slash commands
- ✅ Configurable keyboard shortcuts
- ✅ Model selector (Opus 4.5, Sonnet 4.5, etc.)
- ✅ Integrated terminal
- ✅ Auto-updates system
- ✅ macOS, Linux, Windows support

**Recent Additions (v0.0.27-0.0.30):**
- Text selection from code blocks and diffs
- Custom slash commands with namespaces
- Keyboard shortcuts configuration
- Extended thinking toggle
- Windows platform support
- Desktop notifications

**Known Limitations:**
- Windows support is experimental (some features may not work perfectly)
- Auto-updates require manual upload of manifests to CDN
