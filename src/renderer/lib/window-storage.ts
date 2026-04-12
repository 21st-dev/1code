import { atomWithStorage, createJSONStorage } from "jotai/utils"
import { getWindowId } from "../contexts/WindowContext"

/**
 * Track which keys have been migrated to avoid repeated migration attempts.
 * This is a per-session cache - once a key is checked, we don't check again.
 */
const migratedKeys = new Set<string>()

/**
 * Find and migrate data from old numeric window IDs (e.g., "1:", "5:") to stable ID.
 * This handles migration from the old implementation that used Electron's window.id.
 *
 * Migration is cached per-session to avoid O(n) localStorage scans on every read.
 */
function migrateFromNumericWindowId(key: string, targetWindowKey: string): string | null {
  // Only migrate for "main" window (the primary window)
  if (!targetWindowKey.startsWith("main:")) return null

  // Skip if already checked this key
  if (migratedKeys.has(targetWindowKey)) return null

  // Look for any numeric window ID prefixed key (e.g., "1:agents:selectedProject")
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey) continue

    // Check if this key matches pattern: <number>:<originalKey>
    const match = storageKey.match(/^(\d+):(.+)$/)
    if (match && match[2] === key) {
      const value = localStorage.getItem(storageKey)
      if (value !== null) {
        migratedKeys.add(targetWindowKey)
        return value
      }
    }
  }

  // Mark as checked even if nothing found
  migratedKeys.add(targetWindowKey)
  return null
}

/**
 * Creates a storage adapter that prefixes localStorage keys with window ID.
 * This allows each Electron window to have its own isolated storage namespace.
 *
 * On first read, if the window-scoped key doesn't exist but the legacy key does,
 * it migrates the data to the window-scoped key.
 *
 * Migration is performed only once per key per session for performance.
 */
function createWindowScopedStorage<T>() {
  return createJSONStorage<T>(() => ({
    getItem: (key: string) => {
      const windowKey = `${getWindowId()}:${key}`
      let value = localStorage.getItem(windowKey)

      // Only attempt migration if value not found and not already migrated
      if (value === null && !migratedKeys.has(windowKey)) {
        // Migration 1: Check for old numeric window ID keys (from previous implementation)
        const migratedValue = migrateFromNumericWindowId(key, windowKey)
        if (migratedValue !== null) {
          try {
            localStorage.setItem(windowKey, migratedValue)
          } catch (e) {
            console.warn(`[WindowStorage] Failed to save migrated value for ${windowKey}:`, e)
          }
          value = migratedValue
        }

        // Migration 2: Check legacy key (without any window prefix)
        if (value === null) {
          const legacyValue = localStorage.getItem(key)
          if (legacyValue !== null) {
            try {
              localStorage.setItem(windowKey, legacyValue)
            } catch (e) {
              console.warn(`[WindowStorage] Failed to save migrated value for ${windowKey}:`, e)
            }
            value = legacyValue
          }
          // Mark as migrated even if no legacy key found
          migratedKeys.add(windowKey)
        }
      }

      return value
    },
    setItem: (key: string, value: string) => {
      const windowKey = `${getWindowId()}:${key}`
      try {
        localStorage.setItem(windowKey, value)
      } catch (e) {
        // Handle QuotaExceededError gracefully
        console.error(`[WindowStorage] Failed to save ${windowKey}:`, e)
      }
    },
    removeItem: (key: string) => {
      const windowKey = `${getWindowId()}:${key}`
      localStorage.removeItem(windowKey)
    },
  }))
}

/**
 * Atom with storage that is scoped to the current window.
 * Each Electron window has its own isolated storage namespace.
 *
 * Use this for state that should be different per window, like:
 * - Selected chat ID
 * - Selected project
 * - Sidebar open/close states
 * - Terminal states
 *
 * For shared preferences (sidebar width, model settings, etc.),
 * use the regular atomWithStorage instead.
 *
 * @example
 * export const selectedChatIdAtom = atomWithWindowStorage<string | null>(
 *   "agents:selectedChatId",
 *   null,
 *   { getOnInit: true }
 * )
 */
export function atomWithWindowStorage<T>(
  key: string,
  initialValue: T,
  options?: { getOnInit?: boolean }
) {
  return atomWithStorage<T>(
    key,
    initialValue,
    createWindowScopedStorage<T>(),
    options
  )
}
