# Internal Branch Feature Analysis & Reimplementation Plan

**Date**: 2026-02-01
**Branches**: `internal` vs `main`
**Strategy**: Selective feature reimplementation from main base

---

## Executive Summary

The `internal` branch contains **15 major feature categories** across 144 modified files (+31,790 / -2,614 lines). After thorough analysis, we've identified **10 features worth reimplementing** and **2 obsolete features to discard**.

**Recommended Approach**: Create feature branch from `main` and reimplement in 5 phases over ~5 weeks.

---

## Complete Feature Inventory

### 🟢 High Priority Features (Must Have)

#### 1. **MCP Integration System**
- **Files**: `mcp-auth.ts` (537 lines), `ii-mcp-servers.ts` (215 lines), `claude-config.ts` (204 lines)
- **What it does**:
  - Manages 7 Python-based MCP servers on ports 11021-11027
  - Fetches tools from HTTP/SSE and stdio transports
  - Auto-refreshes OAuth tokens before sessions
  - Reads/writes `~/.claude.json` configuration
  - Resolves worktree paths to original project paths
- **Key functionality**:
  - `fetchMcpTools()` - HTTP/SSE transport
  - `fetchMcpToolsStdio()` - stdio transport with proper environment
  - `ensureMcpTokensFresh()` - Token refresh with 5-min buffer
  - `startMcpOAuth()` - Initiate OAuth flows
  - `getProjectMcpServers()` - Load servers from config
  - Spawn Python servers with `uvx`, `uv run`, or system Python
- **Dependencies**:
  - `@modelcontextprotocol/sdk` for client
  - OAuth infrastructure
  - Python environment (.venv or system)
- **Effort**: 🔴 Large (security-critical, multi-transport)

#### 2. **OAuth & Credential Infrastructure**
- **Files**: `oauth.ts` (906 lines), `oauth-server.ts` (431 lines), `oauth-utils.ts` (111 lines), `credential-manager.ts` (821 lines)
- **What it does**:
  - PKCE OAuth flows for Google, Slack, Microsoft
  - Local OAuth callback server (ports 21300-21399)
  - Unified credential storage with encryption
  - Automatic token refresh
  - Fallback handling (OAuth → bearer)
- **Key classes**:
  - `CraftOAuth` - Main OAuth handler
  - `SourceCredentialManager` - Credential CRUD
- **Security features**:
  - PKCE code challenge generation (S256)
  - Electron safeStorage for encryption
  - 5-minute expiry buffer
  - State parameter validation
- **Effort**: 🔴 Large (security-critical)

#### 3. **System Prompt Extensions**
- **Files**: `system-prompt-extensions.ts` (117 lines)
- **What it does**:
  - Injects workspace context into system prompts
  - Teaches Claude about workspace file operations
  - Enforces full path usage in file mentions
  - Provides examples and best practices
- **Critical requirement**: Always use `.ii/workspaces/{chatId}/filename.md` format
- **Effort**: 🟢 Small (single file)

---

### 🟡 Medium Priority Features (Should Have)

#### 4. **Agent Management System**
- **Files**: `agents.ts` router (25 lines), agent DB schema, `agent-utils.ts` (152 lines)
- **What it does**:
  - CRUD for agent markdown files
  - Parse agent.md with gray-matter (YAML frontmatter)
  - Sync filesystem ↔ database
  - Track creation/modification via chat IDs
  - Support user-level (`~/.claude/agents/`) and project-level (`.claude/agents/`)
- **Database schema**:
```typescript
{
  id, name, description, prompt,
  tools: JSON,             // Allowed tools
  disallowedTools: JSON,   // Disallowed tools
  model,                   // "sonnet" | "opus" | "haiku" | "inherit"
  source,                  // "user" | "project"
  projectId, filePath,
  createdViaChat: boolean,
  creationChatIds: JSON,
  modificationChatIds: JSON
}
```
- **Key changes from internal**:
  - **Auto-registration**: `buildAllAgentsOption()` loads ALL agents for auto-invocation
  - Agents invoked based on descriptions, not just @mentions
  - Sync to DB happens in background (fire-and-forget)
