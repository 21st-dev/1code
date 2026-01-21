import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { safeStorage } from "electron"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, mcpCredentials } from "../../db"
import { eq } from "drizzle-orm"
import { getDevyardConfig } from "../../devyard-config"

// ============ TYPES ============

interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}

interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>
}

export type McpAuthStatus = "no_auth_needed" | "configured" | "missing_credentials"

export interface McpServer {
  id: string
  name: string
  config: McpServerConfig
  authStatus: McpAuthStatus
  credentialEnvVars: string[]
  enabled: boolean
}

// ============ HELPERS ============

/**
 * Get the path to mcp.json config file
 * Checks Devyard path first, then falls back to ~/.claude/
 */
function getMcpConfigPath(): string {
  const devyardConfig = getDevyardConfig()
  if (devyardConfig.enabled && devyardConfig.claudeConfigDir) {
    return path.join(devyardConfig.claudeConfigDir, "mcp.json")
  }
  return path.join(os.homedir(), ".claude", "mcp.json")
}

/**
 * Check if an env var name looks like a credential
 */
function isCredentialEnvVar(name: string): boolean {
  const patterns = [
    /API[_-]?KEY/i,
    /TOKEN/i,
    /SECRET/i,
    /PASSWORD/i,
    /CREDENTIAL/i,
    /AUTH/i,
    /PRIVATE[_-]?KEY/i,
  ]
  return patterns.some((p) => p.test(name))
}

/**
 * Check if a value is a placeholder (needs to be filled in)
 */
function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  const trimmed = value.trim()
  return (
    trimmed === "" ||
    trimmed === "..." ||
    trimmed.includes("YOUR_") ||
    trimmed.includes("<") ||
    trimmed.includes("REPLACE") ||
    trimmed.includes("TODO")
  )
}

/**
 * Encrypt a credential value using Electron's safeStorage
 */
function encryptCredential(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[mcp] Encryption not available, storing as base64")
    return Buffer.from(value).toString("base64")
  }
  return safeStorage.encryptString(value).toString("base64")
}

/**
 * Decrypt a credential value using Electron's safeStorage
 */
function decryptCredential(encrypted: string): string | null {
  if (!encrypted) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    const buffer = Buffer.from(encrypted, "base64")
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error("[mcp] Failed to decrypt credential:", error)
    return null
  }
}

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

/**
 * Get auth status for a server
 */
function getAuthStatus(
  config: McpServerConfig,
  storedCredentials: Record<string, string>
): { status: McpAuthStatus; credentialEnvVars: string[] } {
  const envVars = config.env || {}
  const credentialVars = Object.keys(envVars).filter(isCredentialEnvVar)

  if (credentialVars.length === 0) {
    return { status: "no_auth_needed", credentialEnvVars: [] }
  }

  // Check if all credential vars have values (either in config or stored)
  const allConfigured = credentialVars.every((varName) => {
    const configValue = envVars[varName]
    const storedValue = storedCredentials[varName]
    // Consider configured if has non-placeholder value
    return (configValue && !isPlaceholder(configValue)) || storedValue
  })

  return {
    status: allConfigured ? "configured" : "missing_credentials",
    credentialEnvVars: credentialVars,
  }
}

// ============ ROUTER ============

