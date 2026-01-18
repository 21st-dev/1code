# Claude Integration Architecture

## Overview

21st Agents is an Electron desktop application that provides a local-first interface to Claude Code. This document explains how the application integrates with Claude, manages the Claude binary, and orchestrates communication between the UI and Claude's execution environment.

## Why Download the Claude Binary?

The application downloads and bundles the native Claude Code binary for several critical reasons:

### 1. **Offline-First Architecture**
- Users can run Claude Code without requiring an internet connection to fetch the binary each time
- Binary is bundled with the application for immediate availability
- No dependency on external CDN availability during execution

### 2. **Version Control & Consistency**
- Specific Claude Code version (default: 2.1.5) ensures consistent behavior across all users
- Prevents "works on my machine" issues from version mismatches
- Controlled upgrade path for new Claude Code releases

### 3. **Security & Integrity**
- SHA256 checksum verification ensures binary hasn't been tampered with
- Downloaded from official Google Cloud Storage: `storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819`
- Eliminates risk of runtime binary substitution attacks

### 4. **Cross-Platform Support**
- Pre-built binaries for all supported platforms:
  - `darwin-arm64` (Apple Silicon)
  - `darwin-x64` (Intel Mac)
  - `linux-arm64` (ARM Linux)
  - `linux-x64` (x86_64 Linux)
  - `win32-x64` (Windows)
- Users don't need to build or install Claude Code separately

### 5. **Isolation & Control**
- Application controls exact binary location and execution environment
- No conflicts with user's global Claude Code installation
- Full control over environment variables, working directory, and configuration

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Renderer Process                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  React UI (active-chat.tsx)                               │  │
│  │  - User types message                                     │  │
│  │  - Reads atoms (extended thinking, model selection)       │  │
│  │  - Calls IPCChatTransport.sendMessages()                  │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  tRPC Client (trpc.ts)                                    │  │
│  │  - trpcClient.claude.chat.subscribe()                     │  │
│  │  - Type-safe IPC communication                            │  │
│  └────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────┼──────────────────────────────────────┘
                             │
                             │ Electron IPC (via tRPC)
                             │
┌────────────────────────────▼──────────────────────────────────────┐
│                          Main Process                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  tRPC Router (routers/claude.ts)                          │  │
│  │  - Receives subscription request                          │  │
│  │  - Loads messages from SQLite DB                          │  │
│  │  - Parses @mentions for agents/skills/tools               │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Environment Setup (lib/claude/env.ts)                    │  │
│  │  1. getBundledClaudeBinaryPath()                          │  │
│  │     - Resolves: resources/bin/{platform}-{arch}/claude    │  │
│  │     - Verifies binary exists and is executable            │  │
│  │                                                            │  │
│  │  2. buildClaudeEnv()                                      │  │
│  │     - Loads shell environment via `zsh -ilc env`          │  │
│  │     - Merges with process.env                             │  │
│  │     - Adds CLAUDE_CODE_OAUTH_TOKEN if authenticated       │  │
│  │     - Sets HOME, USER, SHELL, TERM                        │  │
│  │     - Sets CLAUDE_CODE_ENTRYPOINT="sdk-ts"                │  │
│  │     - Removes potentially conflicting API keys            │  │
│  │                                                            │  │
│  │  3. setupIsolatedSessionDir()                             │  │
│  │     - Creates: {userData}/claude-sessions/{subChatId}/    │  │
│  │     - Symlinks ~/.claude/agents/ and ~/.claude/skills/    │  │
│  │     - Prevents cross-chat configuration contamination     │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Claude SDK Query (@anthropic-ai/claude-agent-sdk)        │  │
│  │  const { query } = await import("claude-agent-sdk")       │  │
│  │                                                            │  │
│  │  query({                                                  │  │
│  │    cwd: projectPath,                                      │  │
│  │    systemPrompt: "claude_code",                           │  │
│  │    permissionMode: "plan" | "bypassPermissions",          │  │
│  │    agents: [...mentionedAgents],                          │  │
│  │    mcpServers: {...projectMcpConfig},                     │  │
│  │    pathToClaudeCodeExecutable: binaryPath,                │  │
│  │    settingSources: ["project", "user"],                   │  │
│  │    canUseTool: (toolName) => approvalCallback(),          │  │
│  │    extendedThinking: { maxTokens: 10000 },                │  │
│  │    resume: sessionId,  // For multi-turn conversations    │  │
│  │  })                                                       │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│                ┌──────────────────────┐                         │
│                │  Claude Binary       │                         │
│                │  (spawned process)   │                         │
│                │  - Reads .claude.json│                         │
│                │  - Loads MCP servers │                         │
│                │  - Executes tools    │                         │
│                │  - Streams responses │                         │
│                └──────────┬───────────┘                         │
│                           │                                     │
│                           ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Stream Transformer                                       │  │
│  │  - Converts SDK format → UIMessageChunk format            │  │
│  │  - Handles text, tool calls, thinking, system messages    │  │
│  │  - Accumulates parts into complete assistant message      │  │
│  │  - Saves to DB with sessionId for resumption              │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                     │
└───────────────────────────┼───────────────────────────────────────┘
                            │
                            │ tRPC Subscription Stream
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                         Renderer Process                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Stream Consumer                                          │  │
│  │  - Receives UIMessageChunk objects                        │  │
│  │  - Updates chat UI in real-time                           │  │
│  │  - Renders text, tool calls, thinking, diffs              │  │
│  │  - Shows notifications for errors                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

