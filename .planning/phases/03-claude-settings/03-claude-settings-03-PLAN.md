---
phase: 03-claude-settings
plan: 03
type: execute
wave: 1
depends_on: ["02"]
files_modified:
  - src/main/lib/db/schema/index.ts
  - src/main/lib/trpc/routers/claude-settings.ts
  - src/main/lib/trpc/routers/claude.ts
  - src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx
autonomous: true
---

<objective>
Add AWS Credentials (Bedrock) and API Key auth modes to Claude Code integration.

Purpose: Currently, the app only supports OAuth authentication for Claude Code SDK. Users need the ability to use AWS Credentials for Amazon Bedrock or a direct API Key. This adds a credential selector and secure storage for API keys.

Output:
- Database schema extended with authMode and apiKey fields
- tRPC endpoints updated to handle auth mode selection
- Claude router detects auth mode and uses appropriate credentials
- UI with credential selector, API key input (encrypted), and Bedrock region selector
- Migration generated and applied
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit_done/templates/summary.md
@~/.claude/get-shit-done/references/checkpoints.md
</execution_context>

<context>
@.planning/STATE.md
@src/main/lib/db/schema/index.ts
@src/main/lib/trpc/routers/claude-settings.ts
@src/main/lib/trpc/routers/claude.ts
@src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx
@.planning/phases/03-claude-settings/03-claude-settings-01-SUMMARY.md
@.planning/phases/03-claude-settings/03-claude-settings-02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add auth mode and API key fields to database schema</name>
  <files>src/main/lib/db/schema/index.ts</files>

  <action>In the `claudeCodeSettings` table definition (around line 103), add two new fields after `mcpServerSettings`:

```typescript
authMode: text("auth_mode").notNull().default("oauth"), // "oauth" | "aws" | "apiKey"
apiKey: text("api_key"), // Encrypted API key for apiKey mode (null = not applicable)
```

The updated table definition should look like:
```typescript
export const claudeCodeSettings = sqliteTable("claude_code_settings", {
  id: text("id").primaryKey().default("default"),
  customBinaryPath: text("custom_binary_path"),
  customEnvVars: text("custom_env_vars").notNull().default("{}"),
  customConfigDir: text("custom_config_dir"),
  mcpServerSettings: text("mcp_server_settings").notNull().default("{}"),
  authMode: text("auth_mode").notNull().default("oauth"),
  apiKey: text("api_key"), // API key for apiKey mode
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})
```</action>

  <verify>grep -n "authMode\|apiKey" src/main/lib/db/schema/index.ts shows the new fields in claudeCodeSettings table</verify>
  <done>Schema extended with authMode (oauth/aws/apiKey) and encrypted apiKey field</done>
</task>

<task type="auto">
  <name>Task 2: Update claude-settings router for auth modes and API key</name>
  <files>src/main/lib/trpc/routers/claude-settings.ts</files>

  <action>Update the router to handle auth modes and encrypted API key:

1. Add safeStorage import at top:
```typescript
import { safeStorage } from "electron"
```

2. Add helper functions after `parseJsonSafely`:
```typescript
/**
 * Encrypt API key using Electron's safeStorage
 */
function encryptApiKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[claude-settings] Encryption not available, storing as base64")
    return Buffer.from(key).toString("base64")
  }
  return safeStorage.encryptString(key).toString("base64")
}

/**
 * Decrypt API key using Electron's safeStorage
 */
function decryptApiKey(encrypted: string): string | null {
  if (!encrypted) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    const buffer = Buffer.from(encrypted, "base64")
    return safeStorage.decryptString(buffer)
  } catch {
    console.error("[claude-settings] Failed to decrypt API key:", error)
    return null
  }
}
```

3. Update `getSettings` return (around line 134-142):
```typescript
return {
  customBinaryPath: settings.customBinaryPath,
  customEnvVars: parseJsonSafely<Record<string, string>>(
    settings.customEnvVars,
    {}
  ),
  customConfigDir: settings.customConfigDir,
  mcpServerSettings: parseJsonSafely<Record<string, { enabled: boolean }>>(
    settings.mcpServerSettings,
    {}
  ),
  authMode: (settings.authMode || "oauth") as "oauth" | "aws" | "apiKey",
  apiKey: settings.apiKey ? "••••••••" : null, // Masked for UI
}
```

