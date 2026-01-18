# Observer vs 21st Agents Feature Comparison

## Executive Summary

**Observer** is a terminal-first AI workspace with comprehensive artifact tracking, while **21st Agents** is an Electron desktop app focused on git-isolated chat sessions. This document compares both architectures and highlights what 21st Agents can adopt from Observer.

---

## 🎯 Core Architecture Comparison

| Feature | Observer | 21st Agents | Winner |
|---------|----------|-------------|--------|
| **Framework** | Tauri (Rust) + Vanilla JS | Electron + React 19 | Tie |
| **Backend** | Python (asyncio) | Node.js (tRPC) | Tie |
| **Database** | SQLite (dual-layer: memory + disk) | SQLite (Drizzle ORM) | Tie |
| **State Management** | Vanilla JS (manual) | Jotai + Zustand + React Query | **21st** |
| **Communication** | JSON-RPC 2.0 | tRPC (type-safe) | **21st** |
| **Bundle Size** | Smaller (Rust) | Larger (Electron) | **Observer** |

---

## 🔔 **NOTIFICATIONS** (Critical Gap for 21st Agents)

### Observer's Approach ✅

**1. Real-Time Artifact Notifications**
- Backend sends `artifact_added` notification immediately when Claude uses a tool
- Frontend listens via JSON-RPC and updates UI in real-time
- No polling required

```javascript
// Observer: Real-time notification pattern
window.rpc.onNotification('artifact_added', (data) => {
    const { session_id, artifact } = data;
    // Find session and add artifact
    for (const date in sessions) {
        const sessionList = sessions[date];
        const session = sessionList.find(s => s.session_id === session_id);
        if (session) {
            if (!session.artifacts) session.artifacts = [];
            session.artifacts.push(artifact);
            session.artifact_count = session.artifacts.length;
            render(); // Update UI immediately
            return;
        }
    }
});
```

**2. Text-to-Speech (TTS) for Agent Events**
- Uses Web Speech API for voice notifications
- Priority fallback chain for consistent voice across platforms
- Tunable parameters for "computer" effect

```javascript
// Observer: TTS implementation
const synth = window.speechSynthesis;
let voice = voices.find(v => v.name === 'Fred') ||           // macOS robot
            voices.find(v => v.name === 'Google US English') ||
            voices.find(v => v.name === 'Samantha') ||       // Siri-like
            voices[0];

function speak(text, interrupt = true) {
    if (interrupt) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.pitch = 1.0;
    utterance.rate = 1.1;  // 10% faster
    utterance.volume = 0.8;
    synth.speak(utterance);
}

// Usage
speak("Task completed successfully");
```

### 21st Agents' Current State ❌

**Notification Status: STUB ONLY**

```typescript
// 21st Agents: src/renderer/features/agents/hooks/use-desktop-notifications.ts
export function useDesktopNotifications() {
  return {
    showNotification: (_title: string, _body: string) => {
      // Desktop notification - TODO: implement real notifications
    },
    notifyAgentComplete: (_chatName: string) => {
      // Agent complete notification - TODO: implement real notifications
    },
    requestPermission: () => Promise.resolve('granted' as NotificationPermission),
  }
}
```

**Critical Issues:**
1. ❌ No Electron native notifications implemented
2. ❌ No TTS for agent completion
3. ❌ No real-time updates when Claude executes tools
4. ❌ User has no idea what's happening during long-running agent sessions

### **RECOMMENDATION FOR 21ST AGENTS** 🎯

**Implement Electron Native Notifications + TTS**

