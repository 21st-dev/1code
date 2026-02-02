// src/renderer/components/ui/connection-error-overlay.tsx

import { useMemo } from "react"
import { useAtomValue } from "jotai"
import { remoteConnectionStateAtom } from "../../lib/atoms/remote-access"
import { WifiOff, RefreshCw } from "lucide-react"
import { cn } from "../../lib/utils"

export function ConnectionErrorOverlay() {
  const connectionState = useAtomValue(remoteConnectionStateAtom)

  // Only show overlay in disconnected state
  const isVisible = connectionState === "disconnected"

  // Don't render if not visible (save DOM nodes)
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 bg-card border border-border rounded-xl shadow-lg max-w-md mx-4">
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <WifiOff className="h-8 w-8 text-destructive" />
        </div>

        {/* Text */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Connection Lost</h2>
          <p className="text-sm text-muted-foreground">
            Unable to connect to the desktop app. Please make sure the desktop app is running and remote access is enabled.
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className={cn(
            "h-2 w-2 rounded-full",
            connectionState === "disconnected" ? "bg-destructive" : "bg-green-500"
          )} />
          <span className="capitalize">{connectionState}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Reconnect
        </button>
      </div>
    </div>
  )
}
