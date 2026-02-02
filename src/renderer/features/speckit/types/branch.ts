/**
 * Branch type classification for UI display decisions
 */

/**
 * Classification of Git branches for UI display decisions
 */
export enum BranchType {
  NamedFeature = 'NAMED_FEATURE',
  Protected = 'PROTECTED',
}

/**
 * Protected branch names that should not show feature creation UI
 */
export const PROTECTED_BRANCHES = [
  'main',
  'master',
  'internal',
  'staging',
  'dev',
] as const

export type ProtectedBranchName = typeof PROTECTED_BRANCHES[number]

/**
 * Check if a branch name is a protected branch
 */
export function isProtectedBranch(branchName: string): boolean {
  return PROTECTED_BRANCHES.includes(branchName as ProtectedBranchName)
}

/**
 * Check if a branch name is a named feature branch
 * Named feature branches follow pattern: ###-short-name (e.g., 001-speckit-ui-integration)
 */
export function isNamedFeatureBranch(branchName: string): boolean {
  if (isProtectedBranch(branchName)) {
    return false
  }
  // Pattern: 3 digits followed by dash and name
  return /^\d{3}-.+/.test(branchName)
}

/**
 * Parse a feature branch name into its components
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
