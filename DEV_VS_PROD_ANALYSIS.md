# Dev vs Production Configuration Analysis

## Issue Summary

**Problem**: Authentication works in production ARM64 Mac build but fails in development mode (`bun run dev`) with `AUTH_FAILED_SDK` errors.

**User Confirmation**: "I created the package for mac arm 64, and it is working correctly. I am able to use claude code without errors and without authentication."

## Environment Differences

### 1. User Data Paths

| Mode | Path | Set By |
|------|------|--------|
| **Development** | `~/Library/Application Support/Agents Dev/` | `src/main/index.ts:25-30` |
| **Production** | `~/Library/Application Support/Intelligence Interface/` | Default Electron userData |

```typescript
// src/main/index.ts:21-30
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

if (IS_DEV) {
  const { join } = require("path")
  const devUserData = join(app.getPath("userData"), "..", "Agents Dev")
  app.setPath("userData", devUserData)
  console.log("[Dev] Using separate userData path:", devUserData)
}
```

### 2. App Identification

| Mode | App Name | App User Model ID (Windows) |
|------|----------|----------------------------|
| **Development** | "Agents Dev" | `dev.caronexlabs.ii.dev` |
| **Production** | "Intelligence Interface" | `dev.caronexlabs.ii` |

### 3. Binary Paths

| Mode | Claude Binary Path |
|------|-------------------|
| **Development** | `{appPath}/resources/bin/{platform}-{arch}/claude` |
| **Production** | `{resourcesPath}/bin/claude` |

**Dev Binary Location**: `/Users/caronex/Work/CaronexLabs/ii/ii-client/resources/bin/darwin-arm64/claude`
- Architecture: `Mach-O 64-bit executable arm64` ✓
- Size: 178 MB ✓
- Exists: Yes ✓

### 4. Electron SafeStorage Encryption

Both dev and prod use Electron's `safeStorage` for token encryption:

```typescript
// src/main/lib/trpc/routers/claude.ts:94-100
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}
```

**Note**: `safeStorage.isEncryptionAvailable()` may behave differently in dev mode on some platforms.

### 5. Build Process

| Command | Description |
|---------|-------------|
| `bun run dev` | Runs `electron-vite dev` (development server) |
| `bun run build` | Runs `electron-vite build` (production build) |
| `bun run package:mac` | Runs `electron-builder --mac` (creates .app bundle) |

## Authentication Flow

### Token Storage Location

**Database**: `{userData}/data/agents.db` → Table: `claude_code_credentials`

**Dev Database Status**:
```bash
$ sqlite3 "$HOME/Library/Application Support/Agents Dev/data/agents.db" \
  "SELECT id, user_id, connected_at FROM claude_code_credentials;"

default||1768983554
```

Token exists in dev database ✓

**Production Database Status**:
- Directory exists: `~/Library/Application Support/IntelligenceInterface/`
- Database does NOT exist (user may have tested from DMG without onboarding)

### Token Passing to Claude SDK

```typescript
// src/main/lib/trpc/routers/claude.ts:812-820
const finalEnv = {
  ...claudeEnv,
  ...(claudeCodeToken && {
    CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,  // ← Token passed here
  }),
  CLAUDE_CONFIG_DIR: isolatedConfigDir,  // ← Isolated per subchat
}
```

**Critical**: The `CLAUDE_CODE_OAUTH_TOKEN` environment variable is custom to this app. The Claude SDK/binary must be reading it.

### Config Directory Isolation

```typescript
// src/main/lib/trpc/routers/claude.ts:721-725
const isolatedConfigDir = path.join(
  app.getPath("userData"),
  "claude-sessions",
  isUsingOllama ? input.chatId : input.subChatId
)
```

Each subchat gets an isolated config directory:
- **Dev**: `~/Library/Application Support/Agents Dev/claude-sessions/{subChatId}/`
- **Prod**: `~/Library/Application Support/Intelligence Interface/claude-sessions/{subChatId}/`

## Hypothesis: Why Production Works But Dev Doesn't

### Potential Root Causes

#### 1. **Electron SafeStorage Availability in Dev Mode**

On macOS, `safeStorage` requires the app to be signed and notarized in some cases. Development mode might fall back to base64-only "encryption":

```typescript
if (!safeStorage.isEncryptionAvailable()) {
  return Buffer.from(encrypted, "base64").toString("utf-8")  // Fallback
}
```

**Action**: Check if `safeStorage.isEncryptionAvailable()` returns `false` in dev mode but `true` in production.

#### 2. **Environment Variable Propagation in Dev Server**

`electron-vite dev` runs a hot-reloading development server. It's possible that:
- Environment variables set in the main process aren't properly propagated to spawned subprocesses
- Bun's subprocess handling differs from Node.js
- The Claude binary subprocess isn't inheriting the environment correctly

**Test**:
```typescript
console.log("[DEBUG] finalEnv.CLAUDE_CODE_OAUTH_TOKEN:", finalEnv.CLAUDE_CODE_OAUTH_TOKEN ? "SET" : "NOT SET")
console.log("[DEBUG] finalEnv.CLAUDE_CODE_OAUTH_TOKEN length:", finalEnv.CLAUDE_CODE_OAUTH_TOKEN?.length)
```

#### 3. **Code Signing and Entitlements**

The app uses macOS entitlements (`build/entitlements.mac.plist`). In dev mode, the app is unsigned. This affects:
- Keychain access
- System credential storage
- `safeStorage` availability

