# System Tray Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent system tray support with quick access to profiles and workspaces, allowing the app to continue running when all windows are closed.

**Architecture:** Use Electron's `Tray` API to create a system tray icon with dynamic context menu. Modify app lifecycle to prevent quit on window close. Add IPC handlers for profile switching and workspace navigation from tray menu.

**Tech Stack:** Electron Tray API, IPC (main ↔ renderer), existing tRPC for data fetching

---

## Task 1: Setup System Tray Infrastructure

**Files:**
- Create: `src/main/lib/tray.ts`
- Modify: `src/main/index.ts`

**Step 1: Create tray module with basic initialization**

Create `src/main/lib/tray.ts`:

```typescript
import { app, Menu, Tray, nativeImage } from "electron"
import { join } from "path"
import { IS_DEV } from "../constants"

let tray: Tray | null = null

/**
 * Get path to tray icon based on platform and theme
 * Returns template image for macOS (auto-adapts to light/dark mode)
 */
function getTrayIconPath(): string {
  const iconName = process.platform === "darwin" 
    ? "tray-iconTemplate.png"  // macOS template (auto dark mode)
    : "tray-icon.png"           // Windows/Linux

  if (IS_DEV) {
    return join(app.getAppPath(), "resources", "icons", iconName)
  }
  return join(process.resourcesPath, "icons", iconName)
}

/**
 * Initialize system tray
 * Should be called after app is ready
 */
export function initTray(): void {
  if (tray) {
    console.log("[Tray] Already initialized")
    return
  }

  const iconPath = getTrayIconPath()
  console.log("[Tray] Creating tray with icon:", iconPath)

  tray = new Tray(iconPath)
  tray.setToolTip("1Code")

  // Build initial menu
  buildTrayMenu()

  console.log("[Tray] Initialized successfully")
}

/**
 * Build and set the tray context menu
 * Called on init and whenever menu needs to update
 */
export function buildTrayMenu(): void {
  if (!tray) {
    console.warn("[Tray] Cannot build menu - tray not initialized")
    return
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Quit",
      click: () => {
        app.quit()
      },
    },
  ]

  const contextMenu = Menu.buildFromTemplate(template)
  tray.setContextMenu(contextMenu)
}

/**
 * Destroy the tray icon
 * Should be called on app quit
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    console.log("[Tray] Destroyed")
  }
}

/**
 * Get the tray instance (for testing or advanced use)
 */
export function getTray(): Tray | null {
  return tray
}
```

**Step 2: Add tray initialization to main process**

Modify `src/main/index.ts` - add import at top:

```typescript
import { initTray, destroyTray } from "./lib/tray"
```

**Step 3: Initialize tray after app ready**

In `src/main/index.ts`, find the `app.whenReady()` section (around line 548) and add after menu initialization (after line 804):

```typescript
    // Initialize system tray
    initTray()
```

**Step 4: Cleanup tray on quit**

In `src/main/index.ts`, find the `app.on("before-quit")` handler or add one if it doesn't exist:

```typescript
// Clean up before quit
app.on("before-quit", () => {
  console.log("[App] before-quit event")
  destroyTray()
})
```

**Step 5: Test basic tray initialization**

Run: `pnpm dev`
Expected: App starts with tray icon visible in menu bar (macOS) or system tray (Windows/Linux). Right-click shows "Quit" menu item.

**Step 6: Commit**

```bash
git add src/main/lib/tray.ts src/main/index.ts
git commit -m "feat: add basic system tray infrastructure"
```

---

## Task 2: Add Tray Icon Assets

**Files:**
- Create: `resources/icons/tray-icon.png`
- Create: `resources/icons/tray-iconTemplate.png`
- Create: `resources/icons/[email protected]`
- Create: `resources/icons/tray-iconTemplate@2x.png`

**Step 1: Create placeholder tray icons**

Since you have an existing icon system, we'll use a simple approach:

For macOS template icon (auto dark mode support):
- `tray-iconTemplate.png` - 16x16px, monochrome, black on transparent
- `tray-iconTemplate@2x.png` - 32x32px, monochrome, black on transparent