```typescript
// src/preload/index.ts - Add to desktopApi
desktopApi: {
  // ... existing methods
  notification: {
    show: (title: string, body: string, options?: NotificationOptions) =>
      ipcRenderer.invoke('notification:show', { title, body, options }),
    speak: (text: string, interrupt?: boolean) =>
      ipcRenderer.invoke('notification:speak', { text, interrupt }),
  }
}

// src/main/index.ts - IPC handlers
ipcMain.handle('notification:show', (_, { title, body, options }) => {
  const notification = new Notification({
    title,
    body,
    icon: path.join(__dirname, '../../resources/icon.png'),
    ...options
  });
  notification.show();
});

ipcMain.handle('notification:speak', (_, { text, interrupt }) => {
  // Use say command on macOS, or Windows Speech API
  if (process.platform === 'darwin') {
    exec(`say "${text}"`);
  }
  // TODO: Windows/Linux TTS
});

// src/renderer/features/agents/hooks/use-desktop-notifications.ts
export function useDesktopNotifications() {
  return {
    showNotification: (title: string, body: string) => {
      window.desktopApi.notification.show(title, body);
    },
    notifyAgentComplete: (chatName: string) => {
      window.desktopApi.notification.show(
        'Agent Complete',
        `${chatName} has finished working.`,
      );
      window.desktopApi.notification.speak('Task complete', true);
    },
    notifyToolExecuted: (toolName: string, summary: string) => {
      window.desktopApi.notification.show(
        `Tool: ${toolName}`,
        summary,
      );
    },
  }
}
```

**Use terminal-notifier per CLAUDE.md instructions:**
```typescript
// When task completes
exec('terminal-notifier -message "Completed: [task]" -title "Claude Code"');
```

---

## 💾 **PERSISTENCE & CHAT HISTORY** (Where Both Apps Need Work)

### Observer's Approach ✅

**1. Dual-Layer Artifact Storage**

**Architecture:**
```
Memory Layer (Fast)          Disk Layer (Persistent)
self._sessions               ~/.observer/artifacts/{session_id}/
self._artifacts              ├─ _session.json
                             ├─ artifact_001.json
                             ├─ artifact_002.json
                             └─ ...
```

**Why It's Brilliant:**
- Active sessions stay in memory for instant access
- All artifacts automatically persist to disk on creation
- Lazy-loading from disk for historical sessions
- **Survives app restarts** - full history always available

```python
# Observer: artifact_manager.py
class ArtifactManager:
    def __init__(self, artifact_dir: str = "~/.observer/artifacts"):
        self._sessions: Dict[str, Dict] = {}  # In-memory
        self._artifacts: Dict[str, Dict] = {}  # In-memory
        self.artifact_dir = os.path.expanduser(artifact_dir)

    def add_artifact(self, session_id: str, tool_name: str, tool_input: dict) -> str:
        # 1. Create artifact in memory
        artifact = {
            "id": artifact_id,
            "session_id": session_id,
            "type": tool_name.lower(),
            "timestamp": now.isoformat() + "Z",
            "input": tool_input,
        }
        self._artifacts[artifact_id] = artifact

        # 2. Persist to disk IMMEDIATELY
        self._persist_artifact(session_id, artifact_id, artifact)

        # 3. Notify frontend (real-time update)
        if hasattr(self, 'notification_callback'):
            self.notification_callback('artifact_added', {
                'session_id': session_id,
                'artifact': artifact
            })

        return artifact_id

    def _persist_artifact(self, session_id: str, artifact_id: str, artifact: dict):
        """Write artifact to disk immediately"""
        session_dir = os.path.join(self.artifact_dir, session_id)
        os.makedirs(session_dir, exist_ok=True)
        artifact_path = os.path.join(session_dir, f"{artifact_id}.json")
        with open(artifact_path, 'w') as f:
            json.dump(artifact, f, indent=2)
```

**2. Hierarchical Lazy-Loading UI**

```
┌─ Artifact History ──────────────────────────────┐
│ [Search box]                                    │
│                                                 │
│ ▼ Today (3 sessions, 45 artifacts)             │
│   ▼ Session abc123 (15 artifacts)              │
│     ✓ 📖 Read: src/main.py                     │
│     ✓ ✏️ Edit: src/config.py                   │
│     ⋯ 🖥️ Bash: npm install                     │
│   ▶ Session def456 (20 artifacts)              │
│ ▶ Yesterday (2 sessions, 30 artifacts)         │
└─────────────────────────────────────────────────┘
```

**Why It's Brilliant:**
- Only loads dates on panel open (fast initial render)
- Fetches sessions only when date expanded
- Fetches artifacts only when session expanded
- **Can browse thousands of historical artifacts without performance issues**

### 21st Agents' Current State ⚠️

**Chat Persistence: GOOD**

