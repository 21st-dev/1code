import { useState } from "react"
import { Button } from "./ui/button"

type StartupBlockedState = {
  status: "blocked"
  reason: "packaging-preflight"
  message: string
}

export function OpenCodexStartupBlocker({
  startupState,
  onRetry,
}: {
  startupState: StartupBlockedState
  onRetry: () => Promise<void>
}) {
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          OpenCodex Startup Blocked
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Migration or packaging preflight needs attention
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          OpenCodex stopped before entering the workspace because the local owned-data layout is incomplete or out of date.
          Fix the issue below and retry from this screen instead of falling back to legacy directories.
        </p>
        <div className="mt-6 rounded-xl border border-border/80 bg-muted/40 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Blocking Detail
          </p>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-foreground">
            {startupState.message}
          </pre>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? "Retrying startup..." : "Retry startup"}
          </Button>
          <p className="text-xs text-muted-foreground">
            This keeps recovery inside the UI and re-runs the packaging preflight in place.
          </p>
        </div>
      </div>
    </div>
  )
}
