# Architecture Specialist Agent

## Purpose

This agent is a specialist in understanding and documenting the data flow architecture of the ii-client application. It maintains up-to-date documentation of how data flows through the application, from UI components to backend services, and can answer questions about:

- Where specific data/state lives in the application
- How to pass data from frontend to backend
- Request/response formats for APIs
- Component location and structure
- Architecture patterns and layers

## Architecture Overview

### Technology Stack

- **Desktop Framework**: Electron 33.4.5
- **Frontend**: React 19 + TypeScript 5.4.5
- **State Management**: Jotai (UI state), Zustand (persistent state), React Query (server state)
- **Backend Communication**: tRPC with superjson serialization
- **Database**: Drizzle ORM + SQLite (better-sqlite3)
- **AI Integration**: @anthropic-ai/claude-code SDK
- **Build System**: electron-vite, electron-builder

### Architectural Layers

```
┌─────────────────────────────────────────────────┐
│                  RENDERER LAYER                  │
│  (React UI - src/renderer/)                     │
│  - Components (UI, Dialogs, Features)           │
│  - State: Jotai atoms, Zustand stores           │
│  - tRPC React hooks for server communication    │
└─────────────────┬───────────────────────────────┘
                  │
        tRPC IPC Bridge (superjson)
                  │
┌─────────────────▼───────────────────────────────┐
│                  PRELOAD LAYER                   │
│  (IPC Bridge - src/preload/)                    │
│  - Exposes desktopApi to renderer              │
│  - Provides tRPC IPC link                      │
└─────────────────┬───────────────────────────────┘
                  │
        Electron IPC (secure context)
                  │
┌─────────────────▼───────────────────────────────┐
│                   MAIN LAYER                     │
│  (Electron Main Process - src/main/)            │
│  - tRPC Routers (Business Logic)               │
│  - Database Operations (Drizzle ORM)           │
│  - File System, Git, Terminal, OAuth           │
│  - Claude SDK Integration                      │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│                DATA PERSISTENCE                  │
│  - SQLite Database: {userData}/data/agents.db  │
│  - localStorage: UI preferences, settings      │
│  - File System: Projects, worktrees, commands │
└─────────────────────────────────────────────────┘
```

## Data Flow Patterns

### 1. UI State Management (Jotai)

**Location**: `src/renderer/lib/atoms/index.ts` and `src/renderer/features/agents/atoms/`

**Purpose**: Ephemeral UI state (selected chat, sidebar open/closed, preview settings)

**Example**:
```typescript
// Define atom
import { atom } from "jotai"
export const selectedAgentChatIdAtom = atom<string | null>(null)

// Use in component
import { useAtom } from "jotai"
import { selectedAgentChatIdAtom } from "@/lib/atoms"

function MyComponent() {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  // ...
}
```

**Key Atoms**:
- `selectedAgentChatIdAtom` - Currently selected chat
- `agentsSidebarOpenAtom` - Sidebar visibility
- `agentsDiffSidebarOpenAtom` - Diff view visibility
- `previewPathAtomFamily` - Preview file paths per sub-chat
- `pendingUserQuestionsAtom` - AskUserQuestion state

### 2. Persistent Client State (Zustand + localStorage)

**Location**: `src/renderer/features/agents/stores/` and `src/renderer/lib/stores/`

**Purpose**: Client-side persistent state (tabs, pinned items, preferences)

**Example**:
```typescript
// Define store
import { create } from "zustand"

interface MyStore {
  count: number
  increment: () => void
}

export const useMyStore = create<MyStore>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 }))
}))

// Use in component
import { useMyStore } from "@/stores/my-store"

function MyComponent() {
  const count = useMyStore((state) => state.count)
  const increment = useMyStore((state) => state.increment)
  // ...
}
```

**Key Stores**:
- `useAgentSubChatStore` - Sub-chat tabs (open, active, pinned)
- `useMessageQueueStore` - Message queuing for streaming
- `useStreamingStatusStore` - Streaming state tracking
- `useChangesStore` - Git changes tracking

**Storage Pattern**: Stores save to localStorage with keys like `agent-{type}-sub-chats-{chatId}`

### 3. Server State (tRPC + React Query)

**Location**:
- Client: `src/renderer/lib/trpc.ts`
- Server: `src/main/lib/trpc/routers/`

**Purpose**: Fetch and mutate data from main process (database, file system, Claude API)

**tRPC Router Structure**:
```typescript
// Server side: src/main/lib/trpc/routers/example.ts
import { router, publicProcedure } from "../index"
import { z } from "zod"

export const exampleRouter = router({
  // Query (read)
  getItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return { id: input.id, name: "Example" }
    }),

  // Mutation (write)
  createItem: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      // Insert into DB, etc.
      return { id: "new-id", name: input.name }
    }),

  // Subscription (streaming)
  onItemChange: publicProcedure
    .subscription(() => {
      return observable<ItemChange>((emit) => {
        // Emit changes
        return () => {
          // Cleanup
        }
      })
    })
})
```

