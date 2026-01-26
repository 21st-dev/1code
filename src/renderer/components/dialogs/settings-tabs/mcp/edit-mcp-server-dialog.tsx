"use client"

import { formatDistanceToNow } from "date-fns"
import { Eye, EyeOff, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "../../../ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../ui/dialog"
import { Input } from "../../../ui/input"
import { Label } from "../../../ui/label"
import { cn } from "../../../../lib/utils"
import { trpc } from "../../../../lib/trpc"
import type { McpServer, ScopeType } from "./types"

interface EditMcpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: McpServer | null
  scope: ScopeType
  projectPath: string | null
  onSuccess?: () => void
  onDelete?: () => void
}

export function EditMcpServerDialog({
  open,
  onOpenChange,
  server,
  scope,
  projectPath,
  onSuccess,
  onDelete,
}: EditMcpServerDialogProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [bearerToken, setBearerToken] = useState("")

  const updateMutation = trpc.claude.updateMcpServer.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("MCP server updated")
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.error || "Failed to update server")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update server")
    },
  })

  const removeMutation = trpc.claude.removeMcpServer.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("MCP server removed")
        onOpenChange(false)
        onDelete?.()
      } else {
        toast.error(result.error || "Failed to remove server")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove server")
    },
  })

  const setTokenMutation = trpc.claude.setMcpBearerToken.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Token updated")
        setBearerToken("")
        onSuccess?.()
      } else {
        toast.error(result.error || "Failed to update token")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update token")
    },
  })

  const startOAuthMutation = trpc.claude.startMcpOAuth.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Authentication successful")
        onSuccess?.()
      } else {
        toast.error(result.error || "Authentication failed")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Authentication failed")
    },
  })

  const handleToggleDisabled = () => {
    if (!server) return
    const isCurrentlyDisabled = server.config._disabled === true
    updateMutation.mutate({
      name: server.name,
      scope,
      projectPath: projectPath || undefined,
      disabled: !isCurrentlyDisabled,
    })
  }

  const handleDelete = () => {
    if (!server) return
    removeMutation.mutate({
      name: server.name,
      scope,
      projectPath: projectPath || undefined,
    })
  }

  const handleSetToken = () => {
    if (!server || !bearerToken.trim()) return
    setTokenMutation.mutate({
      name: server.name,
      scope,
      projectPath: projectPath || undefined,
      token: bearerToken.trim(),
    })
  }

  const handleOAuth = () => {
    if (!server) return
    startOAuthMutation.mutate({
      serverName: server.name,
      projectPath: projectPath || "__global__",
    })
  }

  // Server config info
  const isStdio = !!server?.config.command
  const isHttp = !!server?.config.url
  const authType = server?.config.authType as string | undefined
  const hasOAuthToken = !!(server?.config._oauth as Record<string, unknown>)?.accessToken
  const oauthExpiresAt = (server?.config._oauth as Record<string, unknown>)?.expiresAt as number | undefined
  const isDisabled = server?.config._disabled === true

  const tokenExpiryText = useMemo(() => {
    if (!oauthExpiresAt) return null
    const expiresDate = new Date(oauthExpiresAt * 1000)
    if (expiresDate < new Date()) {
      return "Token expired"
    }
    return `Expires ${formatDistanceToNow(expiresDate, { addSuffix: true })}`
  }, [oauthExpiresAt])

  if (!server) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit MCP Server</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Server Info */}
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{server.name}</span>
              {server.serverInfo?.version && (
                <span className="text-xs text-muted-foreground">
                  v{server.serverInfo.version}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {isStdio && (
                <>
                  <span className="font-mono">{server.config.command as string}</span>
                  {(server.config.args as string[])?.length > 0 && (
                    <span className="font-mono"> {(server.config.args as string[]).join(" ")}</span>
                  )}
                </>
              )}
              {isHttp && (
                <span className="font-mono break-all">{server.config.url as string}</span>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  server.status === "connected" && "bg-foreground",
                  server.status !== "connected" && "bg-muted-foreground/50",
                )}
              />
              <span className="text-sm">
                {server.status === "connected" && "Connected"}
                {server.status === "needs-auth" && "Needs authentication"}
                {server.status === "failed" && "Failed to connect"}
                {server.status === "pending" && "Connecting..."}
                {server.status === "disabled" && "Disabled"}
              </span>
            </div>
            {server.error && (
              <p className="text-xs text-muted-foreground">{server.error}</p>
            )}
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label>Enabled</Label>
              <p className="text-xs text-muted-foreground">
                {isDisabled ? "Server is disabled and won't be loaded" : "Server is active"}
              </p>
            </div>
            <Button
              variant={isDisabled ? "default" : "outline"}
              size="sm"
              onClick={handleToggleDisabled}
              disabled={updateMutation.isPending}
            >
              {isDisabled ? "Enable" : "Disable"}
            </Button>
          </div>

          {/* Authentication Section */}
          {isHttp && (
            <div className="space-y-3 pt-2 border-t border-border">
              <Label>Authentication</Label>

              {/* OAuth Status */}
              {(authType === "oauth" || hasOAuthToken) && (
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          hasOAuthToken ? "bg-foreground" : "bg-muted-foreground/50"
                        )}
                      />
                      <span className="text-sm">
                        {hasOAuthToken ? "OAuth Connected" : "Not authenticated"}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOAuth}
                      disabled={startOAuthMutation.isPending}
                    >
                      {hasOAuthToken ? "Reauthenticate" : "Authenticate"}
                    </Button>
                  </div>
                  {tokenExpiryText && (
                    <p className="text-xs text-muted-foreground">{tokenExpiryText}</p>
                  )}
                </div>
              )}

              {/* Bearer Token */}
              {(authType === "bearer" || server.needsAuth) && !hasOAuthToken && (
                <div className="space-y-2">
                  <Label htmlFor="bearerToken">Bearer Token / API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="bearerToken"
                        type={showToken ? "text" : "password"}
                        value={bearerToken}
                        onChange={(e) => setBearerToken(e.target.value)}
                        placeholder="Enter new token..."
                        className="pr-16"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        {bearerToken && (
                          <button
                            type="button"
                            onClick={() => setBearerToken("")}
                            className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={handleSetToken}
                      disabled={!bearerToken.trim() || setTokenMutation.isPending}
                    >
                      Save
                    </Button>
                  </div>
                  {server.config.headers && (
                    <p className="text-xs text-muted-foreground">
                      A token is already configured. Enter a new one to replace it.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tools */}
          {server.tools.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label>Available Tools ({server.tools.length})</Label>
              <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-muted/50 rounded-lg">
                {server.tools.map((tool) => (
                  <div
                    key={tool}
                    className="text-xs text-muted-foreground font-mono py-0.5"
                  >
                    {tool}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete Section */}
          <div className="pt-4 border-t border-border">
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove Server
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Are you sure?
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? "Removing..." : "Yes, Remove"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
