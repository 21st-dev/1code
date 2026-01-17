---
phase: 01-remove-auth
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/index.ts
  - src/main/windows/main.ts
  - src/preload/index.ts
  - src/renderer/App.tsx
  - src/renderer/features/layout/agents-layout.tsx
  - src/renderer/components/dialogs/claude-login-modal.tsx
  - src/main/lib/analytics.ts
  - package.json
autonomous: true
---

<objective>
Remove entire authentication flow from the desktop application.

Purpose: Simplify the app to work without requiring 21st.dev account authentication. The app should launch directly into the main interface.

Output: Clean codebase with no auth-related code, login UI, or OAuth dependencies.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/STRUCTURE.md
@src/main/index.ts
@src/main/auth-manager.ts
@src/main/auth-store.ts
@src/main/windows/main.ts
@src/preload/index.ts
@src/renderer/App.tsx
@src/renderer/features/layout/agents-layout.tsx
@src/renderer/components/dialogs/claude-login-modal.tsx
@src/main/lib/analytics.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete auth source files</name>
  <files>src/main/auth-manager.ts,src/main/auth-store.ts,src/renderer/login.html,src/renderer/components/dialogs/claude-login-modal.tsx</files>
  <action>Delete these four files entirely - they are only used for authentication:
- src/main/auth-manager.ts (OAuth flow, token refresh)
- src/main/auth-store.ts (Encrypted credential storage)
- src/renderer/login.html (Login page HTML)
- src/renderer/components/dialogs/claude-login-modal.tsx (Login modal component)

Also check for and remove any imports of these files before deletion to avoid TypeScript errors.</action>
  <verify>Files do not exist: test -f src/main/auth-manager.ts returns non-zero</verify>
  <done>All auth-specific source files deleted</done>
</task>

<task type="auto">
  <name>Task 2: Remove auth from main process index.ts</name>
  <files>src/main/index.ts</files>
  <action>Remove all auth-related code from src/main/index.ts:

1. Remove imports: AuthManager, auth-related analytics (trackAuthCompleted)
2. Remove functions: handleAuthCode(), handleDeepLink()
3. Remove variables: authManager, PROTOCOL constant
4. Remove protocol registration (registerProtocol function calls)
5. Remove dev mode HTTP server for auth callback (createServer block)
6. Remove auth manager initialization (new AuthManager call)
7. Remove user identification via auth in analytics (identify() call with user)
8. Remove token refresh callback setup (setOnTokenRefresh)
9. Remove deep link handling in second-instance handler
10. Remove open-url event handler for auth deep links
11. Remove FAVICON-related HTML (used only for auth callback page)

Keep: getBaseUrl() function (may be used elsewhere), getAppUrl() function</action>
  <verify>grep -i "auth\|protocol\|deep.*link\|handleAuth" src/main/index.ts returns no results</verify>
  <done>src/main/index.ts has no auth-related code</done>
</task>

<task type="auto">
  <name>Task 3: Remove auth from window management</name>
  <files>src/main/windows/main.ts</files>
  <action>Remove all auth-related code from src/main/windows/main.ts:

1. Remove imports from ../index that are auth-only: getAuthManager, handleAuthCode, getBaseUrl (if only used for auth)
2. Remove IPC handlers (lines 131-191 approx):
   - auth:get-user
   - auth:is-authenticated
   - auth:logout
   - auth:start-flow
   - auth:submit-code
   - auth:update-user
3. Remove validateSender() function (only used for auth)
4. Remove showLoginPage() function entirely
5. Modify createMainWindow() to ALWAYS load the main app (remove auth check)
6. Remove session import if only used for auth cookie clearing
7. Keep window controls, clipboard, analytics, shell, and other non-auth handlers

The window should now always load index.html (or dev server URL) without checking auth state.</action>
  <verify>grep -i "auth\|login\|validateSender" src/main/windows/main.ts returns no results</verify>
  <done>Window management has no auth code, always loads main app</done>
</task>

