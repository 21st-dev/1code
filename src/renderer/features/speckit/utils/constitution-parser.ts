/**
 * Constitution Parser Utilities
 *
 * Functions for parsing constitution.md content.
 *
 * @see specs/001-speckit-ui-integration/data-model.md
 */

import type { ConstitutionPreview } from "../types"

/**
 * Extract principle names from constitution content
 *
 * Looks for markdown headers in various formats:
 * - ## Principle I - Desktop-First
 * - ## Principle II - Git Worktree Isolation
 * - ### I. Desktop-First Experience
 * - ### II. Git Worktree Isolation (NON-NEGOTIABLE)
 *
 * @param constitutionContent - The constitution.md file content
 * @returns Array of principle names
 */
export function extractPrincipleNames(constitutionContent: string): string[] {
  const lines = constitutionContent.split("\n")
  const principleNames: string[] = []

  for (const line of lines) {
    // Pattern 1: "## Principle I - Desktop-First"
    const pattern1 = line.match(/^##\s+Principle\s+[IVX]+\s+-\s+(.+)$/i)
    if (pattern1) {
      principleNames.push(pattern1[1].trim())
      continue
    }

    // Pattern 2: "### I. Desktop-First Experience" (with optional parenthetical)
    const pattern2 = line.match(/^###\s+[IVX]+\.\s+(.+?)(?:\s+\(.+\))?$/i)
    if (pattern2) {
      principleNames.push(pattern2[1].trim())
      continue
    }

    // Pattern 3: "## I. Desktop-First Experience" (H2 with Roman numeral)
    const pattern3 = line.match(/^##\s+[IVX]+\.\s+(.+?)(?:\s+\(.+\))?$/i)
    if (pattern3) {
      principleNames.push(pattern3[1].trim())
      continue
    }
  }

  return principleNames
}

/**
 * Extract last amended date from constitution content
 *
 * Looks for patterns like:
 * - Last amended: 2024-01-15
 * - Amended: January 15, 2024
 *
 * @param constitutionContent - The constitution.md file content
 * @returns Date if found, undefined otherwise
 */
export function extractLastAmended(constitutionContent: string): Date | undefined {
  // Pattern 1: ISO date format
  const isoMatch = constitutionContent.match(/(?:last\s+)?amended:\s*(\d{4}-\d{2}-\d{2})/i)
  if (isoMatch) {
    const date = new Date(isoMatch[1])
    return isNaN(date.getTime()) ? undefined : date
  }

  // Pattern 2: Written date format
  const writtenMatch = constitutionContent.match(
    /(?:last\s+)?amended:\s*(\w+\s+\d{1,2},?\s+\d{4})/i
  )
  if (writtenMatch) {
    const date = new Date(writtenMatch[1])
    return isNaN(date.getTime()) ? undefined : date
  }

  return undefined
}

/**
 * Parse constitution content into a preview object
 *
 * @param content - The constitution.md file content
 * @returns ConstitutionPreview object
 */
export function parseConstitutionPreview(content: string): ConstitutionPreview {
  const principleNames = extractPrincipleNames(content)
  const lastAmended = extractLastAmended(content)

  return {
    principleNames,
    principleCount: principleNames.length,
    lastAmended,
  }
}