## Binary Management

### Download Process

**Script:** `scripts/download-claude-binary.mjs`

```bash
# Download for current platform
bun run claude:download

# Download for all platforms (for building releases)
bun run claude:download:all

# Download specific version
bun run claude:download --version=2.1.5
```

**Process:**
1. Detect platform and architecture
2. Fetch manifest from: `https://storage.googleapis.com/claude-code-dist-.../claude-code-releases/{version}/manifest.json`
3. Download binary for platform
4. Verify SHA256 checksum
5. Save to: `resources/bin/{platform}-{arch}/claude` (or `claude.exe` on Windows)
6. Make executable (chmod 0o755 on Unix)
7. Write version metadata to `resources/bin/VERSION`

**Version Detection:**
- Default: 2.1.5
- Fallback: Auto-detect latest from `https://claude.ai/install.sh`

### Binary Storage Locations

| Environment | Path |
|-------------|------|
| Development | `resources/bin/{platform}-{arch}/claude` |
| Production (macOS) | `{app.asar.unpacked}/resources/bin/claude` |
| Production (Windows) | `{app.asar.unpacked}/resources/bin/claude.exe` |

### Binary Path Resolution

**Function:** `getBundledClaudeBinaryPath()` in `src/main/lib/claude/env.ts`

```typescript
// Logic:
if (is.dev) {
  // Development: platform-specific subdirectory
  return path.join(resources, 'bin', `${platform}-${arch}`, binaryName)
} else {
  // Production: resources/bin/ (copied during build)
  return path.join(process.resourcesPath, 'bin', binaryName)
}
```

The function includes extensive logging and verification:
- Platform and architecture detection
- File existence check
- Executable permission verification
- File size logging
- Debug output with `[getBundledClaudeBinaryPath]` prefix

## Environment Configuration

### buildClaudeEnv() Process

**Location:** `src/main/lib/claude/env.ts:166-216`

This is a sophisticated multi-step process that ensures Claude Code runs with the correct environment:

#### Step 1: Shell Environment Loading

```typescript
// Spawn interactive login shell to capture full environment
const { stdout } = await execAsync('zsh -ilc env', {
  env: {
    HOME: app.getPath('home'),
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
  },
  timeout: 5000,
})

// Parse key=value pairs from shell output
const shellEnv = parseEnvOutput(stdout)
```

**Why?** Electron apps have a minimal PATH that doesn't include user-installed tools (brew, npm, etc.). Loading the shell environment ensures Claude has access to all user tools.

#### Step 2: Environment Merging

```typescript
const mergedEnv = {
  ...shellEnv,        // Shell environment (base)
  ...process.env,     // Current process env (overlays)
  PATH: shellEnv.PATH // Restore shell PATH (critical!)
}
```

#### Step 3: Environment Stripping

Remove potentially interfering variables:
```typescript
delete mergedEnv.ANTHROPIC_API_KEY      // Prevent key confusion
delete mergedEnv.OPENAI_API_KEY
delete mergedEnv.CLAUDE_CODE_USE_BEDROCK
delete mergedEnv.CLAUDE_CODE_USE_VERTEX
```