For Windows/Linux:
- `tray-icon.png` - 16x16px, colored
- `[email protected]` - 32x32px, colored

**Note:** You can use your existing app icon scaled down and converted to monochrome for the template icons. The "Template" suffix is required for macOS dark mode support.

**Step 2: Test icons appear correctly**

Run: `pnpm dev`
Expected: Tray icon visible and sized correctly on current platform

**Step 3: Commit**

```bash
git add resources/icons/tray-*.png
git commit -m "feat: add tray icon assets for all platforms"
```

---

## Task 3: Prevent App Quit on Window Close

**Files:**
- Modify: `src/main/windows/main.ts`

**Step 1: View current window close handling**

View `src/main/windows/main.ts` to understand current window lifecycle.

**Step 2: Modify window close behavior to hide instead of quit**

In `src/main/windows/main.ts`, find where the window is created (in `createMainWindow` or similar). Add a `close` event handler to prevent app quit:

```typescript
// Prevent app quit when window closes - hide to tray instead
mainWindow.on("close", (event) => {
  if (!app.isQuitting) {
    event.preventDefault()
    mainWindow.hide()
    console.log("[Window] Hidden to tray (prevented quit)")
  }
})
```

**Step 3: Add app quit flag**

In `src/main/index.ts`, add flag to track intentional quits. Add near the top after imports:

```typescript
// Track when app is intentionally quitting (vs just closing windows)
let isQuitting = false

// Make it accessible globally
;(global as any).__isAppQuitting = () => isQuitting
```

**Step 4: Set quit flag in before-quit handler**

Modify the `before-quit` handler in `src/main/index.ts`:

```typescript
app.on("before-quit", () => {
  console.log("[App] before-quit event")
  isQuitting = true
  ;(global as any).__isAppQuitting = () => true
  destroyTray()
  // ... existing cleanup
})
```

**Step 5: Update window close handler to use global flag**

In `src/main/windows/main.ts`, modify the close handler:

```typescript
mainWindow.on("close", (event) => {
  const isQuitting = (global as any).__isAppQuitting?.() || false
  if (!isQuitting) {
    event.preventDefault()
    mainWindow.hide()
    console.log("[Window] Hidden to tray (prevented quit)")
  }
})
```

**Step 6: Test window close behavior**

Run: `pnpm dev`
Actions:
1. Close main window (Cmd+W or close button)
2. Verify app still running (tray icon visible)
3. Right-click tray → Quit
4. Verify app quits completely

**Step 7: Commit**

```bash
git add src/main/windows/main.ts src/main/index.ts
git commit -m "feat: prevent app quit on window close, hide to tray"
```

---

## Task 4: Add Tray Click to Restore Window

**Files:**
- Modify: `src/main/lib/tray.ts`

**Step 1: Add window restore logic on tray click**

In `src/main/lib/tray.ts`, add import for window management:

```typescript
import { getWindow, getAllWindows, createMainWindow } from "../windows/main"
```

**Step 2: Add click handler in initTray**

In the `initTray()` function, after creating the tray, add:

```typescript
  // Left-click: restore or create window
  tray.on("click", () => {
    console.log("[Tray] Click event - restoring window")
    
    const windows = getAllWindows()
    if (windows.length > 0) {
      // Show and focus first window
      const window = windows[0]!
      if (window.isMinimized()) {
        window.restore()
      }
      window.show()
      window.focus()
    } else {
      // No windows exist, create new one
      createMainWindow()
    }
  })
```

**Step 3: Handle double-click on Windows**

Add after the click handler:

```typescript
  // Double-click on Windows also shows window
  tray.on("double-click", () => {
    console.log("[Tray] Double-click event - restoring window")
    
    const windows = getAllWindows()
    if (windows.length > 0) {
      const window = windows[0]!
      if (window.isMinimized()) {
        window.restore()
      }
      window.show()
      window.focus()
    } else {
      createMainWindow()
    }
  })
```

**Step 4: Test tray click behavior**

Run: `pnpm dev`
Actions:
1. Close window (hides to tray)
2. Click tray icon
3. Verify window reappears and is focused

**Step 5: Commit**

```bash
git add src/main/lib/tray.ts
git commit -m "feat: restore window on tray icon click"
```

