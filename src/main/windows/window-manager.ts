import { BrowserWindow } from "electron"

/**
 * Manages multiple application windows
 */
class WindowManager {
  private windows: Map<number, BrowserWindow> = new Map()
  private focusedWindowId: number | null = null
  private mainWindowId: number | null = null  // Track the "main" window
  private windowIdMap: Map<number, string> = new Map()  // Map Electron window.id to stable ID
  private nextSecondaryId = 2  // Counter for secondary windows

  /**
   * Register a window with the manager and assign a stable ID
   * Returns the stable window ID to use for localStorage namespacing
   */
  register(window: BrowserWindow): string {
    const electronId = window.id
    this.windows.set(electronId, window)

    // Assign stable ID
    let stableId: string
    if (this.mainWindowId === null) {
      // First window ever registered becomes the "main" window
      this.mainWindowId = electronId
      stableId = "main"
    } else {
      // Secondary windows get incrementing IDs
      stableId = `window-${this.nextSecondaryId++}`
    }
    this.windowIdMap.set(electronId, stableId)

    // Track focus
    window.on("focus", () => {
      this.focusedWindowId = electronId
    })

    // Clean up on close
    // Note: Electron automatically removes all listeners when a window is destroyed,
    // so we only need to clean up our internal tracking here
    window.on("closed", () => {
      // Git watcher subscriptions are tracked per worktree, not per window,
      // and are automatically cleaned up when the app shuts down via cleanupGitWatchers()
      this.windows.delete(electronId)
      this.windowIdMap.delete(electronId)
      if (this.focusedWindowId === electronId) {
        this.focusedWindowId = null
      }
      // If main window is closed, update mainWindowId for internal tracking
      // but DON'T change the stable ID of remaining windows - they keep their localStorage namespace
      if (this.mainWindowId === electronId) {
        const remainingWindows = Array.from(this.windows.keys())
        this.mainWindowId = remainingWindows.length > 0 ? remainingWindows[0] : null
        // Note: We intentionally keep the existing stable ID (e.g., "window-2")
        // Changing it to "main" would orphan the window's localStorage data
      }
    })

    // Set as focused if it's the only window
    if (this.windows.size === 1) {
      this.focusedWindowId = electronId
    }

    return stableId
  }

  /**
   * Get the stable ID for a window
   */
  getStableId(window: BrowserWindow): string {
    return this.windowIdMap.get(window.id) ?? "main"
  }

  /**
   * Unregister a window
   */
  unregister(window: BrowserWindow): void {
    this.windows.delete(window.id)
    if (this.focusedWindowId === window.id) {
      this.focusedWindowId = null
    }
  }

  /**
   * Get a window by ID
   */
  get(id: number): BrowserWindow | undefined {
    return this.windows.get(id)
  }

  /**
   * Get the currently focused window
   */
  getFocused(): BrowserWindow | null {
    if (this.focusedWindowId !== null) {
      const win = this.windows.get(this.focusedWindowId)
      if (win && !win.isDestroyed()) {
        return win
      }
    }
    // Fallback to BrowserWindow.getFocusedWindow() with destroyed check
    const focusedWin = BrowserWindow.getFocusedWindow()
    if (focusedWin && !focusedWin.isDestroyed()) {
      return focusedWin
    }
    return null
  }

  /**
   * Get all windows
   */
  getAll(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter((w) => !w.isDestroyed())
  }

  /**
   * Get the number of windows
   */
  count(): number {
    return this.windows.size
  }

  /**
   * Find window by webContents ID
   */
  findByWebContentsId(webContentsId: number): BrowserWindow | undefined {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed() && window.webContents.id === webContentsId) {
        return window
      }
    }
    return undefined
  }
}

// Singleton instance
export const windowManager = new WindowManager()