- **Effort**: 🟡 Medium (backend + file parsing)

#### 5. **Agent Builder UI**
- **Files**: `agent-builder-modal.tsx` (38 lines wrapper), `chat-pane.tsx` (162 lines), `document-pane.tsx` (153 lines), `response-parser.ts` (176 lines)
- **What it does**:
  - Dual-pane modal: chat (left) + live preview (right)
  - Conversational agent creation
  - Phase-based workflow: discovery → formalize → research → generate
  - Response parser extracts structured data from assistant responses
- **Phases**:
  1. **Discovery**: Ask user about agent purpose
  2. **Formalization**: Extract requirements list
  3. **Research**: Gather context about codebase
  4. **Generation**: Generate agent.md file
- **Integration**: Reuses chat streaming infrastructure with special `agent-builder` mode
- **Effort**: 🟡 Medium (UI + parser logic)

#### 6. **Model Profiles**
- **Files**: `model-profiles.ts` router (235 lines), DB schema
- **What it does**:
  - Custom model configs for OpenAI-compatible APIs
  - Support multiple models per profile
  - Offline mode flag (Ollama integration)
  - Bulk upsert from localStorage
- **Database schema**:
```typescript
{
  id, name, description,
  config: JSON,        // { model, token, baseUrl }
  models: JSON,        // Array of model names
  isOffline: boolean,
  createdAt, updatedAt
}
```
- **Operations**: `list`, `get`, `create`, `update`, `delete`, `bulkUpsert`, `importFromLocalStorage`
- **Effort**: 🟢 Small (CRUD router)

#### 7. **Workspace File System**
- **Files**: `file-crud.ts` (200 lines), `workspace-files/` directory (5 components)
- **What it does**:
  - File tree viewer for `.ii/workspaces/{chatId}/`
  - CRUD operations with security validation
  - Document viewer (markdown/text)
  - Code viewer with syntax highlighting
- **Backend (`file-crud.ts`)**:
  - `listFiles` - Build recursive file tree
  - `readFile` - Read with path validation
  - Security: Directory traversal prevention
- **Frontend components**:
  - `FileTree` - Folder/file navigation
  - `DocumentViewer` - Markdown/text rendering
  - `CodeViewer` - Syntax highlighting
  - `useOpenFile` - Hook for file actions
  - `file-types.ts` - File type detection
- **Effort**: 🟡 Medium (backend + UI)

---

### 🔵 Low Priority Features (Nice to Have)

#### 8. **Ollama Enhancements**
- **Files**: `ollama.ts` router (238 lines)
- **What it does**:
  - Check Ollama status + internet connectivity
  - Generate chat names (2-5 words)
  - Generate commit messages (conventional format)
  - **Input refinement**: Enhance vague prompts with context
- **Input refinement logic**:
  1. Identify vague terms ("this", "the file", etc.)
  2. Find relevant files from workspace + chat history
  3. Replace vague terms with specific file mentions
  4. Add @file mentions for context
- **Operations**: `getStatus`, `isOfflineModeAvailable`, `getModels`, `generateChatName`, `generateCommitMessage`, `refineInput`
- **Effort**: 🟢 Small (API wrapper)

#### 9. **Feedback System**
- **Files**: `feedback.ts` router (78 lines), `feedback-dialog.tsx` (235 lines), `feedback-list-dialog.tsx` (287 lines), DB schema
- **What it does**:
  - In-app feedback collection
  - Screenshot upload support
  - List/resolve feedback entries
- **Database schema**:
```typescript
{
  id, type, priority, description,
  screenshots: JSON,     // File paths
  resolved: boolean,
  createdAt, updatedAt
}
```
- **Types**: bug, feature, enhancement, idea, usability, other
- **Priorities**: low, medium, high, critical
- **Effort**: 🟢 Small (CRUD + dialog)

---

### ❌ Features to Discard (Obsolete)

#### 1. **Tasks Feature**
- **Files**: `tasks/tasks-page.tsx`, `tasks/atoms.ts`
- **Why obsolete**:
  - Client-side only (Jotai atoms)
  - Not persisted to database
  - Too trivial (name + description)
  - Better alternatives exist (TodoWrite tool)