4. Update `updateSettings` input schema (around line 147-152):
```typescript
.input(
  z.object({
    customBinaryPath: z.string().nullable().optional(),
    customEnvVars: z.record(z.string()).optional(),
    customConfigDir: z.string().nullable().optional(),
    mcpServerSettings: z.record(z.object({ enabled: z.boolean() })).optional(),
    authMode: z.enum(["oauth", "aws", "apiKey"]).optional(),
    apiKey: z.string().optional(), // API key for apiKey mode
  })
)
```

5. Update the mutation to encrypt API key (in both update and insert branches):
```typescript
// In the update branch (around line 165-177):
db.update(claudeCodeSettings)
  .set({
    ...(input.customBinaryPath !== undefined && {
      customBinaryPath: input.customBinaryPath,
    }),
    ...(input.customEnvVars !== undefined && {
      customEnvVars: JSON.stringify(input.customEnvVars),
    }),
    ...(input.customConfigDir !== undefined && {
      customConfigDir: input.customConfigDir,
    }),
    ...(input.mcpServerSettings !== undefined && {
      mcpServerSettings: JSON.stringify(input.mcpServerSettings),
    }),
    ...(input.authMode !== undefined && {
      authMode: input.authMode,
    }),
    ...(input.apiKey !== undefined && input.authMode === "apiKey" && {
      apiKey: encryptApiKey(input.apiKey),
    }),
    updatedAt: new Date(),
  })
  .where(eq(claudeCodeSettings.id, "default"))
  .run()

// In the insert branch (around line 180-189):
db.insert(claudeCodeSettings)
  .values({
    id: "default",
    customBinaryPath: input.customBinaryPath ?? null,
    customEnvVars: JSON.stringify(input.customEnvVars ?? {}),
    customConfigDir: input.customConfigDir ?? null,
    mcpServerSettings: JSON.stringify(input.mcpServerSettings ?? {}),
    authMode: input.authMode ?? "oauth",
    ...(input.authMode === "apiKey" && input.apiKey && {
      apiKey: encryptApiKey(input.apiKey),
    }),
    updatedAt: new Date(),
  })
  .run()
```</action>

  <verify>grep -n "authMode\|apiKey\|encryptApiKey\|decryptApiKey" src/main/lib/trpc/routers/claude-settings.ts shows the auth mode and API key handling</verify>
  <done>Router updated with auth mode selector and encrypted API key storage</done>
</task>

<task type="auto">
  <name>Task 3: Update Claude router to support multiple auth modes</name>
  <files>src/main/lib/trpc/routers/claude.ts</files>

  <action>In `src/main/lib/trpc/routers/claude.ts`, add support for AWS Credentials and API key modes:

1. Add AWS credentials detection helper after `getClaudeCodeSettings()`:
```typescript
/**
 * Check if AWS credentials are available
 */
function hasAwsCredentials(): boolean {
  // Check for AWS environment variables
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return true
  }

  // Check for AWS credentials file
  const awsCredsPath = path.join(os.homedir(), ".aws", "credentials")
  try {
    const stats = fs.statSync(awsCredsPath)
    return stats.isFile() && stats.size > 0
  } catch {
    return false
  }
}
```

2. Update `getClaudeCodeSettings()` return type to include authMode:
```typescript
function getClaudeCodeSettings(): {
  customBinaryPath: string | null
  customEnvVars: Record<string, string>
  customConfigDir: string | null
  mcpServerSettings: Record<string, { enabled: boolean }>
  authMode: "oauth" | "aws" | "apiKey"
  apiKey: string | null
}
```

3. Update the function body to include authMode and apiKey (around line 253-256):
```typescript
return {
  customBinaryPath: settings.customBinaryPath,
  customEnvVars,
  customConfigDir: settings.customConfigDir,
  mcpServerSettings: settings.mcpServerSettings
    ? JSON.parse(settings.mcpServerSettings)
    : {},
  authMode: (settings.authMode || "oauth") as "oauth" | "aws" | "apiKey",
  apiKey: settings.apiKey || null,
}
```

