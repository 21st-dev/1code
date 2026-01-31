import { app, Menu, Tray, nativeImage } from "electron"
import { join } from "path"
import { existsSync } from "fs"
import { eq } from "drizzle-orm"
import { IS_DEV } from "../constants"
import { getWindow, getAllWindows, createMainWindow } from "../windows/main"
import { getDatabase } from "./db"
import { projects } from "./db/schema"

let tray: Tray | null = null

/**
 * Get path to tray icon based on platform and theme
 * Returns template image for macOS (auto-adapts to light/dark mode)
 */
function getTrayIconPath(): string {
  // macOS uses trayTemplate.png which auto-adapts to light/dark mode
  const iconName = "trayTemplate.png"

  // In dev mode, __dirname is in out/main, so go up to project root
  // In production, icon is in app resources
  if (IS_DEV) {
    // __dirname = /path/to/project/out/main
    // We need: /path/to/project/build/trayTemplate.png
    const devPath = join(__dirname, "../../build", iconName)
    console.log("[Tray] Dev icon path:", devPath)
    if (existsSync(devPath)) {
      return devPath
    }
    // Fallback: try app.getAppPath()
    const fallbackPath = join(app.getAppPath(), "build", iconName)
    console.log("[Tray] Fallback icon path:", fallbackPath)
    return fallbackPath
  }
  return join(process.resourcesPath, iconName)
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

  try {
    const iconPath = getTrayIconPath()
    console.log("[Tray] Creating tray with icon:", iconPath)
    console.log("[Tray] Icon exists:", existsSync(iconPath))

    if (!existsSync(iconPath)) {
      console.error("[Tray] Icon file not found at:", iconPath)
      return
    }

    // Create native image and set as template for macOS (auto dark/light mode)
    const icon = nativeImage.createFromPath(iconPath)
    if (process.platform === "darwin") {
      icon.setTemplateImage(true)
    }
    
    // Resize for proper display (16x16 for macOS menu bar)
    const resizedIcon = icon.resize({ width: 16, height: 16 })
    
    tray = new Tray(resizedIcon)
    tray.setToolTip("1Code")

    // Left-click: restore or create window
    tray.on("click", () => {
      console.log("[Tray] Click event - restoring window")
      restoreOrCreateWindow()
    })

    // Double-click on Windows also shows window
    tray.on("double-click", () => {
      console.log("[Tray] Double-click event - restoring window")
      restoreOrCreateWindow()
    })

    // Right-click: rebuild menu before showing (ensures dynamic data is current)
    tray.on("right-click", () => {
      console.log("[Tray] Right-click - rebuilding menu for dynamic data")
      buildTrayMenu().catch(err => {
        console.error("[Tray] Failed to rebuild menu on right-click:", err)
      })
    })

    // Build initial menu (async, don't await)
    buildTrayMenu().catch(err => {
      console.error("[Tray] Failed to build initial menu:", err)
    })

    console.log("[Tray] Initialized successfully")
  } catch (error) {
    console.error("[Tray] Failed to initialize:", error)
  }
}

/**
 * Restore an existing window or create a new one
 */
function restoreOrCreateWindow(): void {
  // On macOS, show dock icon when restoring window
  if (process.platform === "darwin" && app.dock) {
    app.dock.show()
  }

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
}

/**
 * Build and set the tray context menu
 * Fetches current profiles and projects from database/localStorage
 */
