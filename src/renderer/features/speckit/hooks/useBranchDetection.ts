/**
 * Branch detection hook for UI decisions
 */

import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  speckitCurrentBranchNameAtom,
  speckitCurrentBranchTypeAtom,
} from '../atoms'
import {
  isNamedFeatureBranch,
  isProtectedBranch,
  parseFeatureBranch,
} from '../types/branch'

/**
 * Result of branch detection
 */
export interface BranchDetectionResult {
  branchName: string | null
  branchType: 'NAMED' | 'FEATURE' | null
  isNamedBranch: boolean
  isFeatureBranch: boolean
  featureInfo: { number: string; name: string } | null
}

/**
 * Hook to detect and classify the current Git branch
 *
 * Used to determine if the New Feature button should be visible
 * (only visible on named branches like main/master/dev/staging/internal)
 * and to provide branch information to UI components
 */
export function useBranchDetection(): BranchDetectionResult {
  const branchName = useAtomValue(speckitCurrentBranchNameAtom)
  const setBranchType = useSetAtom(speckitCurrentBranchTypeAtom)

  const detect = useCallback((name: string | null): BranchDetectionResult => {
    if (!name) {
      setBranchType(null)
      return {
        branchName: null,
        branchType: null,
        isNamedBranch: false,
        isFeatureBranch: false,
        featureInfo: null,
      }
    }

    if (isProtectedBranch(name)) {
      setBranchType('NAMED')
      return {
        branchName: name,
        branchType: 'NAMED' as const,
        isNamedBranch: true,
        isFeatureBranch: false,
        featureInfo: null,
      }
    }

    // All other branches (feat/*, feature/*, 001-*, etc.) are feature branches
    const info = parseFeatureBranch(name)
    setBranchType('FEATURE')
    return {
      branchName: name,
      branchType: 'FEATURE' as const,
      isNamedBranch: false,
      isFeatureBranch: true,
      featureInfo: info ? { number: info.featureNumber, name: info.featureName } : null,
    }
  }, [setBranchType])

  return detect(branchName)
}
