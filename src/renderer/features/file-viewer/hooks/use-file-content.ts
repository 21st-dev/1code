import { useMemo } from "react"
import { trpc } from "../../../lib/trpc"

/**
 * Error reasons for file loading failures
 */
export type FileLoadError =
  | "not-found"
  | "too-large"
  | "binary"
  | "unknown"

/**
 * Result of file content loading
 */
export interface FileContentResult {
  content: string | null
  isLoading: boolean
  error: FileLoadError | null
  byteLength: number | null
  refetch: () => void
}

/**
 * Get user-friendly error message for file load errors
 */
export function getErrorMessage(error: FileLoadError): string {
  switch (error) {
    case "not-found":
      return "File not found"
    case "too-large":
      return "File is too large to display (max 2 MB)"
    case "binary":
      return "Cannot display binary file"
    case "unknown":
    default:
      return "Failed to load file"
  }
}

/**
 * Hook to fetch file content from the backend
 * Uses the files.readTextFile procedure with absolute path
 */
export function useFileContent(
  projectPath: string | null,
  filePath: string | null,
): FileContentResult {
  // Build absolute path like DataViewerSidebar does
  const absolutePath = useMemo(() => {
    if (!projectPath || !filePath) return null
    const path = filePath.startsWith("/")
      ? filePath
      : `${projectPath}/${filePath}`
    console.log("[useFileContent] Building path:", { projectPath, filePath, absolutePath: path })
    return path
  }, [projectPath, filePath])

  const enabled = !!absolutePath

  const { data, isLoading, error, refetch } = trpc.files.readTextFile.useQuery(
    { filePath: absolutePath || "" },
    {
      enabled,
      staleTime: 30000, // Cache for 30 seconds
      refetchOnWindowFocus: false,
    },
  )

  // Return result based on query state
  return useMemo((): FileContentResult => {
    console.log("[useFileContent] Computing result:", { enabled, isLoading, error, data })

    if (!enabled) {
      return {
        content: null,
        isLoading: false,
        error: null,
        byteLength: null,
        refetch: () => {},
      }
    }

    if (isLoading) {
      return {
        content: null,
        isLoading: true,
        error: null,
        byteLength: null,
        refetch,
      }
    }

    if (error) {
      console.error("[useFileContent] Query error:", error)
      return {
        content: null,
        isLoading: false,
        error: "unknown",
        byteLength: null,
        refetch,
      }
    }

    if (!data) {
      console.log("[useFileContent] No data returned")
      return {
        content: null,
        isLoading: false,
        error: "unknown",
        byteLength: null,
        refetch,
      }
    }

    if (data.ok) {
      console.log("[useFileContent] Success:", data.byteLength, "bytes")
      return {
        content: data.content,
        isLoading: false,
        error: null,
        byteLength: data.byteLength,
        refetch,
      }
    }

    console.log("[useFileContent] Server returned error:", data.reason)
    return {
      content: null,
      isLoading: false,
      error: data.reason as FileLoadError,
      byteLength: null,
      refetch,
    }
  }, [enabled, isLoading, error, data, refetch])
}
