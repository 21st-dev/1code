/**
 * File utilities for ii-spec integration
 *
 * Provides functions for:
 * - Git branch detection
 * - Feature branch parsing
 * - File existence checks
 * - Directory listing
 *
 * @see specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md
 */

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { validatePathInProject } from "./security-utils"

/**
 * Get the current Git branch name
 *
 * @param projectPath - The project root path
 * @returns The current branch name
 * @throws Error if not a git repository or git command fails
 */
export function getCurrentBranch(projectPath: string): string {
  try {
    return execSync("git branch --show-current", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim()
  } catch (error) {
    throw new Error(
      `Failed to get current branch: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * Parse a feature branch name to extract feature number and name
 *
 * @param branchName - The branch name (e.g., "001-speckit-ui-integration")
 * @returns Object with featureNumber and featureName, or null if not a feature branch
 */
export function parseFeatureBranch(branchName: string): {
  featureNumber: string
  featureName: string
} | null {
  const match = branchName.match(/^(\d{3})-(.+)$/)
  if (!match) return null
  return {
    featureNumber: match[1],
    featureName: match[2],
  }
}

/**
 * Check if a file exists
 *
 * @param filePath - The absolute path to check
 * @returns True if file exists, false otherwise
 */
export function checkFileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * Read file content as a string
 *
 * @param filePath - The absolute path to read
 * @returns The file content as UTF-8 string
 * @throws Error if file does not exist or cannot be read
 */
export function readFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8")
  } catch (error) {
    throw new Error(
      `Failed to read file ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * List feature directories in the specs/ folder
 *
 * Feature directories match the pattern /^\d{3}-/ (e.g., "001-speckit-ui-integration")
 *
 * @param projectPath - The project root path
 * @returns Array of feature directory names, sorted by feature number
 */
export function listFeatureDirectories(projectPath: string): string[] {
  const specsDir = path.join(projectPath, "specs")

  if (!fs.existsSync(specsDir)) {
    return []
  }

  try {
    const entries = fs.readdirSync(specsDir, { withFileTypes: true })
    return entries
      .filter((entry) => {
        if (!entry.isDirectory() || !/^\d{3}-/.test(entry.name)) {
          return false
        }

        // SECURITY: Validate each feature path is within project
        const featurePath = path.join(specsDir, entry.name)
        if (!validatePathInProject(projectPath, featurePath)) {
          console.warn(`Skipping feature directory outside project: ${entry.name}`)
          return false
        }

        return true
      })
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Get all feature branches from Git
 *
 * @param projectPath - The project root path
 * @returns Array of branch names matching the feature pattern
 */
export function listFeatureBranches(projectPath: string): string[] {
  try {
    const output = execSync("git branch -a", {
      cwd: projectPath,
      encoding: "utf-8",
    })

    return output
      .split("\n")
      .map((line) => line.trim().replace(/^\*\s*/, "").replace(/^remotes\/origin\//, ""))
      .filter((branch) => /^\d{3}-/.test(branch))
      .filter((branch, index, self) => self.indexOf(branch) === index) // Unique
      .sort()
  } catch {
    return []
  }
}

/**
 * Check which artifacts exist for a feature
 *
 * @param projectPath - The project root path
 * @param featureBranch - The feature branch name (e.g., "001-speckit-ui-integration")
 * @returns Object indicating which artifacts exist
 */
export function checkArtifactsPresent(
  projectPath: string,
  featureBranch: string
): {
  spec: boolean
  plan: boolean
  research: boolean
  tasks: boolean
} {
  const featureDir = path.join(projectPath, "specs", featureBranch)

  return {
    spec: checkFileExists(path.join(featureDir, "spec.md")),
    plan: checkFileExists(path.join(featureDir, "plan.md")),
    research: checkFileExists(path.join(featureDir, "research.md")),
    tasks: checkFileExists(path.join(featureDir, "tasks.md")),
  }
}

/**
 * Get the artifact file path
 *
 * @param projectPath - The project root path
 * @param featureBranch - The feature branch name
 * @param artifactType - The type of artifact (spec, plan, research, tasks)
 * @returns The full path to the artifact file
 */
export function getArtifactPath(
  projectPath: string,
  featureBranch: string,
  artifactType: "spec" | "plan" | "research" | "tasks"
): string {
  const artifactPath = path.join(projectPath, "specs", featureBranch, `${artifactType}.md`)

  // SECURITY: Validate path is within project to prevent traversal attacks
  if (!validatePathInProject(projectPath, artifactPath)) {
    throw new Error(`Path traversal detected: ${featureBranch}`)
  }

  return artifactPath
}

/**
 * Get the constitution file path
 *
 * @param projectPath - The project root path
 * @returns The full path to the constitution file
 */
export function getConstitutionPath(projectPath: string): string {
  const constitutionPath = path.join(projectPath, ".specify", "memory", "constitution.md")

  // SECURITY: Validate path is within project
  if (!validatePathInProject(projectPath, constitutionPath)) {
    throw new Error("Invalid constitution path")
  }

  return constitutionPath
}

/**
 * Check if the ii-spec submodule is properly initialized
 *
 * Checks both that the submodule directory exists and contains expected files.
 *
 * @param projectPath - The project root path
 * @returns Object with initialized status and details
 */
export function checkSubmoduleStatus(projectPath: string): {
  initialized: boolean
  exists: boolean
  hasContent: boolean
  submodulePath: string
  message: string
} {
  const submodulePath = path.join(projectPath, "submodules", "ii-spec")

  // Check if the submodule directory exists
  const exists = fs.existsSync(submodulePath)
  if (!exists) {
    return {
      initialized: false,
      exists: false,
      hasContent: false,
      submodulePath,
      message: "ii-spec submodule directory does not exist. Run: git submodule update --init --recursive",
    }
  }

  // Check if the submodule has content (not just an empty directory)
  // A properly initialized submodule should have ALL of these files
  const expectedFiles = ["README.md", "pyproject.toml", "templates"]
  const hasContent = expectedFiles.every((file) =>  // CHANGED: from .some() to .every()
    fs.existsSync(path.join(submodulePath, file))
  )

  if (!hasContent) {
    const missingFiles = expectedFiles.filter(file =>
      !fs.existsSync(path.join(submodulePath, file))
    )
    return {
      initialized: false,
      exists: true,
      hasContent: false,
      submodulePath,
      message: `ii-spec submodule exists but is missing files: ${missingFiles.join(", ")}. Run: git submodule update --init --recursive`,
    }
  }

  return {
    initialized: true,
    exists: true,
    hasContent: true,
    submodulePath,
    message: "ii-spec submodule is properly initialized",
  }
}

/**
 * Extract description from spec.md file
 *
 * Parses the spec.md and extracts the feature description (first paragraph after title)
 *
 * @param specContent - The spec.md file content
 * @returns The feature description or empty string if not found
 */
export function extractFeatureDescription(specContent: string): string {
  const lines = specContent.split("\n")
  let foundTitle = false
  let description = ""

  for (const line of lines) {
    // Skip empty lines before finding content
    if (!foundTitle && line.trim() === "") continue

    // Skip the title line (# heading)
    if (line.startsWith("#") && !foundTitle) {
      foundTitle = true
      continue
    }

    // Skip empty lines after title
    if (foundTitle && line.trim() === "") {
      if (description) break // End of first paragraph
      continue
    }

    // Collect first paragraph
    if (foundTitle) {
      description += (description ? " " : "") + line.trim()
    }
  }

  return description
}
