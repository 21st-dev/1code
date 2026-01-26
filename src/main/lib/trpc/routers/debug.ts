import { router, publicProcedure } from "../index"
import { getDatabase, projects, chats, subChats } from "../../db"
import { app, shell, session } from "electron"
import { getAuthManager } from "../../../index"
import { z } from "zod"
import { clearNetworkCache } from "../../ollama/network-detector"
import installExtension, {
  REACT_DEVELOPER_TOOLS,
  REDUX_DEVTOOLS,
} from "electron-devtools-installer"

// Available extensions for installation
const AVAILABLE_EXTENSIONS = {
  "react-devtools": {
    id: REACT_DEVELOPER_TOOLS,
    name: "React Developer Tools",
    description: "Inspect React component hierarchy, props, and state",
  },
  "redux-devtools": {
    id: REDUX_DEVTOOLS,
    name: "Redux DevTools",
    description: "Debug Redux state changes and time-travel debugging",
  },
} as const

type ExtensionKey = keyof typeof AVAILABLE_EXTENSIONS

// Protocol constant (must match main/index.ts)
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL
const PROTOCOL = IS_DEV ? "twentyfirst-agents-dev" : "twentyfirst-agents"

// Global flag for simulating offline mode (for testing)
let simulateOfflineMode = false

/**
 * Check if offline mode is being simulated (for testing)
 * Used by network-detector.ts
 */
export function isOfflineSimulated(): boolean {
  return simulateOfflineMode
}

export const debugRouter = router({
  /**
   * Get system information for debug display
   */
  getSystemInfo: publicProcedure.query(() => {
    // Check protocol registration
    let protocolRegistered = false
    try {
      protocolRegistered = process.defaultApp
        ? app.isDefaultProtocolClient(
            PROTOCOL,
            process.execPath,
            [process.argv[1]!],
          )
        : app.isDefaultProtocolClient(PROTOCOL)
    } catch {
      protocolRegistered = false
    }

    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev: IS_DEV,
      userDataPath: app.getPath("userData"),
      protocolRegistered,
    }
  }),

  /**
   * Get database statistics
   */
  getDbStats: publicProcedure.query(() => {
    const db = getDatabase()
    const projectCount = db.select().from(projects).all().length
    const chatCount = db.select().from(chats).all().length
    const subChatCount = db.select().from(subChats).all().length

    return {
      projects: projectCount,
      chats: chatCount,
      subChats: subChatCount,
    }
  }),

  /**
   * Clear all chats and sub-chats (keeps projects)
   */
  clearChats: publicProcedure.mutation(() => {
    const db = getDatabase()
    // Delete sub_chats first (foreign key constraint)
    db.delete(subChats).run()
    db.delete(chats).run()
    console.log("[Debug] Cleared all chats and sub-chats")
    return { success: true }
  }),

  /**
   * Clear all data (projects, chats, sub-chats)
   */
  clearAllData: publicProcedure.mutation(() => {
    const db = getDatabase()
    // Delete in order due to foreign key constraints
    db.delete(subChats).run()
    db.delete(chats).run()
    db.delete(projects).run()
    console.log("[Debug] Cleared all database data")
    return { success: true }
  }),

  /**
   * Logout (clear auth only)
   */
  logout: publicProcedure.mutation(() => {
    const authManager = getAuthManager()
    authManager.logout()
    console.log("[Debug] User logged out")
    return { success: true }
  }),

  /**
   * Open userData folder in system file manager
   */
  openUserDataFolder: publicProcedure.mutation(() => {
    const userDataPath = app.getPath("userData")
    shell.openPath(userDataPath)
    console.log("[Debug] Opened userData folder:", userDataPath)
    return { success: true }
  }),

  /**
   * Get offline simulation status
   */
  getOfflineSimulation: publicProcedure.query(() => {
    return { enabled: simulateOfflineMode }
  }),

  /**
   * Set offline simulation status (for testing)
   */
  setOfflineSimulation: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      simulateOfflineMode = input.enabled
      // Clear network cache to force immediate re-check
      clearNetworkCache()
      console.log(`[Debug] Offline simulation ${input.enabled ? "enabled" : "disabled"}`)
      return { success: true, enabled: simulateOfflineMode }
    }),

  /**
   * Get list of available DevTools extensions and their installation status
   */
  getExtensions: publicProcedure.query(async () => {
    const ses = session.defaultSession
    const installedExtensions = ses.getAllExtensions()
    const installedNames = installedExtensions.map((ext) => ext.name.toLowerCase())

    return Object.entries(AVAILABLE_EXTENSIONS).map(([key, ext]) => ({
      key,
      name: ext.name,
      description: ext.description,
      installed: installedNames.some(
        (name) =>
          name.includes("react") && key === "react-devtools" ||
          name.includes("redux") && key === "redux-devtools"
      ),
    }))
  }),

  /**
   * Install a DevTools extension
   */
  installExtension: publicProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ input }) => {
      const ext = AVAILABLE_EXTENSIONS[input.key as ExtensionKey]
      if (!ext) {
        throw new Error(`Unknown extension: ${input.key}`)
      }

      try {
        const name = await installExtension(ext.id, {
          loadExtensionOptions: { allowFileAccess: true },
          forceDownload: false,
        })
        console.log(`[DevTools] Installed extension: ${name}`)
        return { success: true, name: typeof name === 'string' ? name : ext.name }
      } catch (error: unknown) {
        // Handle "already installed" as success
        const errorMsg = error instanceof Error ? error.message : String(error)
        if (errorMsg.includes('already installed') || errorMsg.includes('is already loaded')) {
          console.log(`[DevTools] Extension already installed: ${ext.name}`)
          return { success: true, name: ext.name }
        }
        console.error(`[DevTools] Failed to install ${ext.name}:`, error)
        throw new Error(`Failed to install ${ext.name}: ${errorMsg}`)
      }
    }),

  /**
   * Remove a DevTools extension
   */
  removeExtension: publicProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ input }) => {
      const ses = session.defaultSession
      const installedExtensions = ses.getAllExtensions()

      // Find matching extension
      const extToRemove = installedExtensions.find((ext) => {
        const name = ext.name.toLowerCase()
        return (
          (name.includes("react") && input.key === "react-devtools") ||
          (name.includes("redux") && input.key === "redux-devtools")
        )
      })

      if (!extToRemove) {
        throw new Error(`Extension not found: ${input.key}`)
      }

      try {
        await ses.removeExtension(extToRemove.id)
        console.log(`[DevTools] Removed extension: ${extToRemove.name}`)
        return { success: true, name: extToRemove.name }
      } catch (error) {
        console.error(`[DevTools] Failed to remove ${extToRemove.name}:`, error)
        throw new Error(`Failed to remove: ${error}`)
      }
    }),
})