export const mcpRouter = router({
  /**
   * List all MCP servers from mcp.json with auth status
   */
  listServers: publicProcedure.query(async (): Promise<{ servers: McpServer[] }> => {
    const configPath = getMcpConfigPath()
    const servers: McpServer[] = []

    try {
      const content = await fs.readFile(configPath, "utf-8")
      const config = JSON.parse(content) as McpConfigFile

      if (!config.mcpServers) {
        return { servers: [] }
      }

      // Get stored credentials from database
      const db = getDatabase()
      const allCredentials = db.select().from(mcpCredentials).all()
      const credentialsMap = new Map<string, Record<string, string>>()

      for (const cred of allCredentials) {
        const decrypted: Record<string, string> = {}
        const stored = parseJsonSafely<Record<string, string>>(cred.credentials, {})
        for (const [key, value] of Object.entries(stored)) {
          const decryptedValue = decryptCredential(value)
          if (decryptedValue) {
            decrypted[key] = decryptedValue
          }
        }
        credentialsMap.set(cred.id, decrypted)
      }

      // Process each server
      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        const storedCredentials = credentialsMap.get(serverId) || {}
        const { status, credentialEnvVars } = getAuthStatus(serverConfig, storedCredentials)

        servers.push({
          id: serverId,
          name: serverId,
          config: serverConfig,
          authStatus: status,
          credentialEnvVars,
          enabled: !serverConfig.disabled,
        })
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[mcp] Failed to read mcp.json:", error)
      }
    }

    return { servers }
  }),

  /**
   * Get detailed info for a single MCP server
   */
  getServer: publicProcedure
    .input(z.object({ serverId: z.string() }))
    .query(async ({ input }): Promise<McpServer | null> => {
      const configPath = getMcpConfigPath()

      try {
        const content = await fs.readFile(configPath, "utf-8")
        const config = JSON.parse(content) as McpConfigFile

        if (!config.mcpServers?.[input.serverId]) {
          return null
        }

        const serverConfig = config.mcpServers[input.serverId]

        // Get stored credentials
        const db = getDatabase()
        const stored = db
          .select()
          .from(mcpCredentials)
          .where(eq(mcpCredentials.id, input.serverId))
          .get()

        let storedCredentials: Record<string, string> = {}
        if (stored) {
          const parsed = parseJsonSafely<Record<string, string>>(stored.credentials, {})
          for (const [key, value] of Object.entries(parsed)) {
            const decryptedValue = decryptCredential(value)
            if (decryptedValue) {
              storedCredentials[key] = decryptedValue
            }
          }
        }

        const { status, credentialEnvVars } = getAuthStatus(serverConfig, storedCredentials)

        return {
          id: input.serverId,
          name: input.serverId,
          config: serverConfig,
          authStatus: status,
          credentialEnvVars,
          enabled: !serverConfig.disabled,
        }
      } catch (error) {
        console.error("[mcp] Failed to get server:", error)
        return null
      }
    }),

  /**
   * Save credentials for an MCP server
   */
  saveCredentials: publicProcedure
    .input(
      z.object({
        serverId: z.string(),
        credentials: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Encrypt each credential value
      const encrypted: Record<string, string> = {}
      for (const [key, value] of Object.entries(input.credentials)) {
        if (value && value.trim()) {
          encrypted[key] = encryptCredential(value)
        }
      }

      // Check if credentials exist
      const existing = db
        .select()
        .from(mcpCredentials)
        .where(eq(mcpCredentials.id, input.serverId))
        .get()

      if (existing) {
        // Merge with existing credentials
        const existingCreds = parseJsonSafely<Record<string, string>>(existing.credentials, {})
        const merged = { ...existingCreds, ...encrypted }

        db.update(mcpCredentials)
          .set({
            credentials: JSON.stringify(merged),
            updatedAt: new Date(),
          })
          .where(eq(mcpCredentials.id, input.serverId))
          .run()
      } else {
        db.insert(mcpCredentials)
          .values({
            id: input.serverId,
            credentials: JSON.stringify(encrypted),
            updatedAt: new Date(),
          })
          .run()
      }

      return { success: true }
    }),

  /**
   * Clear credentials for an MCP server
   */
  clearCredentials: publicProcedure
    .input(z.object({ serverId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      db.delete(mcpCredentials).where(eq(mcpCredentials.id, input.serverId)).run()

      return { success: true }
    }),

  /**
   * Toggle server enabled/disabled status in mcp.json
   */
  toggleServer: publicProcedure
    .input(z.object({ serverId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const configPath = getMcpConfigPath()

      try {
        const content = await fs.readFile(configPath, "utf-8")
        const config = JSON.parse(content) as McpConfigFile

        if (!config.mcpServers?.[input.serverId]) {
          throw new Error(`Server ${input.serverId} not found`)
        }

        // Update disabled field
        if (input.enabled) {
          delete config.mcpServers[input.serverId].disabled
        } else {
          config.mcpServers[input.serverId].disabled = true
        }

        // Write back to file
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8")

        return { success: true }
      } catch (error) {
        console.error("[mcp] Failed to toggle server:", error)
        throw error
      }
    }),

  /**
   * Get the MCP config file path (for display purposes)
   */
  getConfigPath: publicProcedure.query(() => {
    return { path: getMcpConfigPath() }
  }),
})