```typescript
// 21st Agents: Database schema (src/main/lib/db/schema/index.ts)
export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  name: text("name"),
  projectId: text("project_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  // Git isolation per chat
  worktreePath: text("worktree_path"),
  branch: text("branch"),
  baseBranch: text("base_branch"),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
})

export const subChats = sqliteTable("sub_chats", {
  id: text("id").primaryKey(),
  name: text("name"),
  chatId: text("chat_id").notNull(),
  sessionId: text("session_id"),  // Claude SDK session for resume
  streamId: text("stream_id"),
  mode: text("mode").default("agent"),
  messages: text("messages").default("[]"),  // JSON array
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
})
```

**Artifact Tracking: MISSING ❌**

**Critical Gaps:**
1. ❌ **No tool execution history** - Can't see what Claude did in past sessions
2. ❌ **No artifact panel** - Can't browse historical Read/Write/Bash operations
3. ❌ **No search across past tool calls** - Can't find "when did Claude read package.json?"
4. ❌ Messages stored as JSON blob - not queryable by tool type

**What Gets Saved:** ✅
- Chat messages (user + assistant) → `subChats.messages`
- Session IDs for resuming → `subChats.sessionId`
- Git worktree per chat → `chats.worktreePath`

**What DOESN'T Get Saved:** ❌
- Individual tool executions (Read, Write, Bash, etc.)
- File paths touched per session
- Command history per chat
- Tool results (stdout, file contents, etc.)

### **RECOMMENDATION FOR 21ST AGENTS** 🎯

**Add Observer-Style Artifact Tracking**

**Option 1: New Artifacts Table (Recommended)**

```typescript
// src/main/lib/db/schema/index.ts
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  subChatId: text("sub_chat_id").notNull().references(() => subChats.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "read", "write", "bash", "edit", etc.
  timestamp: integer("timestamp", { mode: "timestamp" }).$defaultFn(() => new Date()),
  // Tool-specific metadata (extracted for quick queries)
  filePath: text("file_path"),     // For Read/Write/Edit
  command: text("command"),        // For Bash
  pattern: text("pattern"),        // For Grep/Glob
  toolName: text("tool_name").notNull(),
  // Full data (JSON)
  input: text("input").notNull(),   // JSON blob
  output: text("output"),           // JSON blob
  isError: integer("is_error", { mode: "boolean" }).default(false),
})

// Relations
export const artifactsRelations = relations(artifacts, ({ one }) => ({
  subChat: one(subChats, {
    fields: [artifacts.subChatId],
    references: [subChats.id],
  }),
}))
```

**Option 2: Extract from Existing Messages (Quick Win)**

Since 21st Agents already stores messages with tool parts, you can:

```typescript
// src/main/lib/trpc/routers/artifacts.ts (NEW FILE)
export const artifactsRouter = router({
  // Extract artifacts from existing messages
  list: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const subChat = db.select().from(subChats).where(eq(subChats.id, input.subChatId)).get()
      if (!subChat) return { artifacts: [] }

      const messages = JSON.parse(subChat.messages || "[]")
      const artifacts = []

      // Extract all tool parts from assistant messages
      for (const msg of messages) {
        if (msg.role !== 'assistant') continue
        for (const part of msg.parts || []) {
          if (part.type?.startsWith('tool-')) {
            artifacts.push({
              id: part.toolCallId,
              type: part.type.replace('tool-', '').toLowerCase(),
              toolName: part.toolName,
              input: part.input,
              result: part.result,
              state: part.state,
            })
          }
        }
      }

      return { artifacts }
    }),

  // Search across all artifacts
  search: publicProcedure
    .input(z.object({ query: z.string() }))
    .query(({ input }) => {
      // Search file paths, commands, patterns
      const db = getDatabase()
      const allSubChats = db.select().from(subChats).all()
      const results = []

      for (const subChat of allSubChats) {
        const messages = JSON.parse(subChat.messages || "[]")
        for (const msg of messages) {
          if (msg.role !== 'assistant') continue
          for (const part of msg.parts || []) {
            if (part.type?.startsWith('tool-')) {
              // Search in file_path, command, pattern, etc.
              const searchableText = JSON.stringify(part.input).toLowerCase()
              if (searchableText.includes(input.query.toLowerCase())) {
                results.push({
                  subChatId: subChat.id,
                  chatId: subChat.chatId,
                  artifact: part,
                })
              }
            }
          }
        }
      }

      return { results }
    }),
})
```

**UI Component (React):**