#### Step 4: Required Variables

```typescript
const finalEnv = {
  ...mergedEnv,
  HOME: app.getPath('home'),
  USER: os.userInfo().username,
  SHELL: process.env.SHELL || '/bin/zsh',
  TERM: 'xterm-256color',
  CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',  // Identifies this as SDK usage
}
```

#### Step 5: Authentication Token

If user has authenticated with Claude Code OAuth:
```typescript
if (authToken) {
  finalEnv.CLAUDE_CODE_OAUTH_TOKEN = authToken
}
```

**Token Storage:**
- Stored in SQLite DB: `{userData}/data/agents.db`
- Encrypted using Electron's `safeStorage` API (OS keychain)
- Retrieved via `authStore.getClaudeCodeOAuthToken()`

### Fallback PATH Strategy

If shell environment loading fails (timeout, error), uses hardcoded fallback:

```typescript
const fallbackPath = [
  path.join(homeDir, '.local', 'bin'),
  '/opt/homebrew/bin',      // Apple Silicon Homebrew
  '/usr/local/bin',         // Intel Homebrew
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
].join(':')
```

## Session Isolation

### Isolated Configuration Directories

**Function:** `setupIsolatedSessionDir()` in `routers/claude.ts`

Each sub-chat gets its own isolated configuration directory to prevent cross-contamination:

```
{userData}/claude-sessions/{subChatId}/
├── agents/      → symlink to ~/.claude/agents/
└── skills/      → symlink to ~/.claude/skills/
```

**Why?**
- Prevents one chat's configuration from affecting another
- Allows safe concurrent Claude sessions
- Each session can have different tool approvals, settings, etc.

**Implementation:**
```typescript
const sessionConfigDir = path.join(
  app.getPath('userData'),
  'claude-sessions',
  subChatId
)

await fs.ensureDir(sessionConfigDir)

// Symlink shared agents and skills
const agentsDir = path.join(os.homedir(), '.claude', 'agents')
const skillsDir = path.join(os.homedir(), '.claude', 'skills')

await fs.ensureSymlink(agentsDir, path.join(sessionConfigDir, 'agents'))
await fs.ensureSymlink(skillsDir, path.join(sessionConfigDir, 'skills'))
```

## Message Flow & Streaming

### End-to-End Message Flow

```
User Input → IPCChatTransport → tRPC Subscription → Claude Router
    ↓
Claude Router:
  1. Load existing messages from DB
  2. Save user message
  3. Parse @mentions
  4. Setup environment
  5. Call SDK query()
    ↓
Claude SDK:
  1. Spawn binary with environment
  2. Stream messages back
    ↓
Stream Transformer:
  1. Convert SDK format → UIMessageChunk
  2. Handle text, tools, thinking, system messages
  3. Accumulate complete assistant message
  4. Save to DB with sessionId
    ↓
tRPC Stream → Renderer → UI Update
```

### Message Structure

**User Message:**
```typescript
{
  id: generateId(),
  role: "user",
  parts: [
    { type: "text", text: "User's message" },
    { type: "image", data: "base64...", mimeType: "image/png" }  // if image
  ]
}
```

**Assistant Message:**
```typescript
{
  id: generateId(),
  role: "assistant",
  parts: [
    { type: "text", text: "Assistant response" },
    {
      type: "tool-Bash",
      toolCallId: "call_123",
      toolName: "Bash",
      state: "call",
      input: { command: "ls -la" }
    },
    {
      type: "tool-Bash",
      toolCallId: "call_123",
      toolName: "Bash",
      state: "result",
      result: "total 16\ndrwxr-xr-x..."
    }
  ],
  metadata: {
    sessionId: "sess_abc123",
    inputTokens: 1234,
    outputTokens: 567,
    cost: 0.0045,
    durationMs: 3500,
    stopReason: "end_turn"
  }
}
```

### Stream Transformer

**Location:** `routers/claude.ts` transform function

Converts SDK message format to UI message chunks:

