import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { safeStorage } from "electron"

export interface AzureConfig {
  endpoint: string     // https://your-resource.openai.azure.com
  apiKey: string       // Azure API key
  deploymentName: string // Claude deployment name
}

/**
 * Storage for Azure Claude credentials
 * Uses Electron's safeStorage API to encrypt sensitive data using OS keychain
 * Falls back to plaintext only if encryption is unavailable (rare edge case)
 */
export class AuthStore {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "azure-config.dat") // .dat for encrypted data
  }

  /**
   * Check if encryption is available on this system
   */
  private isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /**
   * Save Azure configuration (encrypted if possible)
   */
  save(config: AzureConfig): void {
    try {
      const dir = dirname(this.filePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const jsonData = JSON.stringify(config)

      if (this.isEncryptionAvailable()) {
        // Encrypt using OS keychain (macOS Keychain, Windows DPAPI, Linux Secret Service)
        const encrypted = safeStorage.encryptString(jsonData)
        writeFileSync(this.filePath, encrypted)
      } else {
        // Fallback: store with warning (should rarely happen)
        console.warn("safeStorage not available - storing config without encryption")
        writeFileSync(this.filePath + ".json", jsonData, "utf-8")
      }
    } catch (error) {
      console.error("Failed to save Azure config:", error)
      throw error
    }
  }

  /**
   * Load Azure configuration (decrypts if encrypted)
   */
  load(): AzureConfig | null {
    try {
      // Try encrypted file first
      if (existsSync(this.filePath) && this.isEncryptionAvailable()) {
        const encrypted = readFileSync(this.filePath)
        const decrypted = safeStorage.decryptString(encrypted)
        return JSON.parse(decrypted)
      }

      // Fallback: try unencrypted file (for migration or when encryption unavailable)
      const fallbackPath = this.filePath + ".json"
      if (existsSync(fallbackPath)) {
        const content = readFileSync(fallbackPath, "utf-8")
        const config = JSON.parse(content)

        // Migrate to encrypted storage if now available
        if (this.isEncryptionAvailable()) {
          this.save(config)
          unlinkSync(fallbackPath) // Remove unencrypted file after migration
        }

        return config
      }

      return null
    } catch {
      console.error("Failed to load Azure config")
      return null
    }
  }

  /**
   * Clear stored Azure configuration
   */
  clear(): void {
    try {
      // Remove encrypted file
      if (existsSync(this.filePath)) {
        unlinkSync(this.filePath)
      }
      // Remove fallback unencrypted file if exists
      const fallbackPath = this.filePath + ".json"
      if (existsSync(fallbackPath)) {
        unlinkSync(fallbackPath)
      }
    } catch (error) {
      console.error("Failed to clear Azure config:", error)
    }
  }

  /**
   * Check if Azure credentials are configured
   */
  isConfigured(): boolean {
    const config = this.load()
    return config !== null &&
           config.endpoint.length > 0 &&
           config.apiKey.length > 0 &&
           config.deploymentName.length > 0
  }

  /**
   * Get current configuration
   */
  getConfig(): AzureConfig | null {
    return this.load()
  }
}