- **Action**: Don't migrate

#### 2. **Multi-Account Support**
- **Files**: DB schema changes (removed `anthropicAccounts`, `anthropicSettings`)
- **Why obsolete**: Main branch likely has different auth approach
- **Action**: Check main's auth system before deciding

---

## Critical Behavioral Changes from Internal

### 1. **Claude Router Changes**

#### Fork Detection & Message Replay
```typescript
// NEW: Detect forked chats (no sessionId + has history + not Ollama)
const isForkedChat = !existingSessionId && existingMessages.length > 0
const needsMessageReplay = isForkedChat && !isUsingOllama

if (needsMessageReplay) {
  console.log(`[claude] Forked chat detected - replaying ${existingMessages.length} messages`)
  prompt = createReplayMessages(existingMessages, userMessage, input.images)
}
```

#### Auto-Agent Registration
```typescript
// OLD (internal): Only register mentioned agents
const agentsOption = await buildAgentsOption(agentMentions, input.cwd)

// NEW (internal): Register ALL agents for auto-invocation
const agentsOption = await buildAllAgentsOption(input.cwd)
console.log(`[claude] Registered ${Object.keys(agentsOption).length} agents with SDK`)

// Fire-and-forget sync to database
syncAgentsToDatabase(input.cwd).catch(err => {
  console.error('[claude] Failed to sync agents to database:', err)
})
```

#### Agent Mode Types Expanded
```typescript
// OLD: "plan" | "agent"
// NEW: "plan" | "agent" | "agent-builder" | "read-only" | "ask"
mode: z.enum(["plan", "agent", "agent-builder", "read-only", "ask"])
```

#### Timeout Handling for Tool Approvals
```typescript
// NEW: Clear timeouts when aborting sessions
for (const [toolUseId, pending] of pendingToolApprovals) {
  if (pending.timeoutId) {
    clearTimeout(pending.timeoutId)
  }
  pending.resolve({ approved: false, message })
}
```

#### Offline Fallback Moved Earlier
```typescript
// CRITICAL: Check offline status BEFORE fork detection
// This ensures isUsingOllama is defined before fork logic runs
const offlineResult = await checkOfflineFallback(input.customConfig, claudeCodeToken)
const isUsingOllama = offlineResult.isUsingOllama

// Now fork detection can safely use isUsingOllama
const needsMessageReplay = isForkedChat && !isUsingOllama
```

#### Message Part Conversion
```typescript
// NEW: Convert stored messages to SDK format
function convertStoredPartToSDKContent(part: any) {
  // Text parts: direct conversion
  if (part.type === "text" && part.text) {
    return [{ type: "text", text: part.text }]
  }

  // Tool results: convert to SDK format (skip tool calls)
  if (part.type?.startsWith("tool-") && part.state === "result" && part.toolCallId) {
    return [{
      type: "tool_result",
      tool_use_id: part.toolCallId,
      content: typeof part.result === "string" ? part.result : JSON.stringify(part.result || {})
    }]
  }

  return [] // Skip tool calls, system messages, etc.
}
```

### 2. **Chat Input Area Changes**

#### Input Refinement (Ollama)
```typescript
// NEW: State for input refinement
const [isRefining, setIsRefining] = useState(false)
const [previousInput, setPreviousInput] = useState<string | null>(null)
const refineInputMutation = trpc.ollama.refineInput.useMutation()

// Triggered before sending message to enhance vague prompts
```

#### Model Selector Enhancement
```typescript
// OLD: Only Claude models
const models = CLAUDE_MODELS

// NEW: Claude + Custom + Ollama models
const availableModels = useAllModels()
```

#### Mode Toggle Hiding
```typescript
// NEW: Support hiding mode toggle (for agent builder)
interface ChatInputAreaProps {
  // ... existing props
  hideModeToggle?: boolean
}
```

#### Insert Text Event System
```typescript
// NEW: Global event for inserting text into input
export const INSERT_TEXT_EVENT = "insert-text-event"
export interface InsertTextPayload { text: string }

// Listener in ChatInputArea
useEffect(() => {
  const handleInsert = (e: CustomEvent<InsertTextPayload>) => {
    // Insert text into input area
  }
  window.addEventListener(INSERT_TEXT_EVENT, handleInsert)
  return () => window.removeEventListener(INSERT_TEXT_EVENT, handleInsert)
}, [])
```