```typescript
async *transform(sdkMessage) {
  switch (sdkMessage.type) {
    case "text":
      yield { type: "text-delta", text: sdkMessage.delta }
      break

    case "tool-call":
      yield {
        type: "tool-call",
        toolCallId: sdkMessage.toolCallId,
        toolName: sdkMessage.toolName,
        input: sdkMessage.input
      }
      break

    case "tool-result":
      yield {
        type: "tool-result",
        toolCallId: sdkMessage.toolCallId,
        result: sdkMessage.result
      }
      break

    case "extended_thinking":
      // Transform thinking blocks into tool-like chunks
      yield {
        type: "thinking-delta",
        text: sdkMessage.delta,
        thinkingId: sdkMessage.thinkingId
      }
      break
  }
}
```

## Authentication

### Claude Code OAuth Flow

**Router:** `src/main/lib/trpc/routers/claude-code.ts`

#### Step 1: Start Auth
```typescript
trpcClient.claudeCode.startAuth.mutate()
```
- Creates CodeSandbox environment
- Returns sandbox ID and status URL

#### Step 2: Poll for OAuth URL
```typescript
trpcClient.claudeCode.pollStatus.mutate({ sandboxId })
```
- Polls sandbox until OAuth URL is ready
- Returns URL for user to visit in browser

#### Step 3: User Completes OAuth
- User visits URL in browser
- Logs in to Anthropic account
- Authorizes 21st Agents
- Receives authorization code

#### Step 4: Submit Code
```typescript
trpcClient.claudeCode.submitCode.mutate({ sandboxId, code })
```
- Sends code to sandbox
- Receives OAuth token
- Encrypts token with `safeStorage.encryptString()`
- Saves to SQLite DB

#### Step 5: Token Usage
```typescript
const token = authStore.getClaudeCodeOAuthToken()
// Decrypt: safeStorage.decryptString(Buffer.from(encrypted, 'hex'))

// Add to environment
env.CLAUDE_CODE_OAUTH_TOKEN = token

// Pass to SDK
query({ ..., pathToClaudeCodeExecutable: binaryPath })
```

### Token Security

- **Storage:** SQLite DB at `{userData}/data/agents.db`
- **Encryption:** Electron's `safeStorage` API
  - macOS: Keychain
  - Windows: DPAPI
  - Linux: libsecret or fallback to plain text (with warning)
- **Access:** Main process only (renderer never sees token)

## SDK Integration

### Dynamic Import

**Location:** `routers/claude.ts:125`

```typescript
const { query } = await import("@anthropic-ai/claude-agent-sdk")
```

**Why dynamic?**
- SDK is ESM-only module
- Electron main process uses CommonJS by default
- Dynamic import allows mixing module systems

### Query Options

```typescript
query({
  // Core options
  cwd: projectPath,                    // Working directory
  systemPrompt: "claude_code",         // Preset system prompt
  permissionMode: "bypassPermissions", // or "plan" for read-only

  // Session management
  resume: sessionId,                   // Resume previous session
  continue: true,                      // Continue after tool use

  // Configuration
  pathToClaudeCodeExecutable: binaryPath,
  settingSources: ["project", "user"], // Load .claude.json from both

  // Features
  agents: [...registeredAgents],       // @[agent:name] mentions
  mcpServers: {...projectConfig},      // MCP server configuration
  extendedThinking: {
    maxTokens: 10000                   // Thinking token budget
  },

  // Callbacks
  canUseTool: async (toolName) => {
    // Request user approval for destructive tools
    if (destructiveTools.includes(toolName)) {
      return await showApprovalDialog(toolName)
    }
    return true
  },

  // Messages
  messages: [...previousMessages, userMessage],
})
```

### MCP Server Configuration

