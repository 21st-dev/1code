import { useEffect, useState } from "react"

/**
 * Default to local-only until main confirms otherwise. This prevents renderer
 * hooks from firing hosted requests during startup.
 */
export function useLocalOnlyMode(): boolean {
  return useLocalOnlyModeState().isLocalOnly
}

export function useLocalOnlyModeState(): {
  isLocalOnly: boolean
  isResolved: boolean
} {
  const [isLocalOnly, setIsLocalOnly] = useState(true)
  const [isResolved, setIsResolved] = useState(false)

  useEffect(() => {
    let cancelled = false

    window.desktopApi
      ?.isLocalOnlyMode?.()
      .then((value) => {
        if (!cancelled) {
          setIsLocalOnly(value !== false)
          setIsResolved(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLocalOnly(true)
          setIsResolved(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { isLocalOnly, isResolved }
}
