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

const MAX_OUTPUT_LINES = 10000
const LINE_TRIM_THRESHOLD = 9000 // When to start trimming
const MAX_RAW_OUTPUT_SIZE = 1024 * 1024 // 1MB
const RAW_OUTPUT_TRIM_SIZE = 512 * 1024 // Keep 512KB when trimming

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
 * Circular buffer for output lines.
 * Keeps most recent N lines, discards oldest when limit reached.
 * Prevents unbounded memory growth during long-running commands.
 *
 * @param existingLines - Current output lines array
 * @param newLine - New line to add
 * @returns Updated array with trimming applied if needed
 */
function addOutputLine(
  existingLines: OutputLine[],
  newLine: OutputLine
): OutputLine[] {
  const updated = [...existingLines, newLine]

  // Trim if we exceed threshold
  if (updated.length > MAX_OUTPUT_LINES) {
    // Keep most recent LINE_TRIM_THRESHOLD lines
    return updated.slice(updated.length - LINE_TRIM_THRESHOLD)
  }

  return updated
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
          const newLine: OutputLine = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            stream: data.stream,
            content: data.chunk,
            timestamp: Date.now(),
          }

          // Use circular buffer to prevent unbounded growth
          setOutputLines((prev) => addOutputLine(prev, newLine))

          // For rawOutput, also implement a max size to prevent memory issues
          setRawOutput((prev) => {
            const updated = prev + data.chunk
            // Keep max 1MB of raw output
            if (updated.length > MAX_RAW_OUTPUT_SIZE) {
              // Keep most recent 512KB
              return updated.slice(updated.length - RAW_OUTPUT_TRIM_SIZE)
            }
            return updated
          })

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
