import { useState, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../../ui/dialog"
import { Button } from "../../../ui/button"
import { Input } from "../../../ui/input"
import { Label } from "../../../ui/label"
import { Switch } from "../../../ui/switch"
import { trpc } from "../../../../lib/trpc"
import { toast } from "sonner"
import { cn } from "../../../../lib/utils"
import { Eye, EyeOff, Trash2 } from "lucide-react"
import { DeleteServerConfirm } from "./delete-server-confirm"
import { StatusDot, getStatusText } from "./mcp-server-row"
import type { McpServer, ScopeType } from "./types"

interface EditMcpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: McpServer | null
  scope: ScopeType
  projectPath?: string
  onServerUpdated?: () => void
  onServerDeleted?: () => void
}

export function EditMcpServerDialog({
  open,
  onOpenChange,
  server,
  scope,
  projectPath,
  onServerUpdated,
  onServerDeleted,
}: EditMcpServerDialogProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [bearerToken, setBearerToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [isSavingToken, setIsSavingToken] = useState(false)
  const [isStartingOAuth, setIsStartingOAuth] = useState(false)

  const updateServerMutation = trpc.claude.updateMcpServer.useMutation()
  const removeServerMutation = trpc.claude.removeMcpServer.useMutation()
  const setBearerTokenMutation = trpc.claude.setMcpBearerToken.useMutation()
  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation()

  const isDisabled = useMemo(() => {
    if (!server?.config) return false
    return (server.config as Record<string, unknown>).disabled === true
  }, [server?.config])

  if (!server) return null

  const isConnected = server.status === "connected"
  const hasTools = server.tools.length > 0

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      await updateServerMutation.mutateAsync({
        name: server.name,
        scope,
        projectPath,
        disabled: !enabled,
      })
      toast.success(enabled ? "Server enabled" : "Server disabled")
      onServerUpdated?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update server"
      toast.error(message)
    }
  }

  const handleSetBearerToken = async () => {
    if (!bearerToken.trim()) return
    setIsSavingToken(true)
    try {
      await setBearerTokenMutation.mutateAsync({
        name: server.name,
        scope,
        projectPath,
        token: bearerToken.trim(),
      })
      toast.success("Bearer token saved")
      setBearerToken("")
      onServerUpdated?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save token"
      toast.error(message)
    } finally {
      setIsSavingToken(false)
    }
  }

  const handleStartOAuth = async () => {
    setIsStartingOAuth(true)
    try {
      const result = await startOAuthMutation.mutateAsync({
        serverName: server.name,
        projectPath: projectPath ?? "__global__",
      })
      if (result.success) {
        toast.success("Authentication started, check your browser")
        onServerUpdated?.()
      } else {
        toast.error(result.error || "OAuth failed")
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed"
      toast.error(message)
    } finally {
      setIsStartingOAuth(false)
    }
  }

  const handleDelete = async () => {
    try {
      await removeServerMutation.mutateAsync({
        name: server.name,
        scope,
        projectPath,
      })
      toast.success("Server removed", { description: server.name })
      onOpenChange(false)
      onServerDeleted?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove server"
      toast.error(message)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StatusDot status={server.status} />
              {server.name}
            </DialogTitle>
            <DialogDescription>
              {getStatusText(server.status)}
              {server.serverInfo?.version && ` - v${server.serverInfo.version}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Enable/Disable */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Enabled</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Disable to prevent this server from connecting
                </p>
              </div>
              <Switch
                checked={!isDisabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>

            {/* Error */}
            {server.error && (
              <div>
                <Label className="text-red-500">Error</Label>
                <div className="mt-1.5 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
                  <p className="text-xs text-red-400 font-mono break-all">
                    {server.error}
                  </p>
                </div>
              </div>
            )}

            {/* Authentication */}
            <div className="space-y-3">
              <Label>Authentication</Label>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleStartOAuth}
                  disabled={isStartingOAuth}
                >
                  {isStartingOAuth ? "Starting OAuth..." : "Start OAuth Flow"}
                </Button>

                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="Set bearer token..."
                    className="font-mono pr-20"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showToken ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={handleSetBearerToken}
                      disabled={!bearerToken.trim() || isSavingToken}
                    >
                      {isSavingToken ? "..." : "Set"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tools list */}
            {hasTools && (
              <div>
                <Label>Tools ({server.tools.length})</Label>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {server.tools.map((tool) => {
                    const toolName = typeof tool === "string" ? tool : tool.name
                    return (
                      <span
                        key={toolName}
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {toolName}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Delete */}
            <div className="pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Server
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteServerConfirm
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        serverName={server.name}
        onConfirm={handleDelete}
        isDeleting={removeServerMutation.isPending}
      />
    </>
  )
}
