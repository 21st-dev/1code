import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { safeStorage } from "electron"
import type { SnowflakeConfig } from "./connection"

/**
 * Stored Snowflake connection data
 * Includes connection config and metadata
 */
export interface StoredSnowflakeConnection {
  config: SnowflakeConfig
  name: string // User-friendly name for this connection
  createdAt: string
  lastUsedAt?: string
}

/**
 * Secure storage for Snowflake credentials
 * Uses Electron's safeStorage API to encrypt sensitive data using OS keychain
 */
export class SnowflakeCredentialStore {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "snowflake-credentials.dat")
  }

  /**
   * Check if encryption is available on this system
   */
  private isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /**
   * Save Snowflake connection (encrypted if possible)
   */
  save(connection: StoredSnowflakeConnection): void {
    try {
      const dir = dirname(this.filePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const jsonData = JSON.stringify(connection)

      if (this.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(jsonData)
        writeFileSync(this.filePath, encrypted)
      } else {
        console.warn(
          "[SnowflakeCredentialStore] safeStorage not available - storing without encryption"
        )
        writeFileSync(this.filePath + ".json", jsonData, "utf-8")
      }
    } catch (error) {
      console.error("[SnowflakeCredentialStore] Failed to save:", error)
      throw error
    }
  }

  /**
   * Load Snowflake connection (decrypts if encrypted)
   */
  load(): StoredSnowflakeConnection | null {
    try {
      // Try encrypted file first
      if (existsSync(this.filePath) && this.isEncryptionAvailable()) {
        const encrypted = readFileSync(this.filePath)
        const decrypted = safeStorage.decryptString(encrypted)
        return JSON.parse(decrypted)
      }

      // Fallback: try unencrypted file
      const fallbackPath = this.filePath + ".json"
      if (existsSync(fallbackPath)) {
        const content = readFileSync(fallbackPath, "utf-8")
        const data = JSON.parse(content)

        // Migrate to encrypted storage if now available
        if (this.isEncryptionAvailable()) {
          this.save(data)
          unlinkSync(fallbackPath)
        }

        return data
      }

      return null
    } catch (error) {
      console.error("[SnowflakeCredentialStore] Failed to load:", error)
      return null
    }
  }

  /**
   * Clear stored credentials
   */
  clear(): void {
    try {
      if (existsSync(this.filePath)) {
        unlinkSync(this.filePath)
      }
      const fallbackPath = this.filePath + ".json"
      if (existsSync(fallbackPath)) {
        unlinkSync(fallbackPath)
      }
    } catch (error) {
      console.error("[SnowflakeCredentialStore] Failed to clear:", error)
    }
  }

  /**
   * Check if credentials exist
   */
  hasCredentials(): boolean {
    return (
      existsSync(this.filePath) || existsSync(this.filePath + ".json")
    )
  }

  /**
   * Update last used timestamp
   */
  updateLastUsed(): void {
    const connection = this.load()
    if (connection) {
      connection.lastUsedAt = new Date().toISOString()
      this.save(connection)
    }
  }
}

// Singleton instance
let credentialStoreInstance: SnowflakeCredentialStore | null = null

export function getSnowflakeCredentialStore(
  userDataPath: string
): SnowflakeCredentialStore {
  if (!credentialStoreInstance) {
    credentialStoreInstance = new SnowflakeCredentialStore(userDataPath)
  }
  return credentialStoreInstance
}
