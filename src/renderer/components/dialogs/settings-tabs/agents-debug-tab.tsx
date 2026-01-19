import { useState, useEffect } from "react"
import { Button } from "../../ui/button"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { Copy, FolderOpen, RefreshCw, Terminal, Check } from "lucide-react"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

export function AgentsDebugTab() {
  const [copiedPath, setCopiedPath] = useState(false)
  const [copiedInfo, setCopiedInfo] = useState(false)
  const isNarrowScreen = useIsNarrowScreen()

  // Fetch system info
  const { data: systemInfo, isLoading: isLoadingSystem } =
    trpc.debug.getSystemInfo.useQuery()

  // Fetch DB stats
  const { data: dbStats, isLoading: isLoadingDb, refetch: refetchDb } =
    trpc.debug.getDbStats.useQuery()

  // Mutations
  const clearChatsMutation = trpc.debug.clearChats.useMutation({
    onSuccess: () => {
      toast.success("All chats cleared")
      refetchDb()
    },
    onError: (error) => toast.error(error.message),
  })

  const clearAllDataMutation = trpc.debug.clearAllData.useMutation({
    onSuccess: () => {
      toast.success("All data cleared. Reloading...")
      setTimeout(() => window.location.reload(), 500)
    },
    onError: (error) => toast.error(error.message),
  })

  const openFolderMutation = trpc.debug.openUserDataFolder.useMutation({
    onError: (error) => toast.error(error.message),
  })

  const handleCopyPath = async () => {
    if (systemInfo?.userDataPath) {
      await navigator.clipboard.writeText(systemInfo.userDataPath)
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 2000)
    }
  }

  const handleCopyDebugInfo = async () => {
    const info = {
      ...systemInfo,
      dbStats,
      timestamp: new Date().toISOString(),
    }
    await navigator.clipboard.writeText(JSON.stringify(info, null, 2))
    setCopiedInfo(true)
    toast.success("Debug info copied to clipboard")
    setTimeout(() => setCopiedInfo(false), 2000)
  }

  const handleOpenDevTools = () => {
    window.desktopApi?.toggleDevTools()
  }

  const isLoading = isLoadingSystem || isLoadingDb

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div>
          <h3 className="text-lg font-semibold mb-1">Debug</h3>
          <p className="text-sm text-muted-foreground">
            System information and developer tools
          </p>
        </div>
      )}

      {/* System Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          System Info
        </h4>
        <div className="rounded-lg border bg-muted/30 divide-y">
          <InfoRow label="Version" value={systemInfo?.version} isLoading={isLoading} />
          <InfoRow
            label="Platform"
            value={systemInfo ? `${systemInfo.platform} (${systemInfo.arch})` : undefined}
            isLoading={isLoading}
          />
          <InfoRow
            label="Dev Mode"
            value={systemInfo?.isDev ? "Yes" : "No"}
            isLoading={isLoading}
          />
          <div className="flex items-center justify-between p-3">
            <span className="text-sm text-muted-foreground">userData</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono truncate max-w-[200px]">
                {isLoading ? "..." : systemInfo?.userDataPath}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyPath}
                disabled={!systemInfo?.userDataPath}
              >
                {copiedPath ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* DB Stats */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Database
        </h4>
        <div className="rounded-lg border bg-muted/30 divide-y">
          <InfoRow label="Projects" value={dbStats?.projects?.toString()} isLoading={isLoading} />
          <InfoRow label="Chats" value={dbStats?.chats?.toString()} isLoading={isLoading} />
          <InfoRow label="Sub-chats" value={dbStats?.subChats?.toString()} isLoading={isLoading} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Quick Actions
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openFolderMutation.mutate()}
            disabled={openFolderMutation.isPending}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Open userData
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenDevTools}>
            <Terminal className="h-4 w-4 mr-2" />
            DevTools
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reload
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyDebugInfo}
            disabled={isLoading}
          >
            {copiedInfo ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy Info
          </Button>
        </div>
      </div>

      {/* Toast Testing */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Toast Testing
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.info("Cancelation sent", {
                description: "Sent to John Smith",
                action: {
                  label: "Undo",
                  onClick: () => toast("Undone!"),
                },
              })
            }
          >
            Info + Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success("Success!", { description: "Operation completed" })}
          >
            Success
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.error("Error", { description: "Something went wrong" })}
          >
            Error
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast("Default toast", { description: "This is a description" })}
          >
            Default
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const id = toast.loading("Loading...", { description: "Please wait" })
              setTimeout(() => toast.dismiss(id), 3000)
            }}
          >
            Loading
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const id = toast.loading("Processing...")
              setTimeout(() => {
                toast.success("Done!", { id })
              }, 2000)
            }}
          >
            Promise
          </Button>
        </div>
      </div>

      {/* Data Management */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Data Management
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Clear all chats? Projects will be kept.")) {
                clearChatsMutation.mutate()
              }
            }}
            disabled={clearChatsMutation.isPending}
          >
            {clearChatsMutation.isPending ? "..." : "Clear Chats"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (
                confirm(
                  "Reset everything? This will clear all data.",
                )
              ) {
                clearAllDataMutation.mutate()
              }
            }}
            disabled={clearAllDataMutation.isPending}
          >
            {clearAllDataMutation.isPending ? "..." : "Reset All"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Helper component for info rows
function InfoRow({
  label,
  value,
  isLoading,
  status,
}: {
  label: string
  value?: string
  isLoading?: boolean
  status?: "success" | "warning" | "error"
}) {
  return (
    <div className="flex items-center justify-between p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${
          status === "success"
            ? "text-green-500"
            : status === "warning"
              ? "text-yellow-500"
              : status === "error"
                ? "text-red-500"
                : ""
        }`}
      >
        {isLoading ? "..." : value ?? "-"}
      </span>
    </div>
  )
}
