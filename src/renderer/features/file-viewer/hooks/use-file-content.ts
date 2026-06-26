import { useMemo, useEffect, useRef } from "react"
import type { TranslationKey } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"

/**
 * Error reasons for file loading failures
 */
export type FileLoadError = "not-found" | "too-large" | "binary" | "unknown"

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
 * Get the translation key for a file load error.
 */
export function getErrorMessageKey(error: FileLoadError): TranslationKey {
  switch (error) {
    case "not-found":
      return "fileViewer.error.notFound"
    case "too-large":
      return "fileViewer.error.tooLarge"
    case "binary":
      return "fileViewer.error.binary"
    case "unknown":
    default:
      return "fileViewer.error.unknown"
  }
}

/**
 * Hook to fetch file content from the backend
 * Uses the files.readTextFile procedure with absolute path
 * Auto-refetches when the file changes on disk
 */
export function useFileContent(
  projectPath: string | null,
  filePath: string | null,
): FileContentResult {
  const absolutePath = useMemo(() => {
    if (!projectPath || !filePath) return null
    return filePath.startsWith("/")
      ? filePath
      : `${projectPath}/${filePath}`
  }, [projectPath, filePath])

  const enabled = !!absolutePath

  const { data, isLoading, error, refetch } = trpc.files.readTextFile.useQuery(
    { filePath: absolutePath || "", projectPath: projectPath || "" },
    {
      enabled: enabled && !!projectPath,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  )

  const refetchRef = useRef(refetch)
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  // Compute relative path for matching against file change events
  const relativePath = useMemo(() => {
    if (!projectPath || !filePath) return null
    if (!filePath.startsWith("/")) return filePath
    const projectPathWithSep = projectPath.endsWith("/") ? projectPath : `${projectPath}/`
    if (filePath.startsWith(projectPathWithSep)) {
      return filePath.slice(projectPathWithSep.length)
    }
    if (filePath === projectPath) return ""
    return filePath
  }, [projectPath, filePath])

  // Subscribe to file changes and refetch when the viewed file changes
  trpc.files.watchChanges.useSubscription(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath && !!relativePath,
      onData: (change) => {
        if (change.filename === relativePath) {
          refetchRef.current()
        }
      },
    },
  )

  return useMemo((): FileContentResult => {
    if (!enabled) {
      return { content: null, isLoading: false, error: null, byteLength: null, refetch: () => {} }
    }

    if (isLoading) {
      return { content: null, isLoading: true, error: null, byteLength: null, refetch }
    }

    if (error) {
      const errorMessage = error.message?.toLowerCase() || ""
      const isNotFound = errorMessage.includes("enoent") ||
                         errorMessage.includes("not found") ||
                         errorMessage.includes("no such file")
      return {
        content: null,
        isLoading: false,
        error: isNotFound ? "not-found" : "unknown",
        byteLength: null,
        refetch,
      }
    }

    if (!data) {
      return { content: null, isLoading: false, error: "unknown", byteLength: null, refetch }
    }

    if (data.ok) {
      return { content: data.content, isLoading: false, error: null, byteLength: data.byteLength, refetch }
    }

    return {
      content: null,
      isLoading: false,
      error: data.reason as FileLoadError,
      byteLength: null,
      refetch,
    }
  }, [enabled, isLoading, error, data, refetch])
}