### 3. **Agent Utils Changes**

#### Build All Agents Option
```typescript
// NEW: Load ALL agents for auto-invocation (not just mentioned ones)
export async function buildAllAgentsOption(cwd: string): Promise<Record<string, any>> {
  const userAgents = await listAgentsFromDir(path.join(os.homedir(), ".claude", "agents"))
  const projectAgents = await listAgentsFromDir(path.join(cwd, ".claude", "agents"))

  const allAgents = [...userAgents, ...projectAgents]

  // Return SDK-compatible agents object
  return Object.fromEntries(
    allAgents.map(agent => [agent.name, { /* agent config */ }])
  )
}
```

#### Sync Agents to Database
```typescript
// NEW: Background sync of filesystem agents to database
export async function syncAgentsToDatabase(cwd: string): Promise<void> {
  const userAgents = await listAgentsFromDir(path.join(os.homedir(), ".claude", "agents"))
  const projectAgents = await listAgentsFromDir(path.join(cwd, ".claude", "agents"))

  // Upsert to database
  for (const agent of [...userAgents, ...projectAgents]) {
    await db.insert(agents).values({ /* ... */ }).onConflictDoUpdate({ /* ... */ })
  }
}
```

---

## Database Schema Changes

### New Tables Required

```sql
-- 1. Agents table
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  prompt TEXT NOT NULL,
  tools TEXT,                -- JSON array of allowed tools
  disallowed_tools TEXT,     -- JSON array of disallowed tools
  model TEXT,                -- "sonnet" | "opus" | "haiku" | "inherit"
  source TEXT NOT NULL,      -- "user" | "project"
  project_id TEXT,
  file_path TEXT NOT NULL,   -- Actual .md file location
  created_via_chat INTEGER NOT NULL DEFAULT 0,
  creation_chat_ids TEXT NOT NULL DEFAULT '[]',     -- JSON array
  modification_chat_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_agents_source ON agents(source);

-- 2. Model Profiles table
CREATE TABLE model_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config TEXT NOT NULL,      -- JSON: { model, token, baseUrl }
  models TEXT NOT NULL,      -- JSON array of model names
  is_offline INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_model_profiles_is_offline ON model_profiles(is_offline);

-- 3. Feedback table
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- bug, feature, enhancement, idea, usability, other
  priority TEXT NOT NULL,    -- low, medium, high, critical
  description TEXT NOT NULL,
  screenshots TEXT,          -- JSON array of file paths
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);
```

### Modified Tables

```sql
-- Add to sub_chats
ALTER TABLE sub_chats ADD COLUMN is_saved_chat_state INTEGER NOT NULL DEFAULT 0;
```

---

## Implementation Phases

### **Phase 1: Foundation (Week 1)**
**Goal**: Authentication infrastructure and database setup

**Tasks**:
1. Create feature branch from main: `git checkout -b feature/mcp-integration main`
2. Database migrations:
   - `drizzle/0006_add_agents.sql`
   - `drizzle/0007_add_model_profiles.sql`
   - `drizzle/0008_add_feedback.sql`
   - Add `isSavedChatState` to `subChats`
3. OAuth infrastructure:
   - Copy `oauth.ts`, `oauth-server.ts`, `oauth-utils.ts`
   - Copy `credential-manager.ts`
   - Write tests for PKCE generation
   - Test OAuth callback server (ports 21300-21399)
4. Verify build: `bun run build && bun run dev`

**Deliverable**: Working OAuth flows with mock provider

---

### **Phase 2: MCP Integration (Week 2)**
**Goal**: Enable MCP server support

**Tasks**:
1. MCP auth system:
   - Copy `mcp-auth.ts`
   - Implement token refresh logic
   - Test HTTP/SSE transport
   - Test stdio transport with environment
2. Claude config management:
   - Copy `claude-config.ts`
   - Test `~/.claude.json` read/write
   - Test worktree path resolution