---

## Task 5: Add IPC Handler for Profile Data

**Files:**
- Create: `src/main/lib/ipc/tray-handlers.ts`
- Modify: `src/main/index.ts`

**Step 1: Create IPC handlers for tray menu data**

Create `src/main/lib/ipc/tray-handlers.ts`:

```typescript
import { ipcMain } from "electron"
import { getDatabase } from "../db"
import { modelProfiles } from "../db/schema"
import { projects } from "../db/schema"

/**
 * Register IPC handlers for tray menu data fetching
 */
export function registerTrayHandlers(): void {
  // Get all profiles for tray menu
  ipcMain.handle("tray:get-profiles", async () => {
    try {
      const db = getDatabase()
      const allProfiles = db.select().from(modelProfiles).all()
      
      // Also get active profile ID from localStorage
      // Note: We'll need to get this from renderer via another call
      return allProfiles
    } catch (error) {
      console.error("[Tray] Failed to get profiles:", error)
      return []
    }
  })

  // Get all projects/workspaces for tray menu
  ipcMain.handle("tray:get-projects", async () => {
    try {
      const db = getDatabase()
      const allProjects = db.select().from(projects).all()
      return allProjects
    } catch (error) {
      console.error("[Tray] Failed to get projects:", error)
      return []
    }
  })

  // Get active profile ID (from renderer localStorage)
  ipcMain.handle("tray:get-active-profile-id", async (event) => {
    try {
      // Execute JS in renderer to get localStorage value
      const result = await event.sender.executeJavaScript(
        `localStorage.getItem('agents:active-profile-id')`
      )
      return result ? JSON.parse(result) : null
    } catch (error) {
      console.error("[Tray] Failed to get active profile:", error)
      return null
    }
  })

  console.log("[Tray] IPC handlers registered")
}
```

**Step 2: Register handlers in main process**

In `src/main/index.ts`, add import:

```typescript
import { registerTrayHandlers } from "./lib/ipc/tray-handlers"
```

**Step 3: Call registration in app ready**

In the `app.whenReady()` section, after database initialization:

```typescript
    // Register tray IPC handlers
    registerTrayHandlers()
```

**Step 4: Test IPC handlers (manual console test)**

In renderer devtools console:
```javascript
await window.electronAPI.invoke('tray:get-profiles')
await window.electronAPI.invoke('tray:get-projects')
```

Expected: Returns arrays of profiles and projects

**Step 5: Commit**

```bash
git add src/main/lib/ipc/tray-handlers.ts src/main/index.ts
git commit -m "feat: add IPC handlers for tray menu data"
```

---

## Task 6: Build Dynamic Tray Menu with Profiles

**Files:**
- Modify: `src/main/lib/tray.ts`
- Modify: `src/main/lib/ipc/tray-handlers.ts`

**Step 1: Add async menu building with profile data**

In `src/main/lib/tray.ts`, modify `buildTrayMenu` to be async and fetch data:

```typescript
/**
 * Build and set the tray context menu
 * Fetches current profiles and projects from database
 */
export async function buildTrayMenu(): Promise<void> {
  if (!tray) {
    console.warn("[Tray] Cannot build menu - tray not initialized")
    return
  }

  try {
    // Fetch profiles and active profile ID
    const db = getDatabase()
    const allProfiles = db.select().from(modelProfiles).all()
    
    // Get active profile from first window's localStorage
    let activeProfileId: string | null = null
    const windows = getAllWindows()
    if (windows.length > 0) {
      try {
        const result = await windows[0]!.webContents.executeJavaScript(
          `localStorage.getItem('agents:active-profile-id')`
        )
        activeProfileId = result ? JSON.parse(result) : null
      } catch (e) {
        console.warn("[Tray] Could not get active profile:", e)
      }
    }

    // Build profile menu items
    const profileMenuItems: Electron.MenuItemConstructorOptions[] = allProfiles.map(profile => ({
      label: profile.name,
      type: "checkbox",
      checked: profile.id === activeProfileId,
      click: () => {
        handleProfileSwitch(profile.id)
      },
    }))

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "Profiles",
        submenu: profileMenuItems.length > 0 
          ? profileMenuItems
          : [{ label: "No profiles", enabled: false }],
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit()
        },
      },
    ]

    const contextMenu = Menu.buildFromTemplate(template)
    tray.setContextMenu(contextMenu)
  } catch (error) {
    console.error("[Tray] Failed to build menu:", error)
  }
}
```

