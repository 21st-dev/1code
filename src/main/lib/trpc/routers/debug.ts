import { router, publicProcedure } from "../index"
import { getDatabase, projects, chats, subChats } from "../../db"
import { app, shell } from "electron"
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

export const debugRouter = router({
  /**
   * Get system information for debug display
   */
  getSystemInfo: publicProcedure.query(() => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev: IS_DEV,
      userDataPath: app.getPath("userData"),
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
   * Open userData folder in system file manager
   */
  openUserDataFolder: publicProcedure.mutation(() => {
    const userDataPath = app.getPath("userData")
    shell.openPath(userDataPath)
    console.log("[Debug] Opened userData folder:", userDataPath)
    return { success: true }
  }),
})
