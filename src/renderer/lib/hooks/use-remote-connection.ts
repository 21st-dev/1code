// src/renderer/lib/hooks/use-remote-connection.ts

import { useEffect } from "react"
import { useSetAtom } from "jotai"
import { remoteConnectionStateAtom } from "../atoms/remote-access"
import { onConnectionStateChange, isRemoteMode } from "../remote-transport"

/**
 * Hook to track remote connection state
 * Only active in remote mode (web browser)
 */
export function useRemoteConnection(): void {
  const setConnectionState = useSetAtom(remoteConnectionStateAtom)

  useEffect(() => {
    // Only track connection in remote mode
    if (!isRemoteMode()) return

    // Subscribe to connection state changes
    const unsubscribe = onConnectionStateChange((state) => {
      console.log("[useRemoteConnection] State changed:", state)
      setConnectionState(state)
    })

    return () => {
      unsubscribe()
    }
  }, [setConnectionState])
}