**Step 2: Add imports for database access**

At the top of `src/main/lib/tray.ts`:

```typescript
import { getDatabase } from "../db"
import { modelProfiles, projects } from "../db/schema"
import { getAllWindows } from "../windows/main"
```

**Step 3: Add profile switch handler**

In `src/main/lib/tray.ts`, add the handler function:

```typescript
/**
 * Handle profile switch from tray menu
 * Updates localStorage in all windows and reloads them
 */
async function handleProfileSwitch(profileId: string): Promise<void> {
  console.log("[Tray] Switching to profile:", profileId)
  
  const windows = getAllWindows()
  for (const window of windows) {
    try {
      if (window.isDestroyed()) continue
      
      // Update localStorage
      await window.webContents.executeJavaScript(
        `localStorage.setItem('agents:active-profile-id', '${JSON.stringify(profileId)}')`
      )
      
      // Reload window to apply new profile
      window.reload()
    } catch (error) {
      console.error("[Tray] Failed to switch profile for window:", error)
    }
  }
  
  // Rebuild menu to update checkmarks
  await buildTrayMenu()
}
```

**Step 4: Update initTray to use async buildTrayMenu**

Change the call in `initTray()`:

```typescript
  // Build initial menu (async, don't await)
  buildTrayMenu().catch(err => {
    console.error("[Tray] Failed to build initial menu:", err)
  })
```

**Step 5: Test profile switching from tray**

Run: `pnpm dev`
Actions:
1. Right-click tray icon
2. Click on Profiles submenu
3. Select different profile
4. Verify window reloads with new profile active

**Step 6: Commit**

```bash
git add src/main/lib/tray.ts
git commit -m "feat: add dynamic profile menu to tray"
```

---

## Task 7: Add Workspaces Menu to Tray

**Files:**
- Modify: `src/main/lib/tray.ts`

**Step 1: Add workspace menu items to buildTrayMenu**

In `buildTrayMenu()`, after fetching profiles, add project fetching:

```typescript
    // Fetch projects/workspaces
    const allProjects = db.select().from(projects).all()
    
    // Build workspace menu items
    const workspaceMenuItems: Electron.MenuItemConstructorOptions[] = allProjects.map(project => ({
      label: project.displayName || project.path,
      click: () => {
        handleWorkspaceClick(project.id)
      },
    }))
```

**Step 2: Add workspaces to menu template**

Update the template array:

```typescript
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "Profiles",
        submenu: profileMenuItems.length > 0 
          ? profileMenuItems
          : [{ label: "No profiles", enabled: false }],
      },
      { type: "separator" },
      {
        label: "Workspaces",
        submenu: workspaceMenuItems.length > 0 
          ? workspaceMenuItems
          : [{ label: "No workspaces", enabled: false }],
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit()
        },
      },
    ]
```

**Step 3: Add workspace click handler**

```typescript
/**
 * Handle workspace click from tray menu
 * Sets active workspace and opens new chat form
 */
async function handleWorkspaceClick(projectId: string): Promise<void> {
  console.log("[Tray] Opening workspace:", projectId)
  
  // Get or create main window
  let window = getWindow()
  if (!window) {
    window = await createMainWindow()
  }
  
  // Show and focus window
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
  
  // Set selected project in localStorage and trigger new chat
  try {
    await window.webContents.executeJavaScript(`
      (async () => {
        const project = ${JSON.stringify(projectId)};
        // Get project data
        const projectData = await window.trpcClient.projects.list.query();
        const selectedProject = projectData.find(p => p.id === project);
        if (selectedProject) {
          localStorage.setItem('agents:selected-project', JSON.stringify(selectedProject));
          // Trigger new chat form opening (send IPC to renderer)
          window.dispatchEvent(new CustomEvent('tray:open-workspace', { 
            detail: { projectId: project } 
          }));
        }
      })()
    `)
  } catch (error) {
    console.error("[Tray] Failed to open workspace:", error)
  }
}
```

