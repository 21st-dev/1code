#!/usr/bin/env node
/**
 * Shared utilities for build scripts
 * 
 * Provides common functionality used across multiple .mjs scripts:
 * - Path resolution
 * - Package.json reading
 * - File operations
 * - Hash calculation
 * - Formatting utilities
 */

import { readFileSync, existsSync, mkdirSync, statSync, readdirSync, createReadStream } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createHash } from "crypto"

/**
 * Get the directory of the current script
 * @param {string} importMetaUrl - import.meta.url from the calling script
 * @returns {string} Directory path of the current script
 */
export function getScriptDir(importMetaUrl) {
  const __filename = fileURLToPath(importMetaUrl)
  return dirname(__filename)
}

/**
 * Get the project root directory (parent of scripts/)
 * @param {string} importMetaUrl - import.meta.url from the calling script
 * @returns {string} Root directory path
 */
export function getRootDir(importMetaUrl) {
  return join(getScriptDir(importMetaUrl), "..")
}

/**
 * Read and parse package.json
 * @param {string} rootDir - Root directory of the project
 * @returns {object} Parsed package.json object
 */
export function readPackageJson(rootDir) {
  const packageJsonPath = join(rootDir, "package.json")
  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`)
  }
  return JSON.parse(readFileSync(packageJsonPath, "utf-8"))
}

/**
 * Get version from package.json or environment variable
 * @param {string} rootDir - Root directory of the project
 * @returns {string} Version string
 */
export function getVersion(rootDir) {
  return process.env.VERSION || readPackageJson(rootDir).version
}

/**
 * Check if a file or directory exists
 * @param {string} filePath - Path to check
 * @returns {boolean} True if exists, false otherwise
 */
export function fileExists(filePath) {
  return existsSync(filePath)
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Directory path
 */
export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * Get file size in bytes
 * @param {string} filePath - Path to file
 * @returns {number} File size in bytes
 */
export function getFileSize(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  return statSync(filePath).size
}

/**
 * Calculate hash of a file
 * @param {string} filePath - Path to file
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @param {string} encoding - Output encoding (default: 'hex')
 * @returns {Promise<string>} Hash string
 */
export function calculateHash(filePath, algorithm = "sha256", encoding = "hex") {
  return new Promise((resolve, reject) => {
    if (!existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`))
    }

    const hash = createHash(algorithm)
    const stream = createReadStream(filePath)

    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve(hash.digest(encoding)))
    stream.on("error", reject)
  })
}

/**
 * Calculate SHA256 hash of a file (hex encoding)
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} SHA256 hash in hex
 */
export function calculateSha256(filePath) {
  return calculateHash(filePath, "sha256", "hex")
}

/**
 * Calculate SHA512 hash of a file (base64 encoding)
 * @param {string} filePath - Path to file
 * @returns {string} SHA512 hash in base64 (synchronous for compatibility)
 */
export function calculateSha512(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  const content = readFileSync(filePath)
  return createHash("sha512").update(content).digest("base64")
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

/**
 * Find files matching a pattern in a directory
 * @param {string} dirPath - Directory to search
 * @param {Function} predicate - Function to test each filename
 * @returns {string[]} Array of matching file paths
 */
export function findFiles(dirPath, predicate) {
  if (!existsSync(dirPath)) {
    return []
  }

  const files = readdirSync(dirPath)
  return files
    .filter(predicate)
    .map((file) => join(dirPath, file))
}

/**
 * Find a single file matching a pattern
 * @param {string} dirPath - Directory to search
 * @param {Function} predicate - Function to test each filename
 * @returns {string|null} Matching file path or null
 */
export function findFile(dirPath, predicate) {
  const files = findFiles(dirPath, predicate)
  return files.length > 0 ? files[0] : null
}
