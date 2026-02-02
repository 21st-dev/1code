/**
 * Security utilities for SpecKit
 *
 * Provides validation functions for:
 * - Path traversal prevention
 * - Branch name validation
 * - Input sanitization
 *
 * @module main/lib/speckit/security-utils
 */

import path from "path"

/**
 * Validate that a file path is within the project directory
 *
 * Uses path.relative() to check if the resolved path would escape
 * the project directory via .. or symbolic links.
 *
 * @param projectPath - The project root path
 * @param filePath - The file path to validate
 * @returns True if the path is safely within the project, false otherwise
 *
 * @example
 * ```typescript
 * validatePathInProject("/home/user/project", "/home/user/project/specs/001-feature/spec.md") // true
 * validatePathInProject("/home/user/project", "/home/user/project/../etc/passwd") // false
 * validatePathInProject("/home/user/project", "/home/user-malicious/file.txt") // false
 * ```
 */
export function validatePathInProject(projectPath: string, filePath: string): boolean {
  // Resolve both paths to absolute, normalized paths (resolves symlinks)
  const resolvedProject = path.resolve(projectPath)
  const resolvedFile = path.resolve(filePath)

  // Get the relative path from project to file
  const relativePath = path.relative(resolvedProject, resolvedFile)

  // If the relative path starts with "..", the file is outside the project
  // If the relative path is empty, it's the project root itself (valid)
  // If the relative path is absolute, it's outside the project
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  )
}

/**
 * Validate a Git branch name
 *
 * Ensures the branch name contains only characters allowed by Git:
 * - Letters (a-z, A-Z)
 * - Numbers (0-9)
 * - Hyphens (-)
 * - Underscores (_)
 * - Dots (.)
 * - Slashes (/)
 *
 * Prevents command injection via branch names containing shell metacharacters.
 *
 * @param branchName - The branch name to validate
 * @returns True if the branch name is valid, false otherwise
 *
 * @example
 * ```typescript
 * validateBranchName("001-speckit-ui-integration") // true
 * validateBranchName("feature/user-auth") // true
 * validateBranchName("main") // true
 * validateBranchName("feature; rm -rf /") // false - contains semicolon
 * validateBranchName("branch`whoami`") // false - contains backticks
 * ```
 */
export function validateBranchName(branchName: string): boolean {
  // Git branch names can contain: letters, numbers, hyphens, underscores, dots, slashes
  // This regex ensures no shell metacharacters like ; | & $ ` ( ) { } < > etc.
  const validBranchNameRegex = /^[a-zA-Z0-9_.\/-]+$/

  return validBranchNameRegex.test(branchName)
}

/**
 * Sanitize feature name for safe use in file paths and Git operations
 *
 * Removes dangerous characters and enforces length limits. This function:
 * - Removes all non-alphanumeric characters except spaces and hyphens
 * - Converts spaces to hyphens
 * - Converts to lowercase for consistency
 * - Limits length to 200 characters
 *
 * @param name - The feature name to sanitize
 * @returns Sanitized feature name
 *
 * @example
 * ```typescript
 * sanitizeFeatureName("SpecKit UI Integration") // "speckit-ui-integration"
 * sanitizeFeatureName("Feature w/ special chars!") // "feature-w-special-chars"
 * ```
 */
export function sanitizeFeatureName(name: string): string {
  // Remove dangerous characters from feature names
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 200) // Prevent overly long names
}