3. ii MCP servers:
   - Copy `ii-mcp-servers.ts`
   - Set up Python environment
   - Test server spawn/kill lifecycle
   - Test port allocation (11021-11027)
4. Integration with Claude router:
   - Update `claude.ts` for MCP tool fetching
   - Add `ensureMcpTokensFresh` before sessions
   - Test end-to-end tool invocation

**Deliverable**: MCP servers providing tools to Claude sessions

---

### **Phase 3: File System & Prompts (Week 3)**
**Goal**: Workspace files and context injection

**Tasks**:
1. System prompt extensions:
   - Copy `system-prompt-extensions.ts`
   - Test workspace context injection
   - Verify file mention prompts
2. File CRUD backend:
   - Copy `file-crud.ts` router
   - Test `listFiles`, `readFile` endpoints
   - Add path security tests (traversal prevention)
3. Workspace files UI:
   - Copy `workspace-files/` directory
   - Test file tree component
   - Test document viewer
   - Test code viewer with syntax highlighting
4. Integration:
   - Add to tRPC router registry
   - Test file operations from chat
   - Verify @file mentions work

**Deliverable**: Workspace-scoped file system accessible from chat

---

### **Phase 4: Agent Management (Week 4)**
**Goal**: Custom agents with auto-invocation

**Tasks**:
1. Agent backend:
   - Copy `agents.ts` router
   - Copy `agent-utils.ts`
   - Test agent file parsing (gray-matter)
   - Test CRUD operations
   - Test sync from filesystem to database
2. Agent builder UI:
   - Copy `agent-builder-modal.tsx`
   - Copy `response-parser.ts`
   - Test dual-pane modal
   - Test phase detection (discovery → generate)
3. Claude router integration:
   - Update to use `buildAllAgentsOption()`
   - Add agent auto-invocation
   - Test agent sync to database
4. Testing:
   - Create agent via builder
   - Invoke agent from chat
   - Verify agent tools/prompts work

**Deliverable**: Functional agent builder + auto-invocation

---

### **Phase 5: Polish & Extras (Week 5)**
**Goal**: Model profiles, Ollama, feedback

**Tasks**:
1. Model profiles:
   - Copy `model-profiles.ts` router
   - Test CRUD operations
   - Test custom API endpoints
   - Update model selector UI
2. Ollama enhancements:
   - Copy enhanced `ollama.ts` router
   - Test chat name generation
   - Test commit message generation
   - Test input refinement
3. Feedback system:
   - Copy `feedback.ts` router
   - Copy feedback dialogs
   - Test screenshot upload
   - Test list/resolution
4. Final testing:
   - Integration tests for all features
   - Security audit (OAuth, file paths)
   - Cross-platform testing
   - Performance testing

**Deliverable**: Production-ready feature set

---

## File Migration Checklist

### Backend (Main Process)

#### OAuth & Auth
- [ ] `src/main/lib/oauth.ts` (906 lines)
- [ ] `src/main/lib/oauth-server.ts` (431 lines)
- [ ] `src/main/lib/oauth-utils.ts` (111 lines)
- [ ] `src/main/lib/credential-manager.ts` (821 lines)

#### MCP Integration
- [ ] `src/main/lib/mcp-auth.ts` (537 lines)
- [ ] `src/main/lib/ii-mcp-servers.ts` (215 lines)
- [ ] `src/main/lib/claude-config.ts` (204 lines)

#### System & Prompts
- [ ] `src/main/lib/system-prompt-extensions.ts` (117 lines)

#### Database
- [ ] `src/main/lib/db/schema/feedback.ts` (42 lines)
- [ ] `src/main/lib/db/schema/index.ts` (agents, modelProfiles tables)

#### tRPC Routers
- [ ] `src/main/lib/trpc/routers/agents.ts` (25 lines)
- [ ] `src/main/lib/trpc/routers/agent-utils.ts` (152 lines)
- [ ] `src/main/lib/trpc/routers/file-crud.ts` (200 lines)
- [ ] `src/main/lib/trpc/routers/model-profiles.ts` (235 lines)
- [ ] `src/main/lib/trpc/routers/ollama.ts` (238 lines - enhanced)
- [ ] `src/main/lib/trpc/routers/feedback.ts` (78 lines)
- [ ] `src/main/lib/trpc/routers/index.ts` (router registration)

