import { safeStorage } from "electron"
import { execFileSync } from "child_process"
import { existsSync } from "fs"
import { homedir } from "os"

const FALLBACK_PREFIX = "locus:v1:base64:"

let unavailableWarningShown = false
let decryptWarningShown = false
let encryptWarningShown = false
let macKeychainPreflight: boolean | null = null

function safeStorageDisabled(): boolean {
  const value =
    process.env.LOCUS_DISABLE_SAFE_STORAGE ??
    process.env.AGENT_CODE_FOR_ME_DISABLE_SAFE_STORAGE
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "")
}

function hasUsableMacDefaultKeychain(): boolean {
  if (process.platform !== "darwin") return true
  if (macKeychainPreflight !== null) return macKeychainPreflight

  try {
    const output = execFileSync("/usr/bin/security", ["default-keychain"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1000,
    }).trim()
    const keychainPath = output
      .replace(/^"|"$/g, "")
      .replace(/^~(?=\/)/, homedir())

    macKeychainPreflight = Boolean(keychainPath && existsSync(keychainPath))
  } catch {
    macKeychainPreflight = false
  }

  return macKeychainPreflight
}

function warnOnce(kind: "unavailable" | "decrypt" | "encrypt", message: string, error?: unknown): void {
  if (kind === "unavailable") {
    if (unavailableWarningShown) return
    unavailableWarningShown = true
  } else if (kind === "decrypt") {
    if (decryptWarningShown) return
    decryptWarningShown = true
  } else {
    if (encryptWarningShown) return
    encryptWarningShown = true
  }

  console.warn(message, error)
}

export function isSecureStorageAvailable(): boolean {
  if (safeStorageDisabled()) return false
  if (!hasUsableMacDefaultKeychain()) {
    warnOnce(
      "unavailable",
      "[SecureStorage] macOS default keychain is unavailable; continuing without blocking startup.",
    )
    return false
  }

  try {
    return safeStorage.isEncryptionAvailable()
  } catch (error) {
    warnOnce(
      "unavailable",
      "[SecureStorage] OS encryption is unavailable; continuing without blocking startup.",
      error,
    )
    return false
  }
}

export function encryptStringForStorage(value: string): string {
  if (isSecureStorageAvailable()) {
    try {
      return safeStorage.encryptString(value).toString("base64")
    } catch (error) {
      warnOnce(
        "encrypt",
        "[SecureStorage] Failed to encrypt secret; storing fallback value.",
        error,
      )
    }
  }

  return `${FALLBACK_PREFIX}${Buffer.from(value, "utf-8").toString("base64")}`
}

export function decryptStringFromStorage(encrypted: string): string | null {
  if (encrypted.startsWith(FALLBACK_PREFIX)) {
    return Buffer.from(encrypted.slice(FALLBACK_PREFIX.length), "base64").toString(
      "utf-8",
    )
  }

  if (isSecureStorageAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
    } catch (error) {
      warnOnce(
        "decrypt",
        "[SecureStorage] Failed to decrypt secret; treating the credential as unavailable.",
        error,
      )
      return null
    }
  }

  try {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  } catch {
    return null
  }
}

export function encryptStringToBuffer(value: string): Buffer | null {
  if (!isSecureStorageAvailable()) return null

  try {
    return safeStorage.encryptString(value)
  } catch (error) {
    warnOnce(
      "encrypt",
      "[SecureStorage] Failed to encrypt data; storing fallback value.",
      error,
    )
    return null
  }
}

export function decryptBufferToString(encrypted: Buffer): string | null {
  if (!isSecureStorageAvailable()) return null

  try {
    return safeStorage.decryptString(encrypted)
  } catch (error) {
    warnOnce(
      "decrypt",
      "[SecureStorage] Failed to decrypt data; continuing without blocking startup.",
      error,
    )
    return null
  }
}
