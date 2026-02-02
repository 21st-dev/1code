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
  branchType: 'NAMED_FEATURE' | 'PROTECTED' | null
  isNamedFeature: boolean
  isProtected: boolean
  featureInfo: { number: string; name: string } | null
}

/**
 * Hook to detect and classify the current Git branch
 *
 * Used to determine if the New Feature button should be visible
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
        isNamedFeature: false,
        isProtected: false,
        featureInfo: null,
      }
    }

    if (isProtectedBranch(name)) {
      setBranchType('PROTECTED')
      return {
        branchName: name,
        branchType: 'PROTECTED' as const,
        isNamedFeature: false,
        isProtected: true,
        featureInfo: null,
      }
    }

    if (isNamedFeatureBranch(name)) {
      setBranchType('NAMED_FEATURE')
      const info = parseFeatureBranch(name)
      return {
        branchName: name,
        branchType: 'NAMED_FEATURE' as const,
        isNamedFeature: true,
        isProtected: false,
        featureInfo: info ? { number: info.featureNumber, name: info.featureName } : null,
      }
    }

    setBranchType(null)
    return {
      branchName: name,
      branchType: null,
      isNamedFeature: false,
      isProtected: false,
      featureInfo: null,
    }
  }, [setBranchType])

  return detect(branchName)
}
