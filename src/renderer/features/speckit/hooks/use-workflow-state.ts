/**
 * useWorkflowState Hook
 *
 * Custom hook for fetching and managing workflow state.
 * Wraps trpc.speckit.getWorkflowState.useQuery with additional logic.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { trpc } from "@/lib/trpc"

interface UseWorkflowStateOptions {
  /** Project path (required) */
  projectPath: string | undefined
  /** Whether to enable the query */
  enabled?: boolean
  /** Refetch interval in ms (default: disabled) */
  refetchInterval?: number | false
}

/**
 * Hook to fetch and manage workflow state
 *
 * Detects workflow state from Git branch and file system:
 * - Current feature branch
 * - Which artifacts exist
 * - Current workflow step
 * - Clarification questions if any
 */
export function useWorkflowState({
  projectPath,
  enabled = true,
  refetchInterval = false,
}: UseWorkflowStateOptions) {
  const query = trpc.speckit.getWorkflowState.useQuery(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath && enabled,
      refetchOnWindowFocus: false,
      refetchInterval,
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
