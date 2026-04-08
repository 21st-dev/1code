import { useEffect, useState } from "react"
import { trpcClient } from "../trpc"

// Module-level cache for local file icons: cache key -> data URL
const fileIconCache = new Map<string, string>()
// Deduplicate concurrent fetches
const pendingFetches = new Map<string, Promise<string | null>>()

async function fetchFileIcon(
  cacheKey: string,
  filePath: string,
): Promise<string | null> {
  const cached = fileIconCache.get(cacheKey)
  if (cached) return cached

  const pending = pendingFetches.get(cacheKey)
  if (pending) return pending

  const promise = (async () => {
    try {
      const result = await trpcClient.files.readBinaryFile.query({ filePath })
      if (!result.ok) return null

      const dataUrl = `data:${result.mimeType};base64,${result.data}`
      fileIconCache.set(cacheKey, dataUrl)
      return dataUrl
    } catch {
      return null
    } finally {
      pendingFetches.delete(cacheKey)
    }
  })()

  pendingFetches.set(cacheKey, promise)
  return promise
}

/**
 * Invalidate a project's cached icon (call after upload/remove).
 * Removes all cached icon variants for that project so the hook re-fetches.
 */
export function invalidateProjectIcon(projectId: string) {
  const cachePrefix = `${projectId}:`

  for (const key of fileIconCache.keys()) {
    if (key === projectId || key.startsWith(cachePrefix)) {
      fileIconCache.delete(key)
    }
  }

  for (const key of pendingFetches.keys()) {
    if (key === projectId || key.startsWith(cachePrefix)) {
      pendingFetches.delete(key)
    }
  }
}

interface ProjectIconData {
  id?: string | null
  iconPath?: string | null
  updatedAt?: string | Date | null
}

interface UseProjectIconResult {
  /** URL to use as img src for a custom local icon */
  src: string | null
  isLoading: boolean
  hasError: boolean
}

/**
 * Hook that returns a URL for a project's custom icon.
 * - Custom local icons: fetched once and cached as data URLs
 * - No icon: returns null
 */
export function useProjectIcon(
  project: ProjectIconData | null | undefined,
): UseProjectIconResult {
  const [src, setSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!project) {
      setSrc(null)
      setIsLoading(false)
      setHasError(false)
      return
    }

    let cancelled = false

    if (project.iconPath) {
      const cacheKey = [
        project.id ?? project.iconPath,
        project.iconPath,
        project.updatedAt ? String(project.updatedAt) : "",
      ].join(":")
      const cached = fileIconCache.get(cacheKey)
      if (cached) {
        setSrc(cached)
        setIsLoading(false)
        setHasError(false)
        return
      }

      setIsLoading(true)
      setHasError(false)
      setSrc(null)

      fetchFileIcon(cacheKey, project.iconPath).then((iconSrc) => {
        if (cancelled) return
        if (iconSrc) {
          setSrc(iconSrc)
          setHasError(false)
        } else {
          setSrc(null)
          setHasError(true)
        }
        setIsLoading(false)
      })
    } else {
      setSrc(null)
      setIsLoading(false)
      setHasError(false)
    }

    return () => {
      cancelled = true
    }
  }, [project?.id, project?.iconPath, project?.updatedAt])

  return { src, isLoading, hasError }
}