export async function buildTrayMenu(): Promise<void> {
  if (!tray) {
    console.warn("[Tray] Cannot build menu - tray not initialized")
    return
  }

  let allProjects: { id: string; name: string; path: string }[] = []

  // Try to fetch projects from database (may fail if DB not ready)
  try {
    const db = getDatabase()
    allProjects = db.select().from(projects).all()
  } catch (dbError) {
    console.warn("[Tray] Could not fetch projects from database:", dbError)
    // Continue with empty projects - show basic menu
  }

  try {

    // Get active profile from first window's localStorage
    let activeProfileId: string | null = null
    let allProfiles: { id: string; name: string }[] = []

    // Get or create a window to read localStorage
    let windows = getAllWindows()
    let window = windows.find(w => !w.isDestroyed())

    // If no window, create a hidden one to read localStorage
    let createdHiddenWindow = false
    if (!window) {
      console.log("[Tray] No window available, creating hidden window to read profiles")
      window = createMainWindow()
      createdHiddenWindow = true
      // Wait for window to load
      await new Promise<void>((resolve) => {
        window!.webContents.once('did-finish-load', () => resolve())
      })
    }

    if (window && !window.isDestroyed()) {
      try {
        // Get profiles from localStorage
        const profilesJson = await window.webContents.executeJavaScript(
          `localStorage.getItem('agents:model-profiles')`
        )
        console.log("[Tray] Raw profiles from localStorage:", profilesJson)
        if (profilesJson) {
          const parsed = JSON.parse(profilesJson)
          console.log("[Tray] Parsed profiles:", parsed)
          allProfiles = Array.isArray(parsed) ? parsed : []
        }

        // Get active profile ID
        const activeIdJson = await window.webContents.executeJavaScript(
          `localStorage.getItem('agents:active-profile-id')`
        )
        console.log("[Tray] Raw active profile ID:", activeIdJson)
        activeProfileId = activeIdJson ? JSON.parse(activeIdJson) : null
        console.log("[Tray] Parsed active profile ID:", activeProfileId)
      } catch (e) {
        console.warn("[Tray] Could not get profile data from renderer:", e)
      }

      // If we created a hidden window just to read, close it
      if (createdHiddenWindow && window && !window.isDestroyed()) {
        window.close()
      }
    }

    // Filter out offline profiles (matching UI behavior)
    const customProfiles = allProfiles.filter((p: any) => !p.isOffline)
    console.log("[Tray] Custom profiles (non-offline):", customProfiles.map((p: any) => p.name))

    // Build profile menu items
    // First item: "Use Claude Default" option (when no custom profile is active)
    const profileMenuItems: Electron.MenuItemConstructorOptions[] = [
      {
        label: "Use Claude Default",
        type: "checkbox" as const,
        checked: activeProfileId === null,
        click: () => {
          handleProfileSwitch(null)
        },
      },
      ...(customProfiles.length > 0 ? [{ type: "separator" as const }] : []),
      ...customProfiles.map((profile: any) => ({
        label: profile.name,
        type: "checkbox" as const,
        checked: profile.id === activeProfileId,
        click: () => {
          handleProfileSwitch(profile.id)
        },
      }))
    ]

    // Build workspace menu items
    const workspaceMenuItems: Electron.MenuItemConstructorOptions[] = allProjects.map(project => ({
      label: project.name || project.path.split("/").pop() || project.path,
      click: () => {
        handleWorkspaceClick(project.id)
      },
    }))

    const template: Electron.MenuItemConstructorOptions[] = []
    
    // macOS: Add "Show 1Code" as first item
    if (process.platform === "darwin") {
      template.push({
        label: "Show 1Code",
        click: () => {
          restoreOrCreateWindow()
        },
      })
      template.push({ type: "separator" })
    }

    template.push(
      {
        label: "Profiles",
        submenu: profileMenuItems,
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
    )

    const contextMenu = Menu.buildFromTemplate(template)
    tray.setContextMenu(contextMenu)
  } catch (error) {
    console.error("[Tray] Failed to build menu:", error)
  }
}

/**
 * Handle profile switch from tray menu
 * Updates localStorage in all windows and reloads them
 */
async function handleProfileSwitch(profileId: string | null): Promise<void> {
  console.log("[Tray] Switching to profile:", profileId)
  
  const windows = getAllWindows()
  for (const window of windows) {
    try {
      if (window.isDestroyed()) continue
      
      // Update localStorage
      if (profileId === null) {
        // Clear profile to use default Claude
        await window.webContents.executeJavaScript(
          `localStorage.removeItem('agents:active-profile-id')`
        )
      } else {
        await window.webContents.executeJavaScript(
          `localStorage.setItem('agents:active-profile-id', ${JSON.stringify(JSON.stringify(profileId))})`
        )
      }
      
      // Reload window to apply new profile
      window.reload()
    } catch (error) {
      console.error("[Tray] Failed to switch profile for window:", error)
    }
  }
  
  // Rebuild menu to update checkmarks
  await buildTrayMenu()
}

/**
 * Handle workspace click from tray menu
 * Sets active workspace and opens window
 */
async function handleWorkspaceClick(projectId: string): Promise<void> {
  console.log("[Tray] Opening workspace:", projectId)
  
  // Get or create main window
  let window = getWindow()
  if (!window) {
    window = createMainWindow()
  }
  
  // Show and focus window
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
  
  // Set selected project in localStorage and trigger reload
  try {
    const db = getDatabase()
    const projectData = db.select().from(projects).where(
      eq(projects.id, projectId)
    ).get()
    
    if (projectData) {
      await window.webContents.executeJavaScript(`
        localStorage.setItem('agents:selected-project', ${JSON.stringify(JSON.stringify(projectData))});
        window.location.reload();
      `)
    }
  } catch (error) {
    console.error("[Tray] Failed to open workspace:", error)
  }
}

/**
 * Handle "New Workspace" click
 * Opens select-repo-page by clearing selected project
 */
async function handleNewWorkspace(): Promise<void> {
  console.log("[Tray] Opening new workspace dialog")
  
  // Get or create main window
  let window = getWindow()
  if (!window) {
    window = createMainWindow()
  }
  
  // Show and focus window
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
  
  // Wait a bit for window to be fully visible and ready
  await new Promise(resolve => setTimeout(resolve, 100))
  
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

/**
 * Handle "Settings" click
 * Opens settings by dispatching custom event
 */
async function handleOpenSettings(): Promise<void> {
  console.log("[Tray] Opening settings")

  // On macOS, show dock icon when showing window
  if (process.platform === "darwin" && app.dock) {
    app.dock.show()
  }

  // Get or create main window
  let window = getWindow()
  const isNewWindow = !window
  if (!window) {
    window = createMainWindow()
  }

  // Show and focus window
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()

  // Wait for window to be fully loaded before dispatching event
  const dispatchSettingsEvent = async () => {
    try {
      await window!.webContents.executeJavaScript(`
        window.dispatchEvent(new CustomEvent('tray:open-settings'));
      `)
    } catch (error) {
      console.error("[Tray] Failed to open settings:", error)
    }
  }

  if (isNewWindow) {
    // New window: wait for did-finish-load to ensure React is mounted
    window.webContents.once('did-finish-load', () => {
      // Additional delay to ensure React hooks are registered
      setTimeout(dispatchSettingsEvent, 300)
    })
  } else {
    // Existing window: dispatch immediately
    await dispatchSettingsEvent()
  }
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