```typescript
// src/renderer/features/artifacts/artifact-panel.tsx
import { trpc } from '@/lib/trpc'

export function ArtifactPanel({ subChatId }: { subChatId: string }) {
  const { data } = trpc.artifacts.list.useQuery({ subChatId })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  return (
    <div className="artifact-panel">
      <h3>Tool History</h3>
      {data?.artifacts.map((artifact) => (
        <div key={artifact.id} className="artifact-item">
          <button onClick={() => toggleExpand(artifact.id)}>
            {getToolIcon(artifact.toolName)} {artifact.toolName}
            {' - '}
            {getArtifactSummary(artifact)}
          </button>
          {expanded.has(artifact.id) && (
            <pre>{JSON.stringify(artifact, null, 2)}</pre>
          )}
        </div>
      ))}
    </div>
  )
}

function getToolIcon(toolName: string): string {
  const icons = {
    'Read': '📖',
    'Write': '📝',
    'Edit': '✏️',
    'Bash': '🖥️',
    'Grep': '🔎',
    'Glob': '🔍',
  }
  return icons[toolName] || '🔧'
}

function getArtifactSummary(artifact: any): string {
  switch (artifact.type) {
    case 'read':
    case 'write':
    case 'edit':
      return artifact.input?.file_path || 'unknown'
    case 'bash':
      const cmd = artifact.input?.command || ''
      return cmd.length > 40 ? cmd.substring(0, 40) + '...' : cmd
    case 'grep':
    case 'glob':
      return artifact.input?.pattern || ''
    default:
      return ''
  }
}
```

---

## 🎨 **UI/UX Patterns**

### Observer's Innovations

**1. Progressive Disclosure for Large Outputs**

```javascript
// Observer: Truncate long outputs, show "View All" button
const MAX_LINES = 100;

if (lines.length > MAX_LINES) {
    displayContent = lines.slice(0, MAX_LINES).join('\n');
    truncated = true;
}

if (truncated) {
    const moreInfo = document.createElement('div');
    moreInfo.innerHTML = `<span>Showing ${MAX_LINES} of ${lines.length} lines</span>
        <button class="show-all-btn">Show all</button>`;
    moreInfo.querySelector('.show-all-btn').onclick = () => {
        // Replace with full content
        body.appendChild(createCodeBlock(fullContent));
    };
    body.appendChild(moreInfo);
}
```

**Why It Matters:**
- Prevents UI freeze on 10k+ line outputs
- Fast initial render
- User controls detail level

**2. Tool-Specific Rendering**

Each tool gets custom UI:
- **Read**: Syntax-highlighted file with line numbers
- **Edit**: Before/after diff view
- **Bash**: Terminal-style output with ANSI colors
- **Grep**: Highlighted matches with context

### 21st Agents' Strengths

**1. Advanced Diff Viewing**
- Uses `@git-diff-view/react` + Shiki (NOT Monaco)
- Split/Unified view modes
- Virtualization for large diffs
- Auto-collapse when >10 files

**2. Modern React State**
- Jotai for UI atoms (selected chat, sidebar open)
- Zustand for sub-chat tabs (persisted to localStorage)
- React Query for server state via tRPC

**3. Git Worktree Isolation**
- Each chat gets its own git worktree
- Prevents cross-contamination
- PR tracking per chat

---

## ⚡ **PERFORMANCE COMPARISON**

| Metric | Observer | 21st Agents | Notes |
|--------|----------|-------------|-------|
| **Startup Time** | Faster (Tauri/Rust) | Slower (Electron) | Electron bundles Chromium |
| **Memory Usage** | Lower | Higher | Electron overhead ~100-200MB |
| **Bundle Size** | ~30-50MB | ~150-200MB | Electron + node_modules |
| **UI Responsiveness** | Vanilla JS (fast) | React (fast with optimization) | Observer has edge on raw speed |
| **Database Queries** | Manual SQL | Drizzle ORM (type-safe) | 21st has better DX |
| **IPC Speed** | JSON-RPC (fast) | tRPC (fast + type-safe) | Tie |

**User's Observation:**
> "this reacts kind of slow, to tell you the truth"

**Likely Causes in 21st Agents:**
1. Large React component trees re-rendering
2. No virtualization for chat messages (only for diffs)
3. JSON parsing on every message update
4. Lack of memoization in message rendering