Production builds are signed with:
```json
"hardenedRuntime": true,
"gatekeeperAssess": false
```

#### 4. **Bun vs Node.js Differences**

The SDK spawns the Claude binary using Node.js/Bun:
```typescript
executable = isRunningWithBun() ? "bun" : "node"
```

If `electron-vite dev` is running under Bun, the subprocess spawning might differ.

#### 5. **Hot Module Replacement (HMR) Side Effects**

`electron-vite dev` uses HMR for the renderer process. If HMR is also affecting the main process, it could:
- Cause re-imports of the SDK
- Reset cached values
- Break stateful operations

#### 6. **Database File Locking**

In dev mode with hot reloading, the database connection might be held open incorrectly:
```typescript
// src/main/lib/db/index.ts
export function initDatabase() {
  if (database) return database
  // ...
}
```

If the main process reloads, `database` might become stale.

## Recommended Investigation Steps

### Step 1: Add Verbose Logging

In `src/main/lib/trpc/routers/claude.ts` around line 812:

```typescript
console.log("[AUTH-DEBUG] ========== Authentication Debug ==========")
console.log("[AUTH-DEBUG] IS_DEV:", IS_DEV)
console.log("[AUTH-DEBUG] app.isPackaged:", app.isPackaged)
console.log("[AUTH-DEBUG] userData:", app.getPath("userData"))
console.log("[AUTH-DEBUG] safeStorage.isEncryptionAvailable():", safeStorage.isEncryptionAvailable())
console.log("[AUTH-DEBUG] claudeCodeToken exists:", !!claudeCodeToken)
console.log("[AUTH-DEBUG] claudeCodeToken length:", claudeCodeToken?.length)
console.log("[AUTH-DEBUG] claudeCodeToken preview:", claudeCodeToken?.substring(0, 20))
console.log("[AUTH-DEBUG] isolatedConfigDir:", isolatedConfigDir)
console.log("[AUTH-DEBUG] finalEnv.CLAUDE_CODE_OAUTH_TOKEN:", finalEnv.CLAUDE_CODE_OAUTH_TOKEN ? "SET" : "NOT SET")
console.log("[AUTH-DEBUG] ===========================================")
```

### Step 2: Test SafeStorage Explicitly

Add a debug endpoint to test encryption/decryption:

```typescript
testSafeStorage: publicProcedure.mutation(() => {
  const testToken = "sk-ant-test-token-12345"
  console.log("[SafeStorage] isEncryptionAvailable:", safeStorage.isEncryptionAvailable())

  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(testToken).toString("base64")
    : Buffer.from(testToken).toString("base64")

  console.log("[SafeStorage] Encrypted length:", encrypted.length)

  const decrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(Buffer.from(encrypted, "base64"))
    : Buffer.from(encrypted, "base64").toString("utf-8")

  console.log("[SafeStorage] Decrypted matches:", decrypted === testToken)

  return {
    available: safeStorage.isEncryptionAvailable(),
    works: decrypted === testToken
  }
})
```

### Step 3: Compare Process Environment

Log the environment that's passed to the Claude binary:

```typescript
console.log("[ENV-DEBUG] Process environment keys:", Object.keys(finalEnv).sort())
console.log("[ENV-DEBUG] HOME:", finalEnv.HOME)
console.log("[ENV-DEBUG] USER:", finalEnv.USER)
console.log("[ENV-DEBUG] SHELL:", finalEnv.SHELL)
console.log("[ENV-DEBUG] PATH preview:", finalEnv.PATH?.substring(0, 100))
console.log("[ENV-DEBUG] CLAUDE_CODE_ENTRYPOINT:", finalEnv.CLAUDE_CODE_ENTRYPOINT)
console.log("[ENV-DEBUG] CLAUDE_CONFIG_DIR:", finalEnv.CLAUDE_CONFIG_DIR)
```

### Step 4: Test Binary Execution Directly

Manually test if the Claude binary can authenticate:

```bash
# Set up environment
export CLAUDE_CODE_OAUTH_TOKEN="<decrypted-token-from-db>"
export CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Agents Dev/claude-sessions/test"

# Run binary
/Users/caronex/Work/CaronexLabs/ii/ii-client/resources/bin/darwin-arm64/claude --version

# Try a simple query
echo '{"prompt":"Hello"}' | /Users/caronex/Work/CaronexLabs/ii/ii-client/resources/bin/darwin-arm64/claude
```

### Step 5: Compare Dev vs Prod Execution

Build the app and compare logs:

```bash
# Build production version
bun run build
bun run package:mac

# Open both
open "release/Intelligence Interface.app"
bun run dev

# Compare console outputs when running identical queries
```

## Next Steps

1. **Add comprehensive logging** to identify where authentication diverges
2. **Test safeStorage** behavior in dev vs prod
3. **Verify environment propagation** to the Claude binary subprocess
4. **Compare binary execution** in both modes
5. **Check for ARM64-specific issues** with Bun or electron-vite

## Files to Monitor

- `src/main/lib/trpc/routers/claude.ts` - Token passing to SDK
- `src/main/lib/trpc/routers/claude-code.ts` - Token import/storage
- `src/main/lib/claude/env.ts` - Environment building
- `src/main/index.ts` - Dev mode detection and userData setup
- `src/main/lib/db/index.ts` - Database initialization

## References

- Electron SafeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
- Claude Agent SDK: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`
- electron-vite: https://electron-vite.org/
- electron-builder: https://www.electron.build/
