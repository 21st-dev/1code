// #NP - Device Sync tRPC router for cloud sync via 21st.dev API
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, appSettings } from "../../db"
import { eq, like } from "drizzle-orm"
import { createId } from "../../db/utils"
import { app } from "electron"
import * as os from "os"
import * as crypto from "crypto"

// ============ TYPES ============

interface SyncStatus {
  enabled: boolean
  lastSyncAt: Date | null
  lastSyncDirection: "push" | "pull" | null
  deviceId: string
  deviceName: string
  syncedKeys: number
}

interface SyncableData {
  key: string
  value: string
  updatedAt: string
}

// Settings keys
const SYNC_ENABLED_KEY = "sync:enabled"
const SYNC_LAST_AT_KEY = "sync:lastSyncAt"
const SYNC_LAST_DIRECTION_KEY = "sync:lastDirection"
const SYNC_DEVICE_NAME_KEY = "sync:deviceName"

// Syncable setting prefixes (what we sync to cloud)
const SYNCABLE_PREFIXES = [
  "settings:",       // App settings
  "preferences:",    // User preferences
  "theme:",          // Theme settings
  "commands:",       // Custom commands
  "routing:",        // Routing rules
  "ccr:",            // CCR configuration
]

// ============ HELPERS ============

function getDeviceId(): string {
  const db = getDatabase()
  let deviceId = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "device:id"))
    .get()?.value

  if (!deviceId) {
    // Generate a device ID based on system info
    const hostname = os.hostname()
    const platform = os.platform()
    const arch = os.arch()
    const cpus = os.cpus()
    const cpuModel = cpus.length > 0 ? cpus[0].model : "unknown"

    // Create a hash of system info for a stable device ID
    const systemInfo = `${hostname}-${platform}-${arch}-${cpuModel}`
    const hash = crypto.createHash("sha256").update(systemInfo).digest("hex")
    deviceId = `device-${hash.substring(0, 16)}`

    db.insert(settings)
      .values({
        id: createId(),
        key: "device:id",
        value: deviceId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
  }

  return deviceId
}

function getDeviceName(): string {
  const db = getDatabase()
  const stored = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SYNC_DEVICE_NAME_KEY))
    .get()?.value

  if (stored) return stored

  // Generate default name based on platform
  const platform = process.platform
  const hostname = os.hostname()
  return `${hostname} (${platform})`
}

function getSetting(key: string): string | null {
  const db = getDatabase()
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  const db = getDatabase()
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get()

  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(appSettings.key, key))
      .run()
  } else {
    db.insert(settings)
      .values({
        id: createId(),
        key,
        value,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
  }
}

function getSyncableSettings(): SyncableData[] {
  const db = getDatabase()
  const allSettings = db.select().from(appSettings).all()

  return allSettings
    .filter((s) => SYNCABLE_PREFIXES.some((prefix) => s.key.startsWith(prefix)))
    .map((s) => ({
      key: s.key,
      value: s.value,
      updatedAt: s.updatedAt.toISOString(),
    }))
}

// 21st.dev API helpers
const API_BASE = "https://api.21st.dev/v1"

async function getAuthToken(): Promise<string | null> {
  // Get auth token from the auth store
  // This would typically come from the OAuth flow
  const db = getDatabase()
  const token = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "auth:21st:token"))
    .get()?.value

  return token ?? null
}

async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken()

  if (!token) {
    throw new Error("Not authenticated with 21st.dev")
  }

  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "1code-desktop",
    },
  })
}

// ============ ROUTER ============