#### Claude Router Modifications
- [ ] `src/main/lib/trpc/routers/claude.ts`:
  - [ ] Fork detection logic
  - [ ] Message replay conversion
  - [ ] Auto-agent registration
  - [ ] Agent mode enum expansion
  - [ ] Timeout handling
  - [ ] Offline fallback repositioning

### Frontend (Renderer Process)

#### Dialogs
- [ ] `src/renderer/components/dialogs/agent-builder-modal.tsx` (38 lines)
- [ ] `src/renderer/components/dialogs/feedback-dialog.tsx` (235 lines)
- [ ] `src/renderer/components/dialogs/feedback-list-dialog.tsx` (287 lines)

#### Agent Builder
- [ ] `src/renderer/components/dialogs/agent-builder/chat-pane.tsx` (162 lines)
- [ ] `src/renderer/components/dialogs/agent-builder/document-pane.tsx` (153 lines)
- [ ] `src/renderer/components/dialogs/agent-builder/hooks/use-agent-builder-chat.ts` (204 lines)

#### Workspace Files
- [ ] `src/renderer/features/workspace-files/components/file-tree.tsx` (215 lines)
- [ ] `src/renderer/features/workspace-files/components/document-viewer.tsx` (308 lines)
- [ ] `src/renderer/features/workspace-files/components/code-viewer.tsx` (100 lines)
- [ ] `src/renderer/features/workspace-files/hooks/use-open-file.ts` (56 lines)
- [ ] `src/renderer/features/workspace-files/utils/file-types.ts` (113 lines)
- [ ] `src/renderer/features/workspace-files/index.ts` (4 lines)

#### Agent Builder Support
- [ ] `src/renderer/lib/agent-builder/response-parser.ts` (176 lines)
- [ ] `src/renderer/lib/atoms/agent-builder.ts` (70 lines)

#### UI Enhancements
- [ ] `src/renderer/features/agents/ui/model-selector.tsx` (120 lines)
- [ ] `src/renderer/features/agents/lib/models.ts` (useAllModels)
- [ ] `src/renderer/features/agents/main/chat-input-area.tsx`:
  - [ ] Input refinement state/mutation
  - [ ] Model selector integration
  - [ ] Mode toggle hiding
  - [ ] Insert text event listener

#### Atoms & State
- [ ] `src/renderer/lib/atoms/documents.ts` (174 lines)
- [ ] `src/renderer/lib/atoms/right-sidebar.ts` (24 lines)
- [ ] `src/renderer/features/agents/atoms/index.ts` (agentModeAtom)

---

## Testing Strategy

### Unit Tests
- [ ] OAuth PKCE generation (code verifier, challenge)
- [ ] Credential encryption/decryption (safeStorage)
- [ ] Path security validation (file-crud traversal prevention)
- [ ] Agent file parsing (gray-matter YAML frontmatter)
- [ ] Message replay conversion (stored → SDK format)
- [ ] Response parser (agent builder phases)

### Integration Tests
- [ ] OAuth flow with mock provider
- [ ] MCP server lifecycle (spawn/kill/status)
- [ ] MCP tool fetching (HTTP/SSE and stdio)
- [ ] Token refresh flow (before expiry)
- [ ] Agent CRUD operations (filesystem ↔ DB sync)
- [ ] Workspace file operations (list/read/write)
- [ ] Input refinement with context

### E2E Tests
- [ ] Create agent via builder
- [ ] Invoke agent from chat (auto and @mention)
- [ ] Add custom model profile
- [ ] Use workspace files in chat (@file mentions)
- [ ] Submit feedback with screenshots
- [ ] Fork chat at message
- [ ] Ollama offline mode

### Security Tests
- [ ] Path traversal attacks (file-crud)
- [ ] OAuth state parameter tampering
- [ ] Token expiry edge cases
- [ ] File read outside project boundary
- [ ] PKCE challenge replay attack

---

## Risks & Mitigations