<task type="auto">
  <name>Task 4: Remove auth from preload bridge</name>
  <files>src/preload/index.ts</files>
  <action>Remove all auth methods from src/preload/index.ts:

1. Remove from desktopApi exposure:
   - getUser
   - isAuthenticated
   - logout
   - startAuthFlow
   - submitAuthCode
   - updateUser
2. Remove from desktopApi:
   - onAuthSuccess
   - onAuthError
3. Remove from DesktopApi interface type definition:
   - All auth method signatures
   - Auth event listener signatures

Keep: window controls, update methods, clipboard, analytics, shortcuts, and all other non-auth APIs.</action>
  <verify>grep -i "auth" src/preload/index.ts returns no results</verify>
  <done>Preload bridge exposes no auth methods</done>
</task>

<task type="auto">
  <name>Task 5: Remove auth from renderer App.tsx</name>
  <files>src/renderer/App.tsx</files>
  <action>Remove auth-based user identification from src/renderer/App.tsx:

1. Remove the identifyUser() function and its call (lines 91-101)
2. Simplify analytics initialization to not identify via auth
3. Keep the rest of the app structure intact

The app should initialize analytics without user identification (or use a local ID if needed).</action>
  <verify>grep -i "auth\|getUser\|identify" src/renderer/App.tsx returns no results (excluding imports/identifiers)</verify>
  <done>App.tsx no longer identifies users via auth</done>
</task>

<task type="auto">
  <name>Task 6: Remove auth from agents layout</name>
  <files>src/renderer/features/layout/agents-layout.tsx</files>
  <action>Remove auth-related code from src/renderer/features/layout/agents-layout.tsx:

1. Remove ClaudeLoginModal import
2. Remove any user fetching via window.desktopApi.getUser()
3. Remove login modal rendering/state
4. Remove auth-based conditional rendering

Keep all other layout functionality intact.</action>
  <verify>grep -i "auth\|login\|getUser" src/renderer/features/layout/agents-layout.tsx returns no results</verify>
  <done>Agents layout has no auth code</done>
</task>

<task type="auto">
  <name>Task 7: Update package.json to remove protocol scheme</name>
  <files>package.json</files>
  <action>Remove the protocol schemes from package.json build.protocols section:

Look for "protocols" or "schemes" under build configuration and remove:
- twentyfirst-agents
- twentyfirst-agents-dev

These are only needed for OAuth deep links.</action>
  <verify>grep -i "protocol\|scheme" package.json returns no auth-related results</verify>
  <done>package.json has no protocol schemes for auth</done>
</task>

<task type="auto">
  <name>Task 8: Clean up analytics if needed</name>
  <files>src/main/lib/analytics.ts</files>
  <action>Check src/main/lib/analytics.ts for auth dependencies:

If identify() function requires auth user parameters, modify it to work without auth:
- Make user parameters optional
- Generate a local anonymous ID if needed
- Or remove identify() entirely if not needed

Keep: trackAppOpened, setOptOut, and other non-auth analytics.</action>
  <verify>tsc --noEmit succeeds (no type errors in analytics usage)</verify>
  <done>Analytics works without auth dependencies</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] App builds successfully: bun run build
- [ ] App launches directly to main interface (no login page)
- [ ] No TypeScript errors
- [ ] No runtime errors related to undefined auth functions
- [ ] grep -r "authManager\|auth-store\|auth-manager" src/ returns no results
- [ ] grep -r "desktopApi.*auth\|startAuthFlow\|getUser" src/renderer/ returns no auth API usage
</verification>

<success_criteria>

- All auth source files deleted
- Main process boots without auth initialization
- Window loads main app directly (no login redirect)
- Preload exposes no auth methods
- Renderer has no auth API calls
- Protocol schemes removed from package.json
- App builds and runs without errors
  </success_criteria>

<output>
After completion, create `.planning/phases/01-remove-auth/01-remove-auth-SUMMARY.md` with:
- Files deleted (4 files)
- Files modified (8 files)
- Any issues encountered
- Verification that app launches directly to main interface
</output>
