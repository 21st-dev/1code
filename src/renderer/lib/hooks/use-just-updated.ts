import { useEffect, useCallback } from "react"
import { useAtom } from "jotai"
import { justUpdatedAtom, justUpdatedVersionAtom } from "../atoms"
import { getOpenCodexChangelogUrl } from "../updates/changelog-url"

const LAST_VERSION_KEY = "app:last-version"

/**
 * Hook to detect if app was just updated
 * Compares current version with stored version and shows "What's New" banner
 */
export function useJustUpdated() {
  const [justUpdated, setJustUpdated] = useAtom(justUpdatedAtom)
  const [justUpdatedVersion, setJustUpdatedVersion] = useAtom(
    justUpdatedVersionAtom,
  )

  // Check for update on mount
  useEffect(() => {
    const checkForUpdate = async () => {
      const api = window.desktopApi
      if (!api) return

      try {
        const releaseMetadata = await api.getReleaseMetadata?.()
        const currentVersion = releaseMetadata?.currentVersion ?? await api.getVersion()
        const lastVersion = localStorage.getItem(LAST_VERSION_KEY)

        if (
          releaseMetadata?.previousVersion &&
          releaseMetadata.previousVersion !== currentVersion &&
          lastVersion !== currentVersion
        ) {
          setJustUpdated(true)
          setJustUpdatedVersion(currentVersion)
        } else if (lastVersion && lastVersion !== currentVersion) {
          setJustUpdated(true)
          setJustUpdatedVersion(currentVersion)
        }

        localStorage.setItem(LAST_VERSION_KEY, currentVersion)
      } catch (error) {
        console.error("[JustUpdated] Error checking version:", error)
      }
    }

    checkForUpdate()
  }, [setJustUpdated, setJustUpdatedVersion])

  // Dismiss the "What's New" banner
  const dismissJustUpdated = useCallback(() => {
    setJustUpdated(false)
    setJustUpdatedVersion(null)
  }, [setJustUpdated, setJustUpdatedVersion])

  // Open changelog in browser
  const openChangelog = useCallback(async () => {
    const api = window.desktopApi
    if (api) {
      const baseUrl = await api.getApiBaseUrl()
      await api.openExternal(getOpenCodexChangelogUrl(baseUrl, justUpdatedVersion))
    }
    dismissJustUpdated()
  }, [justUpdatedVersion, dismissJustUpdated])

  return {
    justUpdated,
    justUpdatedVersion,
    dismissJustUpdated,
    openChangelog,
  }
}