**Fixes:**
```typescript
// Use React.memo for message components
const MessageItem = React.memo(({ message }: { message: Message }) => {
  // ... render logic
}, (prev, next) => prev.message.id === next.message.id)

// Use virtual scrolling for chat messages
import { useVirtualizer } from '@tanstack/react-virtual'

// Debounce expensive operations
import { useDebouncedValue } from '@/hooks/use-debounced-value'
```

---

## 📝 **CHAT RECOVERY COMPARISON**

### Observer

**Q: Can you always get back to your chats?**
✅ **YES**
- All sessions stored in `~/.observer/artifacts/{session_id}/`
- Sessions organized by date
- Full artifact history per session
- Searchable across all sessions

**Q: Can you always get back to changes?**
✅ **YES**
- Every tool execution saved as artifact
- File contents captured in Read/Write artifacts
- Command history in Bash artifacts
- Diffs in Edit artifacts

### 21st Agents

**Q: Can you always get back to your chats?**
✅ **YES**
- All chats stored in SQLite: `{userData}/data/agents.db`
- Messages persisted in `subChats.messages` (JSON)
- Can resume sessions via `sessionId`
- Archive feature for old chats

**Q: Can you always get back to changes?**
⚠️ **PARTIAL**
- ✅ Chat messages saved (including tool parts)
- ✅ Git worktree preserves file changes
- ❌ No dedicated tool history panel
- ❌ No search across historical tool executions
- ❌ Can't easily answer "what files did Claude touch in this chat?"

**Git Advantage:**
Since 21st Agents uses git worktrees, you CAN recover changes via git:
```bash
cd /path/to/worktree
git log --stat        # See all file changes
git diff main         # See all changes vs main
```

But this requires manual git commands - no UI for it.

---

## 🏆 **FEATURE SCORECARD**

| Feature | Observer | 21st Agents | Recommendation |
|---------|----------|-------------|----------------|
| **Artifact Tracking** | ✅ Full system | ❌ None | 🎯 **ADD TO 21ST** |
| **Real-Time Notifications** | ✅ JSON-RPC | ❌ Stub only | 🎯 **ADD TO 21ST** |
| **TTS Notifications** | ✅ Web Speech API | ❌ None | 🎯 **ADD TO 21ST** |
| **Tool History Panel** | ✅ Lazy-load tree | ❌ None | 🎯 **ADD TO 21ST** |
| **Progressive Disclosure** | ✅ Yes | ⚠️ Partial | 🎯 **IMPROVE 21ST** |
| **Git Isolation** | ❌ None | ✅ Worktrees | 🏅 **21ST WINS** |
| **Type Safety** | ❌ Python/JS | ✅ TypeScript + tRPC | 🏅 **21ST WINS** |
| **Modern UI Framework** | ❌ Vanilla JS | ✅ React 19 | 🏅 **21ST WINS** |
| **Diff Viewing** | ⚠️ Basic | ✅ Advanced (git-diff-view) | 🏅 **21ST WINS** |
| **Session Resume** | ✅ Yes | ✅ Yes | Tie |
| **Search Artifacts** | ✅ Full-text | ❌ None | 🎯 **ADD TO 21ST** |
| **Auto-Migration** | ❌ Manual | ✅ Drizzle auto-migrate | 🏅 **21ST WINS** |

---

## 🎯 **PRIORITY ACTION ITEMS FOR 21ST AGENTS**

### 1. **IMPLEMENT NOTIFICATIONS** (CRITICAL)

**Why:** User can't tell what's happening during long agent sessions

**What to Build:**
- Electron native notifications when tools execute
- TTS on agent completion (using `terminal-notifier` per CLAUDE.md)
- Real-time tool execution updates in UI

**Effort:** 1-2 days

**Files to Create/Modify:**
- `src/preload/index.ts` - Add `notification` API
- `src/main/index.ts` - IPC handlers for notifications
- `src/renderer/features/agents/hooks/use-desktop-notifications.ts` - Real implementation
- `src/renderer/features/agents/main/active-chat.tsx` - Call notifications on tool execution