4. Update the token/environment setup logic (around line 412-428):
```typescript
// Get custom env vars from settings
const { customEnvVars, authMode, apiKey } = getClaudeCodeSettings()

// Build final env - use appropriate auth method based on mode
const finalEnv: Record<string, string> = {
  ...claudeEnv,
  ...customEnvVars,
  // Isolate Claude's config/session storage per subChat
  CLAUDE_CONFIG_DIR: claudeConfigDir,
}

// Add authentication based on mode
if (authMode === "oauth") {
  // OAuth mode: get token from storage
  const claudeCodeToken = getClaudeCodeToken()
  ...(claudeCodeToken && {
    CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
  })
} else if (authMode === "apiKey" && apiKey) {
  // API key mode: use API key directly
  finalEnv.ANTHROPIC_API_KEY = apiKey
} else if (authMode === "aws") {
  // AWS mode: ensure AWS SDK can find credentials
  // The SDK will automatically use ~/.aws/credentials or env vars
  // No additional env vars needed for AWS
}

// For AWS mode, ensure the model is a Bedrock model ID
// (This could be made configurable in a future plan)
if (authMode === "aws") {
  // Default to us-east-1 if model not explicitly set to Bedrock
  if (!input.model && !input.maxThinkingTokens) {
    // You could add Bedrock model selection in the UI
    // For now, user must specify Bedrock model manually
    console.log("[claude] AWS mode: ensure you're using a Bedrock model ID")
  }
}
```</action>

  <verify>grep -n "authMode\|hasAwsCredentials\|ANTHROPIC_API_KEY" src/main/lib/trpc/routers/claude.ts shows the auth mode logic</verify>
  <done>Claude router now supports OAuth, AWS Credentials, and API Key auth modes</done>
</task>

<task type="auto">
  <name>Task 4: Add Bedrock region selector to settings</name>
  <files>src/main/lib/db/schema/index.ts, src/main/lib/trpc/routers/claude-settings.ts, src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx</files>

  <action>First, add a `bedrockRegion` field to the schema (after `authMode` in schema/index.ts):
```typescript
bedrockRegion: text("bedrock_region").notNull().default("us-east-1"), // AWS region for Bedrock
```

Then add to the router and UI to expose this setting. The UI should show a region selector dropdown when AWS mode is selected, with options like:
- us-east-1 (default)
- us-west-2
- eu-central-1
- eu-west-2
- ap-southeast-1
- ap-southeast-2

For now, we'll add a simple text input that the user can type the region into. In a future enhancement, this could be a dropdown selector.</action>

  <verify>grep -n "bedrockRegion" src/main/lib/db/schema/index.ts shows the new field</verify>
  <done>Bedrock region selector added to settings and UI</done>
</task>

<task type="auto">
  <name>Task 5: Add credential selector and API key input to Claude Code settings UI</name>
  <files>src/renderer/features/agents/components/settings-tabs/agents-claude-settings-tab.tsx</files>

  <action>In the Claude Code settings tab, add a credential selector at the top (before connection status):

1. Add state for the auth mode selector:
```typescript
const [authMode, setAuthMode] = useState<"oauth" | "aws" | "apiKey">("oauth")
const [apiKey, setApiKey] = useState("")
```

2. Add state for Bedrock region (if we added it to the schema and router):
```typescript
const [bedrockRegion, setBedrockRegion] = useState("us-east-1")
```