**Step 4: Add renderer listener for workspace opening**

This will need renderer-side handling which we'll add in next task.

**Step 5: Test workspace menu**

Run: `pnpm dev`
Expected: Workspaces submenu shows all projects from database

**Step 6: Commit**

```bash
git add src/main/lib/tray.ts
git commit -m "feat: add workspaces menu to tray"
```

---

## Task 8: Add "New Workspace" and "Settings" Menu Items

**Files:**
- Modify: `src/main/lib/tray.ts`

**Step 1: Add menu items to template**

In `buildTrayMenu()`, update the template to include new items:

```typescript
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "Profiles",
        submenu: profileMenuItems.length > 0 
          ? profileMenuItems
          : [{ label: "No profiles", enabled: false }],
      },
      { type: "separator" },
      {
        label: "Workspaces",
        submenu: workspaceMenuItems.length > 0 
          ? workspaceMenuItems
          : [{ label: "No workspaces", enabled: false }],
      },
      { type: "separator" },
      {
        label: "New Workspace...",
        click: () => {
          handleNewWorkspace()
        },
      },
      {
        label: "Settings...",
        click: () => {
          handleOpenSettings()
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit()
        },
      },
    ]
```

**Step 2: Add New Workspace handler**

```typescript
/**
 * Handle "New Workspace" click
 * Opens select-repo-page
 */
async function handleNewWorkspace(): Promise<void> {
  console.log("[Tray] Opening new workspace dialog")
  
  // Get or create main window
  let window = getWindow()
  if (!window) {
    window = await createMainWindow()
  }
  
  // Show and focus window
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
  
  // Navigate to select-repo page by clearing selected project
  try {
    await window.webContents.executeJavaScript(`
      localStorage.removeItem('agents:selected-project');
      window.location.reload();
    `)
  } catch (error) {
    console.error("[Tray] Failed to open new workspace:", error)
  }
}
```

**Step 3: Add Settings handler**

```typescript
/**
 * Handle "Settings" click
 * Opens settings page
 */
async function handleOpenSettings(): Promise<void> {
  console.log("[Tray] Opening settings")
  
  // Get or create main window
  let window = getWindow()
  if (!window) {
    window = await createMainWindow()
  }
  
  // Show and focus window
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
  
  // Send custom event to open settings
  try {
    await window.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('tray:open-settings'));
    `)
  } catch (error) {
    console.error("[Tray] Failed to open settings:", error)
  }
}
```

**Step 4: Test new menu items**

Run: `pnpm dev`
Actions:
1. Right-click tray → "New Workspace..." → should clear project and reload
2. Right-click tray → "Settings..." → should dispatch settings event

**Step 5: Commit**

```bash
git add src/main/lib/tray.ts
git commit -m "feat: add New Workspace and Settings to tray menu"
```

---

## Task 9: Add Renderer Event Listeners

**Files:**
- Create: `src/renderer/lib/tray-events.ts`
- Modify: `src/renderer/App.tsx`

**Step 1: Create tray event handler**

Create `src/renderer/lib/tray-events.ts`:

```typescript
import { useEffect } from "react"
import { useSetAtom } from "jotai"
import { selectedProjectAtom } from "../features/agents/atoms"

/**
 * Hook to listen for tray events and handle them
 */
