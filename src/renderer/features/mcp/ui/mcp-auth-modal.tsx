"use client"

import React, { useState, useEffect } from "react"
import { useAtom, useSetAtom } from "jotai"
import { Key, Loader2, Trash2 } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { mcpAuthModalOpenAtom, mcpAuthModalServerIdAtom } from "../atoms"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"

export function McpAuthModal() {
  const [isOpen, setIsOpen] = useAtom(mcpAuthModalOpenAtom)
  const [serverId, setServerId] = useAtom(mcpAuthModalServerIdAtom)
  const [credentials, setCredentials] = useState<Record<string, string>>({})

  const utils = trpc.useUtils()

  const { data: server } = trpc.mcp.getServer.useQuery(
    { serverId: serverId! },
    { enabled: !!serverId && isOpen }
  )

  const saveMutation = trpc.mcp.saveCredentials.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      utils.mcp.getServer.invalidate({ serverId: serverId! })
      handleClose()
    },
  })

  const clearMutation = trpc.mcp.clearCredentials.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      utils.mcp.getServer.invalidate({ serverId: serverId! })
      handleClose()
    },
  })

  // Initialize credentials state when server changes
  useEffect(() => {
    if (server?.credentialEnvVars) {
      const initial: Record<string, string> = {}
      for (const key of server.credentialEnvVars) {
        initial[key] = ""
      }
      setCredentials(initial)
    }
  }, [server?.credentialEnvVars])

  const handleClose = () => {
    setIsOpen(false)
    setServerId(null)
    setCredentials({})
  }

  const handleSave = () => {
    if (serverId) {
      saveMutation.mutate({ serverId, credentials })
    }
  }

  const handleClear = () => {
    if (serverId) {
      clearMutation.mutate({ serverId })
    }
  }

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }))
  }

  const hasAnyCredentials = Object.values(credentials).some((v) => v.trim())
  const isPending = saveMutation.isPending || clearMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Configure {server?.name || "Server"} Authentication
          </DialogTitle>
          <DialogDescription>
            Enter the credentials required by this MCP server. These will be securely
            stored and used when the server starts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {server?.credentialEnvVars.map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key} className="text-sm font-medium">
                {key}
              </Label>
              <Input
                id={key}
                type="password"
                placeholder={`Enter ${key}`}
                value={credentials[key] || ""}
                onChange={(e) => handleCredentialChange(key, e.target.value)}
                disabled={isPending}
              />
            </div>
          ))}

          {server?.credentialEnvVars.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              This server has no credential requirements.
            </p>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          {server?.authStatus === "configured" && (
            <Button
              variant="destructive"
              onClick={handleClear}
              disabled={isPending}
              className="mr-auto"
            >
              {clearMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Clear Credentials
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !hasAnyCredentials}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Key className="h-4 w-4 mr-2" />
            )}
            Save Credentials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