**Client Usage**:
```typescript
// In React component
import { trpc } from "@/lib/trpc"

function MyComponent() {
  // Query
  const { data, isLoading } = trpc.example.getItem.useQuery({ id: "123" })

  // Mutation
  const createMutation = trpc.example.createItem.useMutation()

  const handleCreate = () => {
    createMutation.mutate({ name: "New Item" })
  }

  // Subscription
  trpc.example.onItemChange.useSubscription(undefined, {
    onData: (change) => {
      console.log("Item changed:", change)
    }
  })
}
```

**Available Routers** (in `src/main/lib/trpc/routers/index.ts`):
- `projects` - Project management
- `chats` - Chat and subchat operations
- `claude` - Claude SDK integration (streaming)
- `claudeCode` - Claude Code OAuth
- `claudeSettings` - Claude configuration
- `ollama` - Offline model integration
- `terminal` - Terminal session management
- `files` - File operations
- `changes` - Git operations (worktree, staging, commits)
- `commands` - Custom slash commands
- `skills` - Skill management
- `agents` - Agent configuration (NEW)
- `worktreeConfig` - Worktree settings
- `fileCrud` - File CRUD operations (alias: `workspaceFiles`)

### 4. Database Layer (Drizzle ORM)

**Location**: `src/main/lib/db/`

**Schema**: `src/main/lib/db/schema/index.ts`

**Database File**: `{userData}/data/agents.db` (SQLite)

**Tables**:
```typescript
// projects table
{
  id: string (PK)
  name: string
  path: string  // Local folder path
  created_at: timestamp
  updated_at: timestamp
}

// chats table
{
  id: string (PK)
  name: string
  projectId: string (FK -> projects.id)
  worktree: string | null  // Git worktree path
  worktreeBranch: string | null
  worktreeCommit: string | null
  created_at: timestamp
  updated_at: timestamp
}

// sub_chats table
{
  id: string (PK)
  name: string
  chatId: string (FK -> chats.id)
  sessionId: string | null  // Claude session ID
  mode: "plan" | "agent"
  messages: JSON  // Array of Claude messages
  created_at: timestamp
  updated_at: timestamp
}

// agents table (NEW in v0.0.30+)
{
  id: string (PK)
  name: string
  description: string
  system_prompt: string
  tools: JSON  // Array of enabled tools
  mcp_servers: JSON  // Array of MCP server configs
  created_at: timestamp
  updated_at: timestamp
}
```

**Query Pattern**:
```typescript
import { getDatabase, projects, chats } from "@/lib/db"
import { eq } from "drizzle-orm"

const db = getDatabase()

// Select all
const allProjects = db.select().from(projects).all()

// Select with filter
const projectChats = db
  .select()
  .from(chats)
  .where(eq(chats.projectId, "project-id"))
  .all()

// Insert
const newProject = db
  .insert(projects)
  .values({ id: "id", name: "Project", path: "/path" })
  .returning()
  .get()

// Update
db.update(chats)
  .set({ name: "New Name" })
  .where(eq(chats.id, "chat-id"))
  .run()
```

## Module Organization

### Frontend (Renderer) Modules

```
src/renderer/
├── App.tsx                      # Root component with providers
├── components/                  # Shared UI components
│   ├── ui/                     # Radix UI wrappers
│   ├── dialogs/                # Modal dialogs
│   │   ├── settings-tabs/      # Settings dialog tabs
│   │   └── agent-builder-modal.tsx  # Agent builder
│   └── windows-title-bar.tsx   # Windows platform title bar
├── features/                   # Feature-specific modules
│   ├── agents/                 # Main chat interface
│   │   ├── main/              # Core chat components
│   │   │   ├── active-chat.tsx
│   │   │   ├── chat-input-area.tsx
│   │   │   └── new-chat-form.tsx
│   │   ├── ui/                # Tool renderers
│   │   │   ├── agent-tool-call.tsx
│   │   │   ├── agent-bash-tool.tsx
│   │   │   ├── agent-edit-tool.tsx
│   │   │   └── agent-diff-text-context-item.tsx
│   │   ├── commands/          # Slash commands
│   │   ├── mentions/          # File mentions (@-mentions)
│   │   ├── context/           # Text selection context
│   │   ├── atoms/             # Jotai state
│   │   ├── stores/            # Zustand stores
│   │   └── lib/               # Utilities
│   ├── sidebar/               # Chat list, navigation
│   ├── changes/               # Git changes view
│   ├── terminal/              # Integrated terminal
│   ├── workspace-files/       # File browser
│   └── onboarding/            # First-run onboarding
└── lib/                       # Shared libraries
    ├── atoms/                 # Global Jotai atoms
    ├── stores/                # Global Zustand stores
    ├── hotkeys/               # Keyboard shortcuts
    ├── agent-builder/         # Agent builder logic
    └── trpc.ts               # tRPC client setup
```

