/**
 * useCommandOutput Hook
 *
 * Custom hook for subscribing to command output stream.
 * Wraps trpc.speckit.onCommandOutput.useSubscription with state management.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { useState, useCallback, useEffect } from "react"
import { useSetAtom } from "jotai"
import { trpc } from "@/lib/trpc"
import { speckitLoadingAtom, speckitExecutionIdAtom } from "../atoms"
import type { CommandOutputEvent } from "../types"

interface OutputLine {
  /** Unique line ID */
  id: string
  /** Output stream (stdout or stderr) */
  stream: "stdout" | "stderr"
  /** Line content */
  content: string
  /** Timestamp */
  timestamp: number
}

interface UseCommandOutputOptions {
  /** Execution ID to subscribe to */
  executionId: string | null
  /** Callback when output is received */
  onOutput?: (event: CommandOutputEvent) => void
  /** Callback when command completes */
  onComplete?: () => void
  /** Callback when error occurs */
  onError?: (error: Error) => void
}

/**
 * Hook to subscribe to command output stream
 *
 * Streams stdout/stderr from running ii-spec commands.
 */
export function useCommandOutput({
  executionId,
  onOutput,
  onComplete,
  onError,
}: UseCommandOutputOptions) {
  const [outputLines, setOutputLines] = useState<OutputLine[]>([])
  const [rawOutput, setRawOutput] = useState("")
  const [isComplete, setIsComplete] = useState(false)
  const [hasError, setHasError] = useState(false)

  const setGlobalLoading = useSetAtom(speckitLoadingAtom)
  const setGlobalExecutionId = useSetAtom(speckitExecutionIdAtom)

  // Reset state when execution ID changes
  useEffect(() => {
    if (executionId) {
      setOutputLines([])
      setRawOutput("")
      setIsComplete(false)
      setHasError(false)
    }
  }, [executionId])

  // Subscribe to command output
  trpc.speckit.onCommandOutput.useSubscription(
    { executionId: executionId || "" },
    {
      enabled: !!executionId && !isComplete,
      onData: (data) => {
        if (data.done) {
          setIsComplete(true)
          setGlobalLoading(false)
          setGlobalExecutionId(null)
          onComplete?.()
          return
        }

        if (data.chunk) {
          // Add to output lines
          const newLine: OutputLine = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            stream: data.stream,
            content: data.chunk,
            timestamp: Date.now(),
          }

          setOutputLines((prev) => [...prev, newLine])
          setRawOutput((prev) => prev + data.chunk)

          // Check for error indicators
          if (data.stream === "stderr") {
            setHasError(true)
          }

          onOutput?.(data)
        }
      },
      onError: (error) => {
        setIsComplete(true)
        setHasError(true)
        setGlobalLoading(false)
        setGlobalExecutionId(null)
        onError?.(error instanceof Error ? error : new Error(String(error)))
      },
    }
  )

  const clearOutput = useCallback(() => {
    setOutputLines([])
    setRawOutput("")
    setIsComplete(false)
    setHasError(false)
  }, [])

  return {
    /** Output lines with metadata */
    outputLines,
    /** Raw concatenated output */
    rawOutput,
    /** Whether the command has completed */
    isComplete,
    /** Whether there were any stderr outputs */
    hasError,
    /** Clear output */
    clearOutput,
    /** Whether actively receiving output */
    isStreaming: !!executionId && !isComplete,
  }
}

/**
 * Hook to get formatted output for display
 */
export function useFormattedOutput(outputLines: OutputLine[]) {
  // Split lines by newline characters for proper display
  const formattedLines = outputLines.flatMap((line) => {
    const parts = line.content.split("\n")
    return parts.map((part, index) => ({
      ...line,
      id: `${line.id}-${index}`,
      content: part,
    }))
  }).filter((line) => line.content.trim() !== "")

  return formattedLines
}
