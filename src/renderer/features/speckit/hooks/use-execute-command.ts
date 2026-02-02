/**
 * useExecuteCommand Hook
 *
 * Custom hook for executing ii-spec commands via subprocess.
 * Wraps trpc.speckit.executeCommand.useMutation with state management.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { useState, useCallback } from "react"
import { useSetAtom } from "jotai"
import { trpc } from "@/lib/trpc"
import { speckitExecutionIdAtom, speckitLoadingAtom } from "../atoms"

interface UseExecuteCommandOptions {
  /** Project path (required) */
  projectPath: string | undefined
  /** Callback when command starts */
  onStart?: (executionId: string) => void
  /** Callback when command succeeds */
  onSuccess?: (executionId: string) => void
  /** Callback when command fails */
  onError?: (error: string) => void
}

/**
 * Hook to execute ii-spec commands
 *
 * Executes commands via subprocess and returns execution ID
 * for subscribing to output stream.
 */
export function useExecuteCommand({
  projectPath,
  onStart,
  onSuccess,
  onError,
}: UseExecuteCommandOptions) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null)

  const setGlobalExecutionId = useSetAtom(speckitExecutionIdAtom)
  const setGlobalLoading = useSetAtom(speckitLoadingAtom)

  const mutation = trpc.speckit.executeCommand.useMutation()
  const cancelMutation = trpc.speckit.cancelCommand.useMutation()

  const execute = useCallback(
    async (command: string, args: string = "") => {
      if (!projectPath) {
        const error = "Project path is required"
        setLastError(error)
        onError?.(error)
        return null
      }

      setIsExecuting(true)
      setLastError(null)
      setGlobalLoading(true)

      try {
        const result = await mutation.mutateAsync({
          projectPath,
          command,
          args,
        })

        if (result.success && result.executionId) {
          setCurrentExecutionId(result.executionId)
          setGlobalExecutionId(result.executionId)
          onStart?.(result.executionId)
          onSuccess?.(result.executionId)
          return result.executionId
        } else {
          const error = result.error || "Command failed to start"
          setLastError(error)
          onError?.(error)
          setIsExecuting(false)
          setGlobalLoading(false)
          return null
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        setLastError(message)
        onError?.(message)
        setIsExecuting(false)
        setGlobalLoading(false)
        return null
      }
    },
    [projectPath, mutation, onStart, onSuccess, onError, setGlobalExecutionId, setGlobalLoading]
  )

  const cancel = useCallback(async () => {
    if (!currentExecutionId) return false

    try {
      const result = await cancelMutation.mutateAsync({
        executionId: currentExecutionId,
      })
      if (result.success) {
        setIsExecuting(false)
        setCurrentExecutionId(null)
        setGlobalExecutionId(null)
        setGlobalLoading(false)
      }
      return result.success
    } catch {
      return false
    }
  }, [currentExecutionId, cancelMutation, setGlobalExecutionId, setGlobalLoading])

  const reset = useCallback(() => {
    setIsExecuting(false)
    setLastError(null)
    setCurrentExecutionId(null)
    setGlobalExecutionId(null)
    setGlobalLoading(false)
  }, [setGlobalExecutionId, setGlobalLoading])

  return {
    /** Execute a command */
    execute,
    /** Cancel the current command */
    cancel,
    /** Reset state */
    reset,
    /** Whether a command is executing */
    isExecuting,
    /** Whether the mutation is pending */
    isPending: mutation.isPending,
    /** Last error message */
    lastError,
    /** Current execution ID */
    executionId: currentExecutionId,
  }
}