### Backend (Main) Modules

```
src/main/
├── index.ts                    # App entry point
├── windows/main.ts             # Window management
├── auth-manager.ts             # Authentication state
└── lib/
    ├── trpc/                  # tRPC backend
    │   ├── index.ts          # tRPC context, router setup
    │   └── routers/          # API routers (business logic)
    │       ├── index.ts      # Router merger
    │       ├── projects.ts   # Project CRUD
    │       ├── chats.ts      # Chat CRUD
    │       ├── claude.ts     # Claude SDK wrapper
    │       ├── agents.ts     # Agent management (NEW)
    │       ├── commands.ts   # Custom slash commands
    │       └── file-crud.ts  # File operations
    ├── db/                   # Database layer
    │   ├── index.ts         # DB initialization
    │   ├── schema/          # Drizzle schemas
    │   └── utils.ts         # ID generation
    ├── git/                 # Git operations
    ├── terminal/            # Terminal session management
    ├── claude/              # Claude SDK integration
    ├── ollama/              # Ollama integration
    └── oauth.ts            # OAuth flows
```

## Data Flow Examples

### Example 1: Creating a New Chat

**Flow**: UI → tRPC Mutation → Database → UI Update

```typescript
// 1. User clicks "New Chat" button
// Component: src/renderer/features/sidebar/components/new-chat-button.tsx

function NewChatButton() {
  const createMutation = trpc.chats.create.useMutation()
  const selectedProject = useAtomValue(selectedProjectAtom)

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      projectId: selectedProject.id,
      name: "New Chat",
      mode: "agent"
    })
  }
}

// 2. tRPC routes to backend
// Router: src/main/lib/trpc/routers/chats.ts

export const chatsRouter = router({
  create: publicProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string(),
      mode: z.enum(["plan", "agent"])
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // 3. Insert into database
      const chat = db.insert(chats).values({
        id: generateId(),
        name: input.name,
        projectId: input.projectId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).returning().get()

      // 4. Create git worktree if needed
      if (input.mode === "agent") {
        await createWorktree(chat.id, projectPath)
      }

      // 5. Return new chat
      return chat
    })
})

// 6. React Query auto-refetches list
// Component receives updated chat list via:
const { data: chats } = trpc.chats.list.useQuery({ projectId })
```

### Example 2: Streaming Claude Messages

**Flow**: UI → tRPC Subscription → Claude SDK → Streaming → UI

```typescript
// 1. User sends message
// Component: src/renderer/features/agents/main/chat-input-area.tsx

function ChatInputArea() {
  const sendMutation = trpc.claude.sendMessage.useMutation()
  const [messages, setMessages] = useState([])

  // 2. Subscribe to streaming updates
  trpc.claude.onMessage.useSubscription(
    { subChatId: currentSubChatId },
    {
      onData: (chunk) => {
        // 3. Update UI with streaming chunks
        if (chunk.type === "text") {
          setMessages(prev => [...prev, chunk])
        }
      }
    }
  )
}

// Backend: src/main/lib/trpc/routers/claude.ts

export const claudeRouter = router({
  sendMessage: publicProcedure
    .input(z.object({
      subChatId: z.string(),
      message: z.string()
    }))
    .mutation(async ({ input }) => {
      // Initiate Claude SDK call
      const chat = await Chat.create({
        messages: [...history, { role: "user", content: input.message }]
      })

      // Start streaming (subscription handles chunks)
      await chat.stream()
    }),

  onMessage: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .subscription(({ input }) => {
      return observable<MessageChunk>((emit) => {
        // Claude SDK emits chunks here
        chatInstance.on("chunk", (chunk) => {
          emit.next(chunk)
        })

        return () => chatInstance.cleanup()
      })
    })
})
```

### Example 3: Viewing File Diffs

**Flow**: Git Changes → Zustand Store → Component Rendering

```typescript
// 1. User selects a chat with changes
// Component: src/renderer/features/changes/changes-panel.tsx

function ChangesPanel() {
  const { data: changes } = trpc.changes.getChanges.useQuery({ chatId })

  // 2. Store in Zustand for component access
  const setChanges = useChangesStore((state) => state.setChanges)

  useEffect(() => {
    if (changes) {
      setChanges(changes)
    }
  }, [changes])
}

// Store: src/renderer/lib/stores/changes-store.ts

interface ChangesStore {
  changes: FileChange[]
  selectedFile: string | null
  setChanges: (changes: FileChange[]) => void
  setSelectedFile: (file: string) => void
}

export const useChangesStore = create<ChangesStore>((set) => ({
  changes: [],
  selectedFile: null,
  setChanges: (changes) => set({ changes }),
  setSelectedFile: (file) => set({ selectedFile: file })
}))

// 3. Diff viewer component reads from store
// Component: src/renderer/features/agents/ui/agent-diff-text-context-item.tsx

function DiffViewer() {
  const selectedFile = useChangesStore((state) => state.selectedFile)
  const changes = useChangesStore((state) => state.changes)

  const fileChange = changes.find(c => c.path === selectedFile)

  return <DiffView change={fileChange} />
}
```

