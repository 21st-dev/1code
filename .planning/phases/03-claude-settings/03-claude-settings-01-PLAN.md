---
phase: 03-claude-settings
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/lib/db/schema/index.ts
  - src/main/lib/trpc/routers/claude-settings.ts
  - src/main/lib/trpc/routers/index.ts
  - src/main/lib/trpc/routers/claude.ts
  - src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx
autonomous: true
---

<objective>
Add configurable Claude Code binary path and custom environment variables support.

Purpose: Users need to override the bundled Claude Code binary (e.g., use a local build) and set custom environment variables that affect Claude's settings.json behavior. Currently, the binary path is hardcoded to the bundled executable, and there's no way to inject custom env vars.

Output:
- Database table for storing Claude Code settings (custom binary path, env vars)
- tRPC endpoints for reading/updating settings
- Claude router respects custom binary path and env vars
- UI for configuring these settings
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/main/lib/db/schema/index.ts
@src/main/lib/trpc/routers/claude.ts
@src/main/lib/claude/env.ts
@src/main/lib/trpc/routers/index.ts
@src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx
@.planning/phases/01-remove-auth/01-remove-auth-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add claudeCodeSettings table to database schema</name>
  <files>src/main/lib/db/schema/index.ts</files>
  <action>Add a new table `claudeCodeSettings` after the `claudeCodeCredentials` table definition (around line 100):

```typescript
// ============ CLAUDE CODE SETTINGS ============
// Stores user-configurable Claude Code binary and environment settings
export const claudeCodeSettings = sqliteTable("claude_code_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  customBinaryPath: text("custom_binary_path"), // Path to user-specified Claude binary (null = use bundled)
  customEnvVars: text("custom_env_vars").notNull().default("{}"), // JSON object of custom env vars
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})
```

Also add the type exports at the bottom:
```typescript
export type ClaudeCodeSettings = typeof claudeCodeSettings.$inferSelect
export type NewClaudeCodeSettings = typeof claudeCodeSettings.$inferInsert
```

And export from the module:
```typescript
export {
  projects,
  chats,
  subChats,
  claudeCodeCredentials,
  claudeCodeSettings,  // Add this
}
```</action>
  <verify>grep -n "claudeCodeSettings" src/main/lib/db/schema/index.ts shows table definition and export</verify>
  <done>Database schema includes claudeCodeSettings table with customBinaryPath and customEnvVars fields</done>
</task>

<task type="auto">
  <name>Task 2: Create claude-settings tRPC router</name>
  <files>src/main/lib/trpc/routers/claude-settings.ts</files>
  <action>Create a new router file `src/main/lib/trpc/routers/claude-settings.ts`:

```typescript
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeSettings } from "../../db"
import { eq } from "drizzle-orm"

/**
 * Parse JSON safely with fallback
 */
function parseJsonSafely<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export const claudeSettingsRouter = router({
  /**
   * Get Claude Code settings (always returns a record, creates default if missing)
   */
  getSettings: publicProcedure.query(() => {
    const db = getDatabase()
    let settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    // Create default settings if not exist
    if (!settings) {
      db.insert(claudeCodeSettings)
        .values({
          id: "default",
          customBinaryPath: null,
          customEnvVars: "{}",
        })
        .run()
      settings = {
        id: "default",
        customBinaryPath: null,
        customEnvVars: "{}",
        updatedAt: new Date(),
      }
    }

    return {
      customBinaryPath: settings.customBinaryPath,
      customEnvVars: parseJsonSafely<Record<string, string>>(
        settings.customEnvVars,
        {}
      ),
    }
  }),

  /**
   * Update Claude Code settings
   */
  updateSettings: publicProcedure
    .input(
      z.object({
        customBinaryPath: z.string().nullable().optional(),
        customEnvVars: z.record(z.string()).optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      // Check if settings exist
      const existing = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      if (existing) {
        // Update existing
        db.update(claudeCodeSettings)
          .set({
            ...(input.customBinaryPath !== undefined && {
              customBinaryPath: input.customBinaryPath,
            }),
            ...(input.customEnvVars !== undefined && {
              customEnvVars: JSON.stringify(input.customEnvVars),
            }),
            updatedAt: new Date(),
          })
          .where(eq(claudeCodeSettings.id, "default"))
          .run()
      } else {
        // Insert new
        db.insert(claudeCodeSettings)
          .values({
            id: "default",
            customBinaryPath: input.customBinaryPath ?? null,
            customEnvVars: JSON.stringify(input.customEnvVars ?? {}),
            updatedAt: new Date(),
          })
          .run()
      }

      return { success: true }
    }),
})
```</action>
  <verify>cat src/main/lib/trpc/routers/claude-settings.ts exists and has getSettings and updateSettings procedures</verify>
  <done>Created claude-settings router with getSettings and updateSettings procedures</done>
