# Debug Instructions: Dev vs Production Authentication

## Changes Made

### 1. Added Verbose Authentication Logging

In `src/main/lib/trpc/routers/claude.ts` (around line 821), added comprehensive debug output that logs:
- Dev mode status
- SafeStorage availability
- Token existence and length
- Environment variable configuration
- Config directory paths

### 2. Added SafeStorage Test Endpoint

Added `testSafeStorage` mutation to the claude router that:
- Tests encryption/decryption functionality
- Compares behavior in dev vs prod
- Returns detailed diagnostics

## How to Test

### Step 1: Start Dev Server and Capture Logs

```bash
cd /Users/caronex/Work/CaronexLabs/ii/ii-client

# Start dev server
bun run dev > dev_logs.txt 2>&1 &
DEV_PID=$!

# Wait for app to start
sleep 5

# Open the app and try to send a message to Claude
# Look for [AUTH-DEBUG] logs in dev_logs.txt

# Stop dev server
kill $DEV_PID
```

### Step 2: Test Production Build

```bash
# Build and package
bun run build
bun run package:mac

# Open production app
open "release/Intelligence Interface.app"

# Try to send a message to Claude
# Check Console.app for [AUTH-DEBUG] logs from "Intelligence Interface"
```

### Step 3: Compare Logs

Open both log outputs and compare the `[AUTH-DEBUG]` sections:

```bash
# Dev logs
grep "AUTH-DEBUG" dev_logs.txt

# Production logs (from Console.app)
# Filter by process name "Intelligence Interface"
```

### Step 4: Test SafeStorage Directly

You can add a UI button to call the test endpoint, or use the dev console:

```typescript
// In renderer, call:
await trpc.claude.testSafeStorage.mutate()
```

This will log results showing if encryption works differently in dev vs prod.

## What to Look For

### Key Differences to Identify

1. **SafeStorage Availability**
   ```
   [AUTH-DEBUG] safeStorage.isEncryptionAvailable(): true/false
   ```
   - If `false` in dev but `true` in prod → encryption issue
   - Token may be stored incorrectly

2. **Token Length**
   ```
   [AUTH-DEBUG] claudeCodeToken length: X
   ```
   - Should be ~200-400 characters for a valid OAuth token
   - If 0 or undefined → token not retrieved from database
   - If very short → decryption failed

3. **Environment Variable**
   ```
   [AUTH-DEBUG] CLAUDE_CODE_OAUTH_TOKEN in env: true/false
   ```
   - If `false` → token not being passed to Claude binary
   - Even if token exists, it's not making it to the subprocess

4. **Paths**
   ```
   [AUTH-DEBUG] userData: /path/to/userData
   [AUTH-DEBUG] isolatedConfigDir: /path/to/claude-sessions/...
   ```
   - Dev should use `Agents Dev`
   - Prod should use `Intelligence Interface`

### Expected Working Scenario (Production)

```
[AUTH-DEBUG] IS_DEV: false
[AUTH-DEBUG] app.isPackaged: true
[AUTH-DEBUG] userData: /Users/caronex/Library/Application Support/Intelligence Interface
[AUTH-DEBUG] safeStorage.isEncryptionAvailable(): true
[AUTH-DEBUG] claudeCodeToken exists: true
[AUTH-DEBUG] claudeCodeToken length: 250
[AUTH-DEBUG] claudeCodeToken preview: sk-ant-api03-abc123...
[AUTH-DEBUG] CLAUDE_CODE_OAUTH_TOKEN in env: true
```

### Failing Scenario (Dev)

Possible issues:

**Scenario A: Encryption Not Available**
```
[AUTH-DEBUG] IS_DEV: true
[AUTH-DEBUG] safeStorage.isEncryptionAvailable(): false  ← ISSUE
[AUTH-DEBUG] claudeCodeToken length: 32  ← Too short, base64 decode failed
```

**Scenario B: Token Not Retrieved**
```
[AUTH-DEBUG] claudeCodeToken exists: false  ← ISSUE
[AUTH-DEBUG] CLAUDE_CODE_OAUTH_TOKEN in env: false  ← Not passed to subprocess
```

**Scenario C: Token Not Passed to Environment**
```
[AUTH-DEBUG] claudeCodeToken exists: true
[AUTH-DEBUG] claudeCodeToken length: 250
[AUTH-DEBUG] CLAUDE_CODE_OAUTH_TOKEN in env: false  ← ISSUE HERE
```

## Common Fixes Based on Diagnosis

### Fix 1: SafeStorage Encryption Issue

If `safeStorage.isEncryptionAvailable()` returns `false` in dev:

**Option A**: Force base64 fallback in dev mode
```typescript
// src/main/lib/trpc/routers/claude.ts
function decryptToken(encrypted: string): string {
  // Force fallback in dev mode (unsigned app)
  if (!app.isPackaged || !safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}
```

**Option B**: Re-import token in dev mode
```bash
# Delete dev database token
sqlite3 "$HOME/Library/Application Support/Agents Dev/data/agents.db" \
  "DELETE FROM claude_code_credentials WHERE id = 'default';"

# Re-import from system (via onboarding UI)
```

### Fix 2: Environment Variable Not Propagating

If token exists but not in `finalEnv`:

```typescript
// Ensure token is explicitly set
const finalEnv = {
  ...claudeEnv,
  CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken || "",  // Always set
  CLAUDE_CONFIG_DIR: isolatedConfigDir,
}
```

### Fix 3: Binary Not Using Environment Variable

If everything looks correct but auth still fails, the Claude binary might not read `CLAUDE_CODE_OAUTH_TOKEN`. Test directly:

```bash
# Export token
export CLAUDE_CODE_OAUTH_TOKEN="<your-token>"

# Run binary
/Users/caronex/Work/CaronexLabs/ii/ii-client/resources/bin/darwin-arm64/claude \
  --help
```

If this doesn't work, the custom env var might not be supported. Need to check SDK source.

### Fix 4: Database Connection Issue in Dev

If dev mode can't read the database:

```typescript
// src/main/lib/db/index.ts
// Add logging
export function getDatabase() {
  if (!database) {
    console.log("[DB] Database not initialized, calling initDatabase")
    initDatabase()
  }
  return database!
}
```

## Quick Test: Manual Token Override

To test if the issue is token retrieval vs token usage:

```typescript
// In src/main/lib/trpc/routers/claude.ts, line 106
function getClaudeCodeToken(): string | null {
  // TEMPORARY TEST: Return a hardcoded working token
  return "sk-ant-api03-..." // Use a real token for testing

  // Original code below (comment out)
  // try {
  //   const db = getDatabase()
  //   ...
}
```

If this works, the issue is token retrieval/decryption. If it still fails, the issue is environment propagation.

## Reporting Results

After running tests, report:

1. **Dev Mode Logs**
   - Full `[AUTH-DEBUG]` section
   - `testSafeStorage` results

2. **Prod Mode Logs**
   - Full `[AUTH-DEBUG]` section
   - `testSafeStorage` results

3. **Behavior**
   - Does auth work? (Yes/No)
   - What error appears? (Copy exact message)

4. **Differences**
   - What's different between dev and prod logs?
   - Which specific field differs?

This will pinpoint the exact cause of the dev vs prod authentication discrepancy.