### Risk 1: OAuth Security Vulnerabilities
**Impact**: High (credential theft, unauthorized access)
**Mitigation**:
- Security audit of PKCE implementation
- Test with multiple providers (Google, Slack, Microsoft)
- Use Electron safeStorage for all tokens
- Validate state parameter on callback
- Implement request timeout (30s)

### Risk 2: MCP Server Stability
**Impact**: Medium (tool failures, process crashes)
**Mitigation**:
- Process monitoring and health checks
- Auto-restart on crash (max 3 retries)
- Port conflict detection (11021-11027)
- Graceful degradation if servers fail
- Detailed logging for debugging

### Risk 3: Path Traversal Attacks
**Impact**: High (read/write outside project)
**Mitigation**:
- Strict path validation in file-crud
- Test with malicious paths (`../../../etc/passwd`)
- Use `path.resolve` and validate against project root
- Reject absolute paths outside project
- Log all file access attempts

### Risk 4: Database Migration Conflicts
**Impact**: Medium (data loss, schema inconsistency)
**Mitigation**:
- Review main branch migrations before numbering
- Coordinate migration sequence (0006, 0007, 0008)
- Test rollback scenarios
- Backup database before migration
- Use transactions for multi-step changes

### Risk 5: Breaking Changes in Main
**Impact**: High (merge conflicts, feature regression)
**Mitigation**:
- Frequent rebases from main (daily)
- Incremental PRs (one phase at a time)
- Continuous integration testing
- Feature flags for experimental features
- Maintain compatibility layer if needed

### Risk 6: Python Environment Issues
**Impact**: Medium (MCP servers fail to start)
**Mitigation**:
- Test with uvx, uv run, and system Python
- Detect .venv automatically
- Fallback to system Python if needed
- Clear error messages for missing dependencies
- Document Python setup requirements

---

## Success Criteria

### Must Have ✅
- [ ] MCP servers start and register tools successfully
- [ ] OAuth flows complete without errors
- [ ] Agents can be created via builder
- [ ] Workspace files accessible in chat with @mentions
- [ ] Custom model profiles work with API calls
- [ ] No regressions in existing features
- [ ] All tests passing (unit, integration, E2E)
- [ ] Security audit passed

### Should Have 🟡
- [ ] Input refinement improves vague prompts
- [ ] Feedback system collects user input
- [ ] Ollama integration for offline ops
- [ ] Agent auto-invocation based on descriptions
- [ ] Token refresh happens automatically
- [ ] File operations are fast (<100ms)

### Nice to Have 🔵
- [ ] MCP server auto-restart on crash
- [ ] Workspace file search/grep
- [ ] Agent versioning and history
- [ ] Model profile templates
- [ ] Feedback analytics dashboard

### Quality Gates 🚦
- [ ] Code coverage >80%
- [ ] No critical security vulnerabilities
- [ ] Cross-platform compatibility (macOS, Linux, Windows)
- [ ] Documentation updated (CLAUDE.md, README)
- [ ] Code review approved (2+ reviewers)
- [ ] Performance benchmarks met (<2s startup)

---

## Next Steps

1. **Review & Approve** this plan with team
2. **Create feature branch** from main:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/mcp-integration
   ```
3. **Start Phase 1** (Foundation):
   - Set up database migrations
   - Implement OAuth infrastructure
   - Write initial tests
4. **Daily standups** to track progress and blockers
5. **Incremental PRs** for each phase (not one giant merge)

---

## Open Questions

1. **Priority**: Which features are highest priority for users?
   - Suggested: MCP integration > Agent builder > Model profiles
2. **Timeline**: Are 5-week phases realistic given team size?
   - Adjust based on available resources
3. **Main branch**: What auth changes exist in main that conflict with OAuth?
   - Need to review main's auth-manager.ts
4. **Python environment**: Where should MCP servers expect Python?
   - Prefer .venv, fallback to system Python
5. **Deployment**: Beta users first or straight to production?
   - Recommend beta for MCP features (complex)

---

**Last Updated**: 2026-02-01
**Status**: Awaiting team review
**Estimated Effort**: 5 weeks (1 dev full-time)
**Lines of Code**: ~5,000 new, ~2,000 modified
