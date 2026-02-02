/**
 * useWorkflowState Hook
 *
 * Custom hook for fetching and managing workflow state.
 * Wraps trpc.speckit.getWorkflowState.useQuery with additional logic.
 *
 * Features:
 * - Debounced polling with configurable interval
 * - Stale time to prevent unnecessary refetches
 * - File system state detection from Git branch and artifacts
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { useMemo } from "react"
import { trpc } from "@/lib/trpc"

/** Default stale time for workflow state (prevents excessive polling) */
const DEFAULT_STALE_TIME = 5000 // 5 seconds

/** Minimum refetch interval to prevent excessive polling */
const MIN_REFETCH_INTERVAL = 2000 // 2 seconds

interface UseWorkflowStateOptions {
  /** Project path (required) */
  projectPath: string | undefined
  /** Whether to enable the query */
  enabled?: boolean
  /** Refetch interval in ms (default: disabled). Minimum 2 seconds to prevent excessive polling. */
  refetchInterval?: number | false
  /** Stale time in ms (default: 5 seconds) */
  staleTime?: number
}

/**
 * Hook to fetch and manage workflow state
 *
 * Detects workflow state from Git branch and file system:
 * - Current feature branch
 * - Which artifacts exist
 * - Current workflow step
 * - Clarification questions if any
 *
 * @param options - Configuration options
 * @returns Workflow state data and query helpers
 */
export function useWorkflowState({
  projectPath,
  enabled = true,
  refetchInterval = false,
  staleTime = DEFAULT_STALE_TIME,
}: UseWorkflowStateOptions) {
  // Enforce minimum refetch interval to prevent excessive polling
  const effectiveRefetchInterval = useMemo(() => {
    if (refetchInterval === false) return false
    return Math.max(refetchInterval, MIN_REFETCH_INTERVAL)
  }, [refetchInterval])

  const query = trpc.speckit.getWorkflowState.useQuery(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath && enabled,
      refetchOnWindowFocus: false,
      refetchInterval: effectiveRefetchInterval,
      staleTime, // Debounce: prevent refetch if data is still fresh
      // Don't retry on failure - file system state may have changed
      retry: false,
    }
  )

  return {
    /** Workflow state data */
    workflowState: query.data,
    /** Loading state */
    isLoading: query.isLoading,
    /** Fetching state (includes background refetches) */
    isFetching: query.isFetching,
    /** Error state */
    isError: query.isError,
    /** Error message */
    error: query.error,
    /** Refetch function */
    refetch: query.refetch,
    /** Current workflow step */
    currentStep: query.data?.currentStep,
    /** Feature branch name */
    branchName: query.data?.branchName,
    /** Feature number */
    featureNumber: query.data?.featureNumber,
    /** Feature name */
    featureName: query.data?.featureName,
    /** Artifacts present */
    artifactsPresent: query.data?.artifactsPresent,
    /** Whether clarification is needed */
    needsClarification: query.data?.needsClarification ?? false,
    /** Clarification questions */
    clarificationQuestions: query.data?.clarificationQuestions,
    /** Whether on a feature branch */
    isOnFeatureBranch: query.data?.currentStep !== "no-feature",
  }
}