</task>

<task type="auto">
  <name>Task 3: Register claude-settings router and export from index</name>
  <files>src/main/lib/trpc/routers/index.ts</files>
  <action>In `src/main/lib/trpc/routers/index.ts`:

1. Add import near top:
```typescript
import { claudeSettingsRouter } from "./claude-settings"
```

2. Add to the appRouter object (around line 30-40):
```typescript
export const appRouter = router({
  // ... existing routers ...
  claudeSettings: claudeSettingsRouter,
})
```</action>
  <verify>grep -n "claudeSettings" src/main/lib/trpc/routers/index.ts shows import and router registration</verify>
  <done>claude-settings router is registered and exported</done>
</task>

<task type="auto">
  <name>Task 4: Update Claude router to use custom binary path and env vars</name>
  <files>src/main/lib/trpc/routers/claude.ts</files>
  <action>In `src/main/lib/trpc/routers/claude.ts`:

1. Add import near top with other db imports:
```typescript
import { claudeCodeSettings } from "../../db"
```

2. Create a helper function after `getClaudeCodeToken()` (around line 103):
```typescript
/**
 * Get Claude Code custom settings (binary path, env vars)
 */
function getClaudeCodeSettings(): {
  customBinaryPath: string | null
  customEnvVars: Record<string, string>
} {
  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (!settings) {
      return { customBinaryPath: null, customEnvVars: {} }
    }

    const customEnvVars = settings.customEnvVars
      ? JSON.parse(settings.customEnvVars)
      : {}

    return {
      customBinaryPath: settings.customBinaryPath,
      customEnvVars,
    }
  } catch (error) {
    console.error("[claude] Error getting Claude Code settings:", error)
    return { customBinaryPath: null, customEnvVars: {} }
  }
}
```

3. Update the `pathToClaudeCodeExecutable` assignment (around line 548):
Replace:
```typescript
const claudeBinaryPath = getBundledClaudeBinaryPath()
```
With:
```typescript
// Get user's custom binary path or use bundled binary
const { customBinaryPath } = getClaudeCodeSettings()
const claudeBinaryPath = customBinaryPath || getBundledClaudeBinaryPath()
```

4. Update the `finalEnv` construction to include custom env vars (around line 421-428):
Replace:
```typescript
// Build final env - only add OAuth token if we have one
const finalEnv = {
  ...claudeEnv,
  ...(claudeCodeToken && {
    CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
  }),
  // Isolate Claude's config/session storage per subChat
  CLAUDE_CONFIG_DIR: isolatedConfigDir,
}
```
With:
```typescript
// Get custom env vars from settings
const { customEnvVars } = getClaudeCodeSettings()

// Build final env - only add OAuth token if we have one
const finalEnv = {
  ...claudeEnv,
  ...customEnvVars, // User-configured env vars (e.g., for Claude settings.json)
  ...(claudeCodeToken && {
    CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
  }),
  // Isolate Claude's config/session storage per subChat
  CLAUDE_CONFIG_DIR: isolatedConfigDir,
}
```</action>
  <verify>grep -n "getClaudeCodeSettings\|customBinaryPath\|customEnvVars" src/main/lib/trpc/routers/claude.ts shows the settings integration</verify>
  <done>Claude router reads and applies custom binary path and env vars from settings</done>
</task>

<task type="auto">
  <name>Task 5: Add Advanced Settings UI to Claude Code settings tab</name>
  <files>src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx</files>
  <action>In `src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx`:

1. Add new tRPC query hook after the `getIntegration` query (around line 46):
```typescript
// Query Claude Code settings
const {
  data: claudeSettings,
  isLoading: settingsLoading,
  refetch: refetchSettings,
} = trpc.claudeSettings.getSettings.useQuery()
```

2. Add update settings mutation after the disconnect mutation (around line 102):
```typescript
// Update settings mutation
const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
  onSuccess: () => {
    toast.success("Settings saved")
    refetchSettings()
  },
  onError: (error) => {
    toast.error(error.message || "Failed to save settings")
  },
})
```