export function useTrayEvents() {
  const setSelectedProject = useSetAtom(selectedProjectAtom)

  useEffect(() => {
    // Handle workspace selection from tray
    const handleWorkspaceOpen = (event: CustomEvent) => {
      const { projectId } = event.detail
      console.log("[Tray Events] Workspace opened:", projectId)
      
      // The project is already set in localStorage by the tray handler
      // Just trigger a reload to show new chat form
      window.location.reload()
    }

    // Handle settings open from tray
    const handleSettingsOpen = () => {
      console.log("[Tray Events] Settings opened")
      // Navigate to settings page
      // TODO: Implement settings navigation
      // For now, just log
    }

    window.addEventListener("tray:open-workspace", handleWorkspaceOpen as EventListener)
    window.addEventListener("tray:open-settings", handleSettingsOpen)

    return () => {
      window.removeEventListener("tray:open-workspace", handleWorkspaceOpen as EventListener)
      window.removeEventListener("tray:open-settings", handleSettingsOpen)
    }
  }, [setSelectedProject])
}
```

**Step 2: Use the hook in App component**

In `src/renderer/App.tsx`, import and use the hook:

```typescript
import { useTrayEvents } from "./lib/tray-events"
```

In the `App` component function:

```typescript
export function App() {
  // Listen for tray events
  useTrayEvents()
  
  // ... rest of App component
}
```

**Step 3: Test tray workspace opening**

Run: `pnpm dev`
Actions:
1. Close window
2. Right-click tray → Workspaces → select a workspace
3. Verify window opens with workspace selected

**Step 4: Commit**

```bash
git add src/renderer/lib/tray-events.ts src/renderer/App.tsx
git commit -m "feat: add renderer event listeners for tray actions"
```

---

## Task 10: Add Dynamic Menu Refresh

**Files:**
- Modify: `src/main/lib/tray.ts`
- Modify: `src/main/lib/ipc/tray-handlers.ts`

**Step 1: Export menu rebuild function for IPC**

In `src/main/lib/tray.ts`, ensure `buildTrayMenu` is exported (it already is).

**Step 2: Add IPC handler to trigger menu rebuild**

In `src/main/lib/ipc/tray-handlers.ts`, add handler:

```typescript
import { buildTrayMenu } from "../tray"

  // Rebuild tray menu (called when profiles/projects change)
  ipcMain.handle("tray:rebuild-menu", async () => {
    try {
      await buildTrayMenu()
      return { success: true }
    } catch (error) {
      console.error("[Tray] Failed to rebuild menu:", error)
      return { success: false, error: String(error) }
    }
  })
```

**Step 3: Add menu refresh on data changes**

In renderer, wherever profiles or projects are added/removed, call:

```typescript
// After profile/project changes:
await window.electronAPI?.invoke("tray:rebuild-menu")
```

This can be added to profile management and project management components in a follow-up.

**Step 4: Test menu updates**

Manual test:
1. Open app
2. Add a new profile via UI
3. Check tray menu updates (will need manual refresh for now)

**Step 5: Commit**

```bash
git add src/main/lib/ipc/tray-handlers.ts
git commit -m "feat: add IPC handler for tray menu refresh"
```

---

## Task 11: Add Platform-Specific Polish

**Files:**
- Modify: `src/main/lib/tray.ts`

**Step 1: Add macOS-specific menu improvements**

In `buildTrayMenu()`, add macOS-specific polish:

```typescript
  // macOS: Add "Show 1Code" as first item
  if (process.platform === "darwin") {
    template.unshift({
      label: "Show 1Code",
      click: async () => {
        const windows = getAllWindows()
        if (windows.length > 0) {
          const window = windows[0]!
          if (window.isMinimized()) window.restore()
          window.show()
          window.focus()
        } else {
          await createMainWindow()
        }
      },
    })
    template.splice(1, 0, { type: "separator" })
  }
```

**Step 2: Improve tray icon template for macOS**

The icon with "Template" suffix should be monochrome. Ensure assets are properly formatted.

**Step 3: Test on macOS**

Run on macOS:
- Verify template icon adapts to light/dark menu bar
- Verify "Show 1Code" appears at top of menu
- Verify menu follows macOS design guidelines

**Step 4: Test on other platforms (if available)**

Windows: Verify icon and menu work correctly
Linux: Verify tray positioning and menu

**Step 5: Commit**

```bash
git add src/main/lib/tray.ts
git commit -m "feat: add platform-specific tray menu polish"
```

---

## Task 12: Documentation and Testing

**Files:**
- Create: `docs/features/system-tray.md`

**Step 1: Write feature documentation**

Create `docs/features/system-tray.md`:

```markdown
# System Tray

The app includes a persistent system tray icon that allows quick access to profiles and workspaces even when all windows are closed.

## Platform Support