**Code Snippet:**
```typescript
// src/renderer/features/agents/hooks/use-chat.tsx
// In the chunk handler:
case "tool-output-available":
  // Show notification for completed tool
  const toolPart = findToolPart(chunk.toolCallId)
  if (toolPart) {
    showNotification(
      `Tool: ${toolPart.toolName}`,
      getToolSummary(toolPart),
    )
  }
  break

case "finish":
  // Notify on completion
  notifyAgentComplete(chatName)
  // Use terminal-notifier per CLAUDE.md
  exec('terminal-notifier -message "Completed: Agent task" -title "Claude Code"')
  break
```

---

### 2. **ADD ARTIFACT TRACKING** (HIGH PRIORITY)

**Why:** Can't browse historical tool executions, search past operations

**What to Build:**
- New `artifacts` table (or extract from existing messages)
- Artifact panel component (lazy-load tree like Observer)
- Search across all artifacts

**Effort:** 2-3 days

**Option A: New Table (Better long-term)**
```bash
bun run db:generate  # Generate migration for new artifacts table
bun run db:push      # Apply migration
```

**Option B: Extract from Messages (Quick win)**
- No schema changes needed
- Use tRPC router to parse existing `subChats.messages`
- Build UI panel to display extracted artifacts

---

### 3. **PERFORMANCE OPTIMIZATION** (MEDIUM PRIORITY)

**Why:** User reports "reacts kind of slow"

**What to Optimize:**
- Add virtualization for chat messages (like diffs)
- Memoize message components with `React.memo`
- Debounce search inputs
- Lazy-load old messages (only show recent 50, load more on scroll)

**Effort:** 1-2 days

**Code Snippet:**
```typescript
// src/renderer/features/agents/main/active-chat.tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const rowVirtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 100,
  overscan: 5,
})

// Only render visible messages
{rowVirtualizer.getVirtualItems().map((virtualRow) => {
  const message = messages[virtualRow.index]
  return <MessageItem key={message.id} message={message} />
})}
```

---

### 4. **TOOL HISTORY SIDEBAR** (MEDIUM PRIORITY)

**Why:** Can't easily see "what files did Claude touch?" or "what commands ran?"

**What to Build:**
- New sidebar panel (next to artifact panel)
- Group tools by type (File Operations, Commands, Searches)
- Click to jump to that point in chat

**Effort:** 1-2 days

**UI Mockup:**
```
┌─ Tool History ──────────────────────┐
│ 📁 Files (12)                       │
│   📖 Read: package.json             │
│   ✏️ Edit: src/main.ts              │
│   📝 Write: output.txt              │
│                                     │
│ 🖥️ Commands (5)                     │
│   npm install                       │
│   git status                        │
│                                     │
│ 🔍 Searches (3)                     │
│   Grep: "TODO"                      │
│   Glob: "**/*.ts"                   │
└─────────────────────────────────────┘
```

---

## 💡 **OBSERVER PATTERNS TO ADOPT**

### 1. **Dual-Layer Storage Pattern**

**Use for:** Artifact caching, session history

```typescript
// In-memory for fast queries
private _activeSessions: Map<string, Session> = new Map()

// Disk for persistence
private async persistSession(sessionId: string, data: Session) {
  const sessionPath = path.join(this.artifactsDir, sessionId, '_session.json')
  await fs.writeFile(sessionPath, JSON.stringify(data, null, 2))
}

// Lazy-load from disk
private async loadSession(sessionId: string): Promise<Session | null> {
  if (this._activeSessions.has(sessionId)) {
    return this._activeSessions.get(sessionId)!
  }
  const sessionPath = path.join(this.artifactsDir, sessionId, '_session.json')
  const data = await fs.readFile(sessionPath, 'utf-8')
  return JSON.parse(data)
}
```

### 2. **Real-Time Notification Flow**

**Use for:** Live tool execution updates

```typescript
// Backend: Emit on tool execution
for (const chunk of transform(msg)) {
  if (chunk.type === 'tool-output-available') {
    // Send notification to all connected clients
    broadcastNotification('tool_executed', {
      subChatId: input.subChatId,
      toolName: chunk.toolName,
      toolCallId: chunk.toolCallId,
    })
  }
  emit.next(chunk)
}

// Frontend: Listen for notifications
trpc.claude.onToolExecuted.useSubscription(undefined, {
  onData: (data) => {
    showNotification(`Tool: ${data.toolName}`, 'Completed')
  }
})
```

