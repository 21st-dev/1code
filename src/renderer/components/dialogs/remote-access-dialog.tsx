// src/renderer/components/dialogs/remote-access-dialog.tsx

import { useAtom } from "jotai"
import { useEffect, useCallback } from "react"
import { Globe, Copy, Loader2, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Button } from "../ui/button"
import {
  remoteAccessStatusAtom,
  remoteAccessDialogOpenAtom,
  type RemoteAccessStatus,
} from "../../lib/atoms/remote-access"
import { toast } from "sonner"

export function RemoteAccessDialog() {
  const [open, setOpen] = useAtom(remoteAccessDialogOpenAtom)
  const [status, setStatus] = useAtom(remoteAccessStatusAtom)

  // Fetch initial status and subscribe to changes
  useEffect(() => {
    if (!window.desktopApi) return

    // Get initial status
    window.desktopApi.getRemoteAccessStatus?.().then(setStatus)

    // Subscribe to status changes
    const unsubscribe = window.desktopApi.onRemoteAccessStatusChange?.(setStatus)
    return unsubscribe
  }, [setStatus])

  const handleEnable = useCallback(async () => {
    try {
      await window.desktopApi?.enableRemoteAccess?.()
    } catch (error) {
      toast.error("Failed to enable remote access")
    }
  }, [])

  const handleDisable = useCallback(async () => {
    try {
      await window.desktopApi?.disableRemoteAccess?.()
    } catch (error) {
      toast.error("Failed to disable remote access")
    }
  }, [])

  const handleCopyUrl = useCallback(() => {
    if (status.status === "active") {
      navigator.clipboard.writeText(status.url)
      toast.success("URL copied to clipboard")
    }
  }, [status])

  const handleCopyPin = useCallback(() => {
    if (status.status === "active") {
      navigator.clipboard.writeText(status.pin)
      toast.success("PIN copied to clipboard")
    }
  }, [status])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Remote Access
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {status.status === "disabled" && (
            <>
              <p className="text-sm text-muted-foreground">
                Access your desktop from any browser.
              </p>
              <Button onClick={handleEnable} className="w-full">
                Enable Remote Access
              </Button>
            </>
          )}

          {status.status === "downloading" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Downloading cloudflared...</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            </div>
          )}

          {status.status === "starting" && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Starting tunnel...</span>
            </div>
          )}

          {status.status === "active" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Active</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                    {status.url}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopyUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">PIN</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-center text-2xl font-mono tracking-widest">
                    {status.pin}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopyPin}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Connected clients: {status.clients}
              </div>

              <Button
                onClick={handleDisable}
                variant="destructive"
                className="w-full"
              >
                Disable Remote Access
              </Button>
            </>
          )}

          {status.status === "error" && (
            <>
              <div className="flex items-center gap-2 text-destructive">
                <X className="h-4 w-4" />
                <span className="text-sm">{status.message}</span>
              </div>
              <Button onClick={handleEnable} className="w-full">
                Try Again
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