3. Add state for the settings form (after existing state declarations around line 36):
```typescript
const [settingsExpanded, setSettingsExpanded] = useState(false)
const [customBinaryPath, setCustomBinaryPath] = useState("")
const [envVarsText, setEnvVarsText] = useState("")
```

4. Add effect to sync form with settings data (after the auth flow effect around line 122):
```typescript
// Sync form with settings
useEffect(() => {
  if (claudeSettings) {
    setCustomBinaryPath(claudeSettings.customBinaryPath || "")
    setEnvVarsText(
      Object.entries(claudeSettings.customEnvVars)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") || ""
    )
  }
}, [claudeSettings])
```

5. Add a helper function to parse env vars (before return statement):
```typescript
const parseEnvVars = (text: string): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      if (key) {
        result[key] = value
      }
    }
  }
  return result
}
```

6. Add the "Advanced Settings" section after the main content div (before the closing tag around line 350):
```typescript
        {/* Advanced Settings Section */}
        {isConnected && (
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm font-medium">Advanced Settings</span>
              <span className="text-muted-foreground">
                {settingsExpanded ? "▼" : "▶"}
              </span>
            </button>
            {settingsExpanded && (
              <div className="p-4 pt-0 space-y-4 border-t border-border">
                {/* Custom Binary Path */}
                <div className="space-y-2">
                  <Label className="text-sm">Custom Claude Binary Path</Label>
                  <Input
                    value={customBinaryPath}
                    onChange={(e) => setCustomBinaryPath(e.target.value)}
                    placeholder="/usr/local/bin/claude or leave empty for bundled"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the bundled Claude binary. Specify an absolute path to use your own build.
                  </p>
                </div>

                {/* Custom Environment Variables */}
                <div className="space-y-2">
                  <Label className="text-sm">Custom Environment Variables</Label>
                  <textarea
                    value={envVarsText}
                    onChange={(e) => setEnvVarsText(e.target.value)}
                    placeholder="ANTHROPIC_MODEL=claude-sonnet-4-5-20250514&#10;CLAUDE_DEFAULT_MODEL=claude-sonnet-4-5-20250514"
                    className="w-full min-h-[100px] p-2 text-sm font-mono bg-muted rounded-md border border-border resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    One variable per line in KEY=VALUE format. These affect Claude's settings.json behavior.
                  </p>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      updateSettings.mutate({
                        customBinaryPath: customBinaryPath || null,
                        customEnvVars: parseEnvVars(envVarsText),
                      })
                    }}
                    disabled={updateSettings.isPending}
                  >
                    {updateSettings.isPending && (
                      <IconSpinner className="h-4 w-4 mr-2" />
                    )}
                    Save Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
```

Note: The Advanced Settings section should only show when connected.</action>
  <verify>grep -n "Advanced Settings\|claudeSettings\|updateSettings" src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx shows the new UI and hooks</verify>
  <done>Advanced Settings UI added with custom binary path and env vars configuration</done>
</task>

<task type="auto">
  <name>Task 6: Generate and run database migration</name>
  <files>drizzle/</files>
  <action>Generate the Drizzle migration for the new claudeCodeSettings table:

1. Run: `bun run db:generate`
2. Verify the migration file was created in `drizzle/` with the new table
3. Run: `bun run db:push` to apply the schema changes

This creates the claude_code_settings table in the SQLite database.</action>
  <verify>sqlite3 ~/Library/Application\ Support/Agents\ Dev/data/agents.db ".schema claude_code_settings" shows the table schema</verify>
  <done>Database migration created and applied, claude_code_settings table exists</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] Schema includes claudeCodeSettings table
- [ ] tRPC router created and registered (claudeSettings.getSettings, claudeSettings.updateSettings)
- [ ] Claude router reads and applies custom binary path and env vars
- [ ] UI for Advanced Settings exists and is functional
- [ ] Migration generated and applied successfully
- [ ] TypeScript compilation passes: bun run ts:check
</verification>

<success_criteria>

- Users can specify a custom Claude Code binary path in Advanced Settings
- Users can define custom environment variables that are passed to Claude
- Settings persist in SQLite database
- Custom binary and env vars are respected when executing prompts
- UI allows editing and saving these settings
  </success_criteria>

<output>
After completion, create `.planning/phases/03-claude-settings/03-claude-settings-01-SUMMARY.md` with:
- Database schema added (claudeCodeSettings table)
- tRPC endpoints created (getSettings, updateSettings)
- Claude router integration (customBinaryPath, customEnvVars)
- UI changes (Advanced Settings section)
- Migration details
</output>