### 3. **Progressive Disclosure**

**Use for:** Large file contents, long command outputs

```typescript
const MAX_LINES = 100

function renderLargeContent(content: string) {
  const lines = content.split('\n')
  const [truncated, setTruncated] = useState(true)

  const displayContent = truncated
    ? lines.slice(0, MAX_LINES).join('\n')
    : content

  return (
    <>
      <pre>{displayContent}</pre>
      {lines.length > MAX_LINES && truncated && (
        <button onClick={() => setTruncated(false)}>
          Show all ({lines.length} lines)
        </button>
      )}
    </>
  )
}
```

### 4. **Tool-Agnostic Metadata Extraction**

**Use for:** Making artifacts searchable without parsing JSON

```typescript
function extractArtifactMetadata(toolPart: ToolPart): ArtifactMetadata {
  const metadata: ArtifactMetadata = {
    type: toolPart.type.replace('tool-', '').toLowerCase(),
    toolName: toolPart.toolName,
  }

  switch (toolPart.toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      metadata.filePath = toolPart.input?.file_path
      break
    case 'Bash':
      metadata.command = toolPart.input?.command?.substring(0, 100)
      break
    case 'Grep':
    case 'Glob':
      metadata.pattern = toolPart.input?.pattern
      break
  }

  return metadata
}
```

---

## 🚀 **QUICK WINS (Do These First)**

1. **Terminal-Notifier on Completion** (30 mins)
   - Add `exec('terminal-notifier ...')` when agent finishes
   - Per CLAUDE.md instructions

2. **Extract Artifacts from Messages** (2 hours)
   - Add tRPC route to parse existing messages
   - No DB schema changes needed
   - Instant tool history visibility

3. **Memoize Message Components** (1 hour)
   - Wrap `<MessageItem>` in `React.memo`
   - Immediate performance boost

4. **Debounce Search** (30 mins)
   - Add 300ms debounce to search inputs
   - Reduce unnecessary re-renders

---

## 📊 **FINAL VERDICT**

### Observer Strengths
- ✅ **Artifact tracking is world-class**
- ✅ **Real-time notifications work great**
- ✅ **Progressive disclosure handles large outputs well**
- ✅ **TTS adds nice touch for long-running tasks**
- ❌ No git isolation (chats share same workspace)
- ❌ Vanilla JS (harder to maintain than React)

### 21st Agents Strengths
- ✅ **Git worktree isolation is brilliant** (Observer should copy this!)
- ✅ **Type safety with tRPC + TypeScript**
- ✅ **Modern React UI with great state management**
- ✅ **Advanced diff viewing**
- ❌ **No artifact tracking** (critical gap)
- ❌ **No real notifications** (critical gap)
- ❌ Performance issues (user-reported)

### **Hybrid Recommendation** 🎯

**Build "21st Agents v2" with:**
1. Keep: Git worktrees, tRPC, React, TypeScript (your strengths)
2. Add: Artifact tracking from Observer (their strength)
3. Add: Real-time notifications + TTS from Observer (their strength)
4. Add: Progressive disclosure patterns from Observer (their strength)
5. Fix: Performance with virtualization + memoization

**Result:** Best of both worlds
- Enterprise-grade git isolation (21st)
- Industrial-strength artifact tracking (Observer)
- Modern type-safe architecture (21st)
- Real-time user feedback (Observer)

---

## 📚 **APPENDIX: Code Locations**

### Observer Files to Study
- `src/python/artifact_manager.py` - Dual-layer storage
- `src/frontend/components/artifact-panel.js` - Lazy-load tree
- `src/frontend/components/tts.js` - Web Speech API
- `src/frontend/components/sp-terminal/tool-renderers.js` - Tool-specific rendering
- `src/python/sp_manager.py` - Real-time notifications

### 21st Agents Files to Modify
- `src/main/lib/db/schema/index.ts` - Add artifacts table
- `src/renderer/features/agents/hooks/use-desktop-notifications.ts` - Real implementation
- `src/renderer/features/agents/main/active-chat.tsx` - Performance optimizations
- `src/preload/index.ts` - Add notification API
- `src/main/index.ts` - Notification IPC handlers

---

**Last Updated:** 2026-01-17
**Author:** Claude Code Analysis
**Version:** 1.0