export const syncRouter = router({
  /**
   * Get current sync status
   */
  getStatus: publicProcedure.query((): SyncStatus => {
    const enabled = getSetting(SYNC_ENABLED_KEY) === "true"
    const lastSyncAtStr = getSetting(SYNC_LAST_AT_KEY)
    const lastDirection = getSetting(SYNC_LAST_DIRECTION_KEY) as
      | "push"
      | "pull"
      | null

    const syncableSettings = getSyncableSettings()

    return {
      enabled,
      lastSyncAt: lastSyncAtStr ? new Date(lastSyncAtStr) : null,
      lastSyncDirection: lastDirection,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      syncedKeys: syncableSettings.length,
    }
  }),

  /**
   * Enable device sync
   */
  enable: publicProcedure.mutation(async () => {
    const token = await getAuthToken()

    if (!token) {
      throw new Error(
        "Please sign in with 21st.dev to enable cloud sync"
      )
    }

    setSetting(SYNC_ENABLED_KEY, "true")

    return { success: true }
  }),

  /**
   * Disable device sync
   */
  disable: publicProcedure.mutation(() => {
    setSetting(SYNC_ENABLED_KEY, "false")
    return { success: true }
  }),

  /**
   * Set device name
   */
  setDeviceName: publicProcedure
    .input(z.object({ name: z.string().min(1).max(50) }))
    .mutation(({ input }) => {
      setSetting(SYNC_DEVICE_NAME_KEY, input.name)
      return { success: true }
    }),

  /**
   * Push local settings to cloud
   */
  push: publicProcedure.mutation(async () => {
    const enabled = getSetting(SYNC_ENABLED_KEY) === "true"
    if (!enabled) {
      throw new Error("Sync is not enabled")
    }

    const deviceId = getDeviceId()
    const deviceName = getDeviceName()
    const syncableSettings = getSyncableSettings()

    try {
      const response = await fetchWithAuth("/sync/push", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          deviceName,
          settings: syncableSettings,
          pushedAt: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Sync push failed: ${error}`)
      }

      const now = new Date()
      setSetting(SYNC_LAST_AT_KEY, now.toISOString())
      setSetting(SYNC_LAST_DIRECTION_KEY, "push")

      return {
        success: true,
        syncedKeys: syncableSettings.length,
        syncedAt: now,
      }
    } catch (error) {
      console.error("[Sync] Push error:", error)
      throw error
    }
  }),

  /**
   * Pull settings from cloud
   */
  pull: publicProcedure.mutation(async () => {
    const enabled = getSetting(SYNC_ENABLED_KEY) === "true"
    if (!enabled) {
      throw new Error("Sync is not enabled")
    }

    const deviceId = getDeviceId()

    try {
      const response = await fetchWithAuth(`/sync/pull?deviceId=${deviceId}`)

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Sync pull failed: ${error}`)
      }

      const data = await response.json()
      const pulledSettings: SyncableData[] = data.settings || []

      // Apply pulled settings
      const db = getDatabase()
      let updatedCount = 0

      for (const setting of pulledSettings) {
        // Only update if the cloud version is newer
        const existing = db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, setting.key))
          .get()

        const cloudDate = new Date(setting.updatedAt)
        const localDate = existing?.updatedAt

        if (!localDate || cloudDate > localDate) {
          setSetting(setting.key, setting.value)
          updatedCount++
        }
      }

      const now = new Date()
      setSetting(SYNC_LAST_AT_KEY, now.toISOString())
      setSetting(SYNC_LAST_DIRECTION_KEY, "pull")

      return {
        success: true,
        pulledKeys: pulledSettings.length,
        updatedKeys: updatedCount,
        syncedAt: now,
      }
    } catch (error) {
      console.error("[Sync] Pull error:", error)
      throw error
    }
  }),

  /**
   * Perform full sync (push then pull with conflict resolution)
   */
  fullSync: publicProcedure.mutation(async () => {
    const enabled = getSetting(SYNC_ENABLED_KEY) === "true"
    if (!enabled) {
      throw new Error("Sync is not enabled")
    }

    const deviceId = getDeviceId()
    const deviceName = getDeviceName()
    const localSettings = getSyncableSettings()

    try {
      const response = await fetchWithAuth("/sync/full", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          deviceName,
          settings: localSettings,
          syncedAt: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Full sync failed: ${error}`)
      }

      const data = await response.json()
      const mergedSettings: SyncableData[] = data.settings || []

      // Apply merged settings
      const db = getDatabase()
      for (const setting of mergedSettings) {
        setSetting(setting.key, setting.value)
      }

      const now = new Date()
      setSetting(SYNC_LAST_AT_KEY, now.toISOString())
      setSetting(SYNC_LAST_DIRECTION_KEY, "push") // Full sync is primarily a push

      return {
        success: true,
        syncedKeys: mergedSettings.length,
        syncedAt: now,
      }
    } catch (error) {
      console.error("[Sync] Full sync error:", error)
      throw error
    }
  }),

  /**
   * Get list of devices registered for sync
   */
  getDevices: publicProcedure.query(async () => {
    try {
      const response = await fetchWithAuth("/sync/devices")

      if (!response.ok) {
        throw new Error("Failed to fetch devices")
      }

      const data = await response.json()
      return data.devices || []
    } catch (error) {
      console.error("[Sync] Get devices error:", error)
      return []
    }
  }),

  /**
   * Remove a device from sync
   */
  removeDevice: publicProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const response = await fetchWithAuth(`/sync/devices/${input.deviceId}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          throw new Error("Failed to remove device")
        }

        return { success: true }
      } catch (error) {
        console.error("[Sync] Remove device error:", error)
        throw error
      }
    }),

  /**
   * Get sync conflict preview (what would change on pull)
   */
  getConflicts: publicProcedure.query(async () => {
    const deviceId = getDeviceId()
    const localSettings = getSyncableSettings()

    try {
      const response = await fetchWithAuth("/sync/conflicts", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          settings: localSettings,
        }),
      })

      if (!response.ok) {
        return { conflicts: [] }
      }

      const data = await response.json()
      return { conflicts: data.conflicts || [] }
    } catch {
      return { conflicts: [] }
    }
  }),
})