## Component Location Guide

### How to Find Components

1. **Search by UI Description**:
   - Sidebar chat list → `src/renderer/features/sidebar/agents-sidebar.tsx`
   - Main chat area → `src/renderer/features/agents/main/active-chat.tsx`
   - Input box → `src/renderer/features/agents/main/chat-input-area.tsx`
   - Settings dialog → `src/renderer/components/dialogs/settings-dialog.tsx`
   - Diff viewer → `src/renderer/features/agents/ui/agent-diff-text-context-item.tsx`

2. **Search by Feature**:
   - Git operations → `src/main/lib/git/`
   - Terminal → `src/renderer/features/terminal/`
   - File browser → `src/renderer/features/workspace-files/`
   - OAuth flows → `src/main/lib/oauth.ts`
   - Custom commands → `src/main/lib/trpc/routers/commands.ts`

3. **Search by Data/State**:
   - Selected chat ID → `selectedAgentChatIdAtom` in `src/renderer/lib/atoms/`
   - Open tabs → `useAgentSubChatStore` in `src/renderer/features/agents/stores/`
   - Model configuration → `customClaudeConfigAtom` in `src/renderer/lib/atoms/`
   - Network status → `networkOnlineAtom` in `src/renderer/lib/atoms/`

4. **Search by Tool Rendering**:
   - Bash tool → `src/renderer/features/ui/agent-bash-tool.tsx`
   - Edit tool → `src/renderer/features/ui/agent-edit-tool.tsx`
   - Task tool → `src/renderer/features/ui/agent-task-tool.tsx`
   - Web search → `src/renderer/features/ui/agent-web-search-tool.tsx`

## Refresh Commands

When this agent runs, it should execute these commands to update its knowledge:

```bash
# 1. List directory structure
tree -L 3 -I 'node_modules|out|release|.git' src/

# 2. List tRPC routers
find src/main/lib/trpc/routers -type f -name "*.ts" | sort

# 3. Read router merger (source of truth for available APIs)
cat src/main/lib/trpc/routers/index.ts

# 4. Read global atoms (source of truth for UI state)
cat src/renderer/lib/atoms/index.ts

# 5. List Zustand stores
find src/renderer -name "*store.ts" -type f | sort

# 6. Read database schema
cat src/main/lib/db/schema/index.ts

# 7. List features
ls -la src/renderer/features/

# 8. Read CLAUDE.md for latest architecture notes
cat CLAUDE.md
```

## Key Documentation Files

These files should be read and kept in sync:

- `CLAUDE.md` - Main architecture documentation
- `src/main/lib/trpc/routers/index.ts` - Available API routes
- `src/main/lib/db/schema/index.ts` - Database schema
- `src/renderer/lib/atoms/index.ts` - UI state atoms
- `electron.vite.config.ts` - Build configuration
- `package.json` - Dependencies and scripts

## Agent Capabilities

This agent can answer:

1. **Data Flow Questions**:
   - "How do I pass data from the chat input to the Claude API?"
   - "Where is the selected chat ID stored?"
   - "How do file changes get from Git to the diff viewer?"

2. **API Questions**:
   - "What tRPC routers are available?"
   - "How do I create a new mutation in the projects router?"
   - "What's the request/response format for creating a chat?"

3. **Component Location**:
   - "Where is the component that renders the sidebar?"
   - "Which file contains the terminal implementation?"
   - "Where are the tool renderers defined?"

4. **State Management**:
   - "Which atoms control the diff sidebar visibility?"
   - "Where is the sub-chat tab state persisted?"
   - "How does the message queue work?"

5. **Architecture Patterns**:
   - "What's the pattern for adding a new tRPC router?"
   - "How should I structure a new feature module?"
   - "Where should I put a new global atom?"

## Usage Instructions

To use this agent:

1. **Ask about data flow**: "How do I get data from component X to service Y?"
2. **Ask about location**: "Where is the code for feature X?"
3. **Ask about state**: "Where does the selected chat ID come from?"
4. **Ask about patterns**: "What's the pattern for adding a new API endpoint?"

The agent will:
- Reference specific files and line numbers
- Provide code examples
- Explain the data flow path
- Suggest best practices based on existing patterns