- **macOS**: Menu bar icon (template image, adapts to light/dark mode)
- **Windows**: System tray icon (bottom-right)
- **Linux**: System tray icon (desktop environment dependent)

## Features

### Left Click
- Restores or creates the main window
- If windows are minimized, brings them to front
- If no windows exist, creates a new one

### Right Click Menu

```
├── Show 1Code (macOS only)
├── ─────────
├── Profiles ⊳
│   ├── ✓ Active Profile
│   └── Other Profiles
├── ─────────
├── Workspaces ⊳
│   └── Project List
├── ─────────
├── New Workspace...
├── Settings...
├── ─────────
└── Quit
```

### Profile Switching
- Click any profile to switch immediately
- All windows reload with new profile
- Active profile shown with checkmark

### Workspace Navigation
- Click workspace to open new chat with that workspace selected
- Creates window if needed
- Sets workspace and shows new chat form

### Background Mode
- App continues running when all windows are closed
- Only way to quit is via tray menu or Cmd+Q
- Windows can be restored by clicking tray icon

## Implementation Details

### Files
- `src/main/lib/tray.ts` - Tray initialization and menu building
- `src/main/lib/ipc/tray-handlers.ts` - IPC handlers for tray data
- `src/renderer/lib/tray-events.ts` - Renderer event listeners
- `resources/icons/tray-*.png` - Tray icon assets

### Menu Updates
Menu rebuilds automatically when:
- Profiles are added/removed/switched
- Projects are added/removed
- App starts

To manually trigger rebuild:
```typescript
await window.electronAPI?.invoke("tray:rebuild-menu")
```

## Testing

1. **Basic functionality**:
   - Close all windows → verify tray remains
   - Click tray → verify window restores
   - Right-click → verify menu appears

2. **Profile switching**:
   - Right-click → Profiles → select profile
   - Verify window reloads with new profile

3. **Workspace navigation**:
   - Right-click → Workspaces → select workspace
   - Verify new chat form opens with workspace

4. **Platform-specific**:
   - macOS: Verify template icon in light/dark modes
   - Windows: Verify tray icon positioning
   - Linux: Test on various desktop environments
```

**Step 2: Add troubleshooting section**

Append to the doc:

```markdown
## Troubleshooting

### Tray icon not appearing (macOS)
- Check System Settings → Control Center → Menu Bar Only
- Ensure "Show in Menu Bar" is enabled for the app

### Tray icon not appearing (Linux)
- Ensure desktop environment supports system tray
- Install system tray extensions if using GNOME
- Check if `libappindicator` is installed

### Menu not updating
- Call `tray:rebuild-menu` IPC after data changes
- Check console for errors

### App won't quit
- Use tray menu → Quit
- Or press Cmd+Q from menu bar (macOS)
- Force quit as last resort
```

**Step 3: Commit documentation**

```bash
git add docs/features/system-tray.md
git commit -m "docs: add system tray feature documentation"
```

---

## Verification Plan

### Manual Testing
1. **Tray Initialization**
   - Start app → verify tray icon appears
   - Right-click tray → verify menu matches design

2. **Window Lifecycle**
   - Close all windows → verify app stays running
   - Click tray → verify window restores
   - Quit from tray → verify clean shutdown

3. **Profile Switching**
   - Create multiple profiles
   - Switch via tray menu → verify reload and active checkmark
   
4. **Workspace Navigation**
   - Add multiple projects
   - Click workspace in tray → verify new chat with workspace

5. **New Workspace / Settings**
   - Click "New Workspace" → verify select-repo-page
   - Click "Settings" → verify settings navigation

### Platform Testing
- Test on macOS (menu bar, template icons)
- Test on Windows (system tray, standard icons)
- Test on Linux if possible (varies by DE)

### Edge Cases
- No profiles: verify "No profiles" placeholder
- No workspaces: verify "No workspaces" placeholder
- All windows destroyed: verify tray click creates new window
- Rapid clicking: verify no duplicate windows

---

## Notes

- Tray icons should be simple, monochrome for macOS template
- Menu rebuilding is async - errors are logged but don't crash
- Window restoration prefers existing windows over creating new ones
- Profile switching causes window reload (slight UX disruption, but ensures clean state)