Reads from `~/.claude.json` in project directory:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]
    },
    "postgres": {
      "command": "docker",
      "args": ["exec", "-i", "postgres", "psql", "-U", "user", "-d", "db"]
    }
  }
}
```

These servers provide tools Claude can use (file operations, database queries, etc.).

## Database Schema

### sub_chats Table

```sql
CREATE TABLE sub_chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  session_id TEXT,        -- Claude session ID for resumption
  mode TEXT NOT NULL,     -- "plan" or "agent"
  messages TEXT NOT NULL, -- JSON array of message objects
  stream_id TEXT,         -- Set during streaming, cleared on finish
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id)
)
```

**Messages JSON Structure:**
```json
[
  {
    "id": "msg_001",
    "role": "user",
    "parts": [
      { "type": "text", "text": "Hello" }
    ]
  },
  {
    "id": "msg_002",
    "role": "assistant",
    "parts": [
      { "type": "text", "text": "Hi!" }
    ],
    "metadata": {
      "sessionId": "sess_abc",
      "inputTokens": 10,
      "outputTokens": 5
    }
  }
]
```

## Error Handling

### Error Categories

Defined in `routers/claude.ts`:

```typescript
const errorCategories = {
  AUTH_FAILED_SDK: "You are not logged in",
  INVALID_API_KEY_SDK: "Invalid API key",
  RATE_LIMIT_SDK: "Rate limit exceeded",
  PROCESS_CRASH: "Claude process crashed",
  EXECUTABLE_NOT_FOUND: "Claude binary not found",
  NETWORK_ERROR: "Network connection error",
}
```

### Error Flow

```
Error occurs in Claude SDK
    ↓
Stream transformer catches error
    ↓
Emits error chunk with category
    ↓
Frontend displays toast notification
    ↓
If AUTH_FAILED_SDK: Shows login modal
```

### Logging

**Debug Logging:**
```typescript
console.log('[SD]', 'Stream message:', message)
```
- Prefix: `[SD]` = Stream Debug
- Logs all messages from Claude SDK

**Raw Message Logging:**
```bash
export CLAUDE_RAW_LOG=1
```
- Logs raw SDK messages to JSONL files
- Location: `{userData}/logs/claude/`
- Rotation: 10MB per file
- Retention: 7 days
- File format: `claude-raw-{timestamp}.jsonl`

## Build Configuration

### electron-builder Configuration

**File:** `electron-builder.yml`

```yaml
asarUnpack:
  - node_modules/better-sqlite3/**/*
  - node_modules/node-pty/**/*
  - node_modules/@anthropic-ai/claude-agent-sdk/**/*

files:
  - from: resources/bin/${platform}-${arch}
    to: bin
```

**Why unpack SDK?**
- ASAR archives can break native modules
- SDK may use dynamic imports that need real filesystem
- Ensures SDK can spawn Claude binary properly

### Binary Distribution

**macOS:**
```
Agents.app/
└── Contents/
    └── Resources/
        ├── app.asar
        └── app.asar.unpacked/
            └── resources/
                └── bin/
                    └── claude  (copied from resources/bin/darwin-arm64/)
```

**Windows:**
```
Agents/
├── resources/
│   └── app.asar
└── app.asar.unpacked/
    └── resources/
        └── bin/
            └── claude.exe  (copied from resources/bin/win32-x64/)
```

## Performance Considerations

### Why Bundled Binary is Faster

1. **No Download Wait:** Binary is immediately available
2. **No Version Check:** No need to contact remote server
3. **Predictable Location:** No PATH searching required
4. **Optimized Environment:** Pre-configured environment variables

### Memory & Process Management

- Claude binary runs as separate process (spawned by SDK)
- Process is terminated when session ends
- Multiple concurrent sessions supported (isolated config dirs)
- Each session has independent process

## Security Considerations

### Binary Verification

```typescript
// SHA256 checksum verification during download
const actualHash = crypto
  .createHash('sha256')
  .update(binaryBuffer)
  .digest('hex')

if (actualHash !== expectedHash) {
  throw new Error('Binary checksum mismatch')
}
```

### Token Security

- OAuth tokens encrypted at rest
- Never exposed to renderer process
- Passed to Claude via environment variable (memory only)
- Removed from environment after SDK call

### Isolated Sessions

- Each chat has separate config directory
- No cross-chat data leakage
- Tool approvals scoped to session
- File system access controlled per session

## Summary

The 21st Agents application provides a sophisticated, secure, and performant integration with Claude Code by:

1. **Bundling native binaries** for offline-first operation and version consistency
2. **Managing complex environments** by loading shell profiles and merging configurations
3. **Isolating sessions** to prevent cross-contamination and enable concurrent usage
4. **Securing authentication** with OS-level encryption and main-process-only access
5. **Streaming responses** efficiently via tRPC subscriptions and transform streams
6. **Supporting advanced features** like MCP servers, extended thinking, and session resumption
7. **Providing robust error handling** with categorized errors and comprehensive logging

This architecture ensures users get a reliable, fast, and secure Claude Code experience integrated seamlessly into their desktop workflow.
