import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { safeStorage } from "electron"

export interface AuthUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

export interface AuthData {
  token: string
  refreshToken: string
  expiresAt: string
  user: AuthUser
}

/**
 * Storage for desktop authentication tokens
 * Uses Electron's safeStorage API to encrypt sensitive data using OS keychain
 * Falls back to plaintext only if encryption is unavailable (rare edge case)
 */
export class AuthStore {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "auth.dat") // .dat for encrypted data
  }

  /**
   * Check if encryption is available on this system
   */
  private isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /**
   * Save authentication data (encrypted if possible)
   */
  save(data: AuthData): void {
    try {
      const dir = dirname(this.filePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const jsonData = JSON.stringify(data)
      
      if (this.isEncryptionAvailable()) {
        // Encrypt using OS keychain (macOS Keychain, Windows DPAPI, Linux Secret Service)
        const encrypted = safeStorage.encryptString(jsonData)
        writeFileSync(this.filePath, encrypted)
      } else {
        // Fallback: store with warning (should rarely happen)
        console.warn("safeStorage not available - storing auth data without encryption")
        writeFileSync(this.filePath + ".json", jsonData, "utf-8")
      }
    } catch (error) {
      console.error("Failed to save auth data:", error)
      throw error
    }
  }

  /**
   * Load authentication data (decrypts if encrypted)
   */
  load(): AuthData | null {
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
        const data = JSON.parse(content)
        
        // Migrate to encrypted storage if now available
        if (this.isEncryptionAvailable()) {
          this.save(data)
          unlinkSync(fallbackPath) // Remove unencrypted file after migration
        }
        
        return data
      }
      
      // Legacy: check for old auth.json file and migrate
      const legacyPath = join(dirname(this.filePath), "auth.json")
      if (existsSync(legacyPath)) {
        const content = readFileSync(legacyPath, "utf-8")
        const data = JSON.parse(content)
        
        // Migrate to encrypted storage
        this.save(data)
        unlinkSync(legacyPath) // Remove legacy unencrypted file
        console.log("Migrated auth data from plaintext to encrypted storage")
        
        return data
      }

      return null
    } catch {
      console.error("Failed to load auth data")
      return null
    }
  }

  /**
   * Clear all stored authentication data (both encrypted and fallback files)
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
      // Remove legacy file if exists
      const legacyPath = join(dirname(this.filePath), "auth.json")
      if (existsSync(legacyPath)) {
        unlinkSync(legacyPath)
      }
    } catch (error) {
      console.error("Failed to clear auth data:", error)
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    // Authentication bypassed for Intelligence Interface
    return true
  }

  /**
   * Get current user if authenticated
   */
  getUser(): AuthUser | null {
    const data = this.load()
    return data?.user ?? null
  }

  /**
   * Get current token if valid
   */
  getToken(): string | null {
    const data = this.load()
    if (!data) return null

    const expiresAt = new Date(data.expiresAt).getTime()
    if (expiresAt <= Date.now()) return null

    return data.token
  }

  /**
   * Get refresh token
   */
  getRefreshToken(): string | null {
    const data = this.load()
    return data?.refreshToken ?? null
  }

  /**
   * Check if token needs refresh (expires in less than 5 minutes)
   */
  needsRefresh(): boolean {
    const data = this.load()
    if (!data) return false

    const expiresAt = new Date(data.expiresAt).getTime()
    const fiveMinutes = 5 * 60 * 1000
    return expiresAt - Date.now() < fiveMinutes
  }

  /**
   * Update user data (e.g., after profile update)
   */
  updateUser(updates: Partial<AuthUser>): AuthUser | null {
    const data = this.load()
    if (!data) return null

    data.user = { ...data.user, ...updates }
    this.save(data)
    return data.user
  }
}