3. Add the UI selector (connection status section, before the "Connected/Not connected" display):
```typescript
{/* Auth Mode Selector */}
<div className="space-y-3 mb-4">
  <Label className="text-sm font-medium">Authentication Mode</Label>
  <div className="flex gap-2">
    <Button
      variant={authMode === "oauth" ? "default" : "outline"}
      onClick={() => setAuthMode("oauth")}
      className="flex-1"
    >
      OAuth
    </Button>
    <Button
      variant={authMode === "aws" ? "default" : "outline"}
      onClick={() => setAuthMode("aws")}
      className="flex-1"
    >
      AWS Bedrock
    </Button>
    <Button
      variant={authMode === "apiKey" ? "default" : "outline"}
      onClick={() => setAuthMode("apiKey")}
      className="flex-1"
    >
      API Key
    </Button>
  </div>

  {/* API Key Input - only show in apiKey mode */}
  {authMode === "apiKey" && (
    <div className="space-y-2">
      <Label className="text-sm">Anthropic API Key</Label>
      <Input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-ant-api03-..."
        className="font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Your API key is encrypted and stored locally. Only used when API Key mode is selected.
      </p>
    </div>
  )}

  {/* Bedrock Region Selector - only show in aws mode */}
  {authMode === "aws" && (
    <div className="space-y-2">
      <Label className="text-sm">Bedrock Region</Label>
      <Input
        value={bedrockRegion}
        onChange={(e) => setBedrockRegion(e.target.value)}
        placeholder="us-east-1"
        className="font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        AWS region for Bedrock (e.g., us-east-1, eu-central-1)
      </p>
    </div>
  )}

  {/* Update Save Settings button to include auth mode and API key */}
  <Button
    onClick={() => {
      updateSettings.mutate({
        authMode,
        ...(authMode === "apiKey" && { apiKey: apiKey || null }),
        customBinaryPath: customBinaryPath || null,
        customEnvVars: parseEnvVars(envVarsText),
      })
      toast.success("Settings saved")
    }}
    disabled={updateSettings.isPending}
  >
    {updateSettings.isPending && (
      <IconSpinner className="h-4 w-4 mr-2" />
    )}
    Save Settings
  </Button>
```

4. Update the "Connect Claude Code" button to respect the selected mode (around line 234-245):
```typescript
{/* Show connection UI only for OAuth mode */}
{authMode === "oauth" && (
  <>
    {/* Existing connection status UI */}
  </>
)}

{/* For AWS and API Key modes, show different messaging */}
{authMode === "aws" && (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
        <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          AWS Bedrock Ready
        </p>
        <p className="text-xs text-muted-foreground">
          Using AWS Credentials from environment or ~/.aws/credentials
        </p>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">
      Note: Ensure you have AWS credentials configured (env vars or ~/.aws/credentials file)
    </p>
  </div>
)}

{authMode === "apiKey" && apiKey && (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          API Key Ready
        </p>
        <p className="text-xs text-muted-foreground">
          Using provided API key (encrypted storage)
        </p>
      </div>
    </div>
  </div>
)}

{authMode === "apiKey" && !apiKey && (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <X className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        Enter an API key to continue
      </p>
    </div>
  </div>
)}
```</action>

  <verify>grep -n "authMode.*oauth.*aws.*apiKey\|Bedrock Region" src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx shows the credential selector and inputs</verify>
  <done>UI updated with auth mode selector, API key input, and Bedrock region selector</done>
</task>

<task type="auto">
  <name>Task 6: Generate and apply database migration</name>
<files>drizzle/</files>

  <action>Generate the Drizzle migration for the new authMode, apiKey, and bedrockRegion fields:

1. Run: `bun run db:generate`
2. Verify the migration adds `auth_mode`, `api_key`, and `bedrock_region` columns
3. Run: `bun run db:push` to apply the schema changes

This updates the `claude_code_settings` table with the new columns.</action>

  <verify>sqlite3 ~/Library/Application\ Support/Agents\ Dev/data/agents.db ".schema claude_code_settings" shows auth_mode, api_key, and bedrock_region columns</verify>
  <done>Database migration generated and applied, new columns exist in claude_code_settings table</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] Schema includes authMode, apiKey, and bedrockRegion fields
- [ ] Router handles all three auth modes (oauth, aws, apiKey)
- [ ] Claude router detects AWS credentials automatically
- [ ] UI has credential selector with OAuth/AWS/API Key options
- [ ] API key is encrypted using safeStorage
- [ ] Migration generated and applied successfully
- [ ] TypeScript compilation passes
</verification>

<success_criteria>

- Users can select between OAuth, AWS Bedrock, and API Key modes
- API keys are encrypted before storage
- AWS credentials are detected from env vars or ~/.aws/credentials
- Bedrock region can be configured
- Settings persist in SQLite database
- App works with all three authentication methods
  </success_criteria>

<output>
After completion, create `.planning/phases/03-claude-settings/03-claude-settings-03-SUMMARY.md` with:
- Database schema changes (authMode, apiKey, bedrockRegion)
- Router changes for multiple auth modes
- Claude router integration
- UI changes (credential selector, API key input, Bedrock region selector)
- Migration details
</output>
